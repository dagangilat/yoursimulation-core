import type { SimEvent } from './events.js';

export function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

export interface Histogram { binWidth: number; counts: number[] }
export function histogram(samples: number[], bins = 40): Histogram {
  if (samples.length === 0) return { binWidth: 0, counts: [] };
  const max = Math.max(...samples);
  if (max <= 0) return { binWidth: 0, counts: [samples.length] };
  const binWidth = max / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const x of samples) {
    let i = Math.floor(x / binWidth);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    counts[i]!++;
  }
  return { binWidth, counts };
}

export interface RepDetail {
  wait: Record<string, number[]>;
  tis: Record<string, number[]>;
  queueSeries: Record<string, number[]>;
  utilSeries: Record<string, number[]>;
}

/** Folds one replication's events into samples + bucketed series. Pure. */
export function deriveRep(
  events: SimEvent[],
  queueIds: Set<string>, sinkIds: Set<string>, resourceIds: Set<string>,
  warmup: number, horizon: number, buckets: number,
): RepDetail {
  const wait: Record<string, number[]> = {};
  const tis: Record<string, number[]> = {};
  const enteredQueueAt = new Map<number, number>();
  const arrivalAt = new Map<number, number>();
  const dt = horizon / buckets;
  const queueLen: Record<string, number> = {};
  const util: Record<string, number> = {};
  const queueSeries: Record<string, number[]> = {};
  const utilSeries: Record<string, number[]> = {};
  for (const id of queueIds) { queueLen[id] = 0; queueSeries[id] = new Array<number>(buckets).fill(0); }
  for (const id of resourceIds) { util[id] = 0; utilSeries[id] = new Array<number>(buckets).fill(0); }

  let bucket = 0;
  const sampleInto = (uptoT: number): void => {
    while (bucket < buckets && bucket * dt <= uptoT) {
      for (const id of queueIds) queueSeries[id]![bucket] = queueLen[id]!;
      for (const id of resourceIds) utilSeries[id]![bucket] = util[id]!;
      bucket++;
    }
  };

  for (const e of events) {
    sampleInto(e.t);
    switch (e.kind) {
      case 'arrival': arrivalAt.set(e.entityId, e.t); break;
      case 'move':
        if (queueIds.has(e.to)) enteredQueueAt.set(e.entityId, e.t);
        if (queueIds.has(e.from)) {
          const t0 = enteredQueueAt.get(e.entityId);
          if (t0 !== undefined && e.t >= warmup) (wait[e.from] ??= []).push(e.t - t0);
        }
        break;
      case 'depart':
        if (sinkIds.has(e.nodeId)) {
          const a = arrivalAt.get(e.entityId);
          if (a !== undefined && e.t >= warmup) (tis[e.nodeId] ??= []).push(e.t - a);
        }
        break;
      case 'queue': queueLen[e.nodeId] = e.length; break;
      case 'server': util[e.nodeId] = e.servers > 0 ? e.busy / e.servers : 0; break;
    }
  }
  sampleInto(horizon);
  return { wait, tis, queueSeries, utilSeries };
}
