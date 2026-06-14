import { buildSimulation } from './build.js';
import { streamSeed } from './random.js';
import { deriveRep, histogram, quantile, type Histogram } from './detail.js';
import type { SimEvent } from './events.js';
import type { SimModel } from './model.js';

export interface RunSettings {
  /** Total run length in model time units, including warm-up. */
  horizon: number;
  /** Statistics collected before this time are discarded. */
  warmup: number;
  replications: number;
  seed: number;
}

export interface MetricSummary {
  mean: number;
  /** 95% CI half-width across replications (normal approximation). */
  ci95: number;
}

export interface DetailStats {
  percentiles: Record<string, Record<string, { p50: number; p90: number; p95: number }>>;
  distributions: Record<string, Record<string, Histogram>>;
  series: Record<string, Record<string, number[]>>;
  buckets: number;
}
export interface ExperimentOptions { detailed?: boolean; buckets?: number }

export interface ExperimentResult {
  replications: number;
  nodes: Record<string, Record<string, MetricSummary>>;
  detail?: DetailStats;
}

const SAMPLE_CAP = 50_000;

export function runExperiment(
  model: SimModel,
  s: RunSettings,
  onProgress?: (completed: number, total: number) => void,
  options?: ExperimentOptions,
): ExperimentResult {
  if (s.warmup >= s.horizon) throw new Error('warmup must be shorter than horizon');
  if (s.replications < 1) throw new Error('replications must be >= 1');
  const perRep: Record<string, Record<string, number>>[] = [];

  const detailed = options?.detailed ?? false;
  const buckets = options?.buckets ?? 100;
  const queueIds = new Set(model.nodes.filter((n) => n.type === 'queue').map((n) => n.id));
  const sinkIds = new Set(model.nodes.filter((n) => n.type === 'sink').map((n) => n.id));
  const resourceIds = new Set(model.nodes.filter((n) => n.type === 'resource').map((n) => n.id));
  const waitPool: Record<string, number[]> = {};
  const tisPool: Record<string, number[]> = {};
  const queueSeriesSum: Record<string, number[]> = {};
  const utilSeriesSum: Record<string, number[]> = {};
  const pushCapped = (pool: Record<string, number[]>, id: string, xs: number[]): void => {
    const arr = (pool[id] ??= []);
    for (const x of xs) if (arr.length < SAMPLE_CAP) arr.push(x);
  };
  const addSeries = (sum: Record<string, number[]>, id: string, xs: number[]): void => {
    const arr = (sum[id] ??= new Array<number>(buckets).fill(0));
    for (let i = 0; i < buckets; i++) arr[i]! += xs[i] ?? 0;
  };

  for (let r = 0; r < s.replications; r++) {
    const events: SimEvent[] = [];
    const built = buildSimulation(model, streamSeed(s.seed, `rep-${r}`), detailed ? (e) => events.push(e) : undefined);
    if (s.warmup > 0) { built.run(s.warmup); built.resetStats(); }
    built.run(s.horizon);
    perRep.push(built.summaries());
    if (detailed) {
      const d = deriveRep(events, queueIds, sinkIds, resourceIds, s.warmup, s.horizon, buckets);
      for (const id of Object.keys(d.wait)) pushCapped(waitPool, id, d.wait[id]!);
      for (const id of Object.keys(d.tis)) pushCapped(tisPool, id, d.tis[id]!);
      for (const id of Object.keys(d.queueSeries)) addSeries(queueSeriesSum, id, d.queueSeries[id]!);
      for (const id of Object.keys(d.utilSeries)) addSeries(utilSeriesSum, id, d.utilSeries[id]!);
    }
    onProgress?.(r + 1, s.replications);
  }

  // ---- existing mean/CI aggregation (UNCHANGED) ----
  const result: ExperimentResult = { replications: s.replications, nodes: {} };
  const first = perRep[0]!;
  for (const nodeId of Object.keys(first)) {
    result.nodes[nodeId] = {};
    for (const metric of Object.keys(first[nodeId]!)) {
      const xs = perRep.map((rep) => rep[nodeId]![metric]!);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance = xs.length > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1) : 0;
      result.nodes[nodeId]![metric] = { mean, ci95: 1.96 * Math.sqrt(variance / xs.length) };
    }
  }

  if (detailed) {
    const percentiles: DetailStats['percentiles'] = {};
    const distributions: DetailStats['distributions'] = {};
    const series: DetailStats['series'] = {};
    const pct = (xs: number[]) => { const s2 = [...xs].sort((a, b) => a - b); return { p50: quantile(s2, 0.5), p90: quantile(s2, 0.9), p95: quantile(s2, 0.95) }; };
    for (const [id, xs] of Object.entries(waitPool)) {
      (percentiles[id] ??= {})['wait'] = pct(xs);
      (distributions[id] ??= {})['wait'] = histogram(xs);
    }
    for (const [id, xs] of Object.entries(tisPool)) {
      (percentiles[id] ??= {})['timeInSystem'] = pct(xs);
      (distributions[id] ??= {})['timeInSystem'] = histogram(xs);
    }
    for (const [id, sum] of Object.entries(queueSeriesSum)) (series[id] ??= {})['queueLength'] = sum.map((v) => v / s.replications);
    for (const [id, sum] of Object.entries(utilSeriesSum)) (series[id] ??= {})['utilization'] = sum.map((v) => v / s.replications);
    result.detail = { percentiles, distributions, series, buckets };
  }
  return result;
}
