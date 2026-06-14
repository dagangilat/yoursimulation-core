import { runExperiment, type ExperimentResult, type RunSettings } from './experiment.js';
import { Random, streamSeed } from './random.js';
import type { SimModel } from './model.js';

export interface OptVariable { nodeId: string; param: 'servers' | 'capacity'; min: number; max: number; costPerUnit: number }
export interface OptConstraint { nodeId: string; metric: string; soft?: number; hard?: number; wSoft: number; wHard: number }
export interface OptProblem { variables: OptVariable[]; constraints: OptConstraint[] }
export interface OptOptions { population?: number; eliteFraction?: number; iterations?: number; replications?: number; alpha?: number; stdFloor?: number }
export interface Candidate { values: Record<string, number>; cost: number; metrics: Record<string, number>; score: number; feasible: boolean }
export interface OptimizationResult {
  best: Candidate;
  trajectory: { iter: number; bestScore: number; eliteMeanScore: number }[];
  evaluations: Candidate[];
}

const keyOf = (v: OptVariable): string => `${v.nodeId}.${v.param}`;

/** Deep-clones the model and writes each `${nodeId}.${param}` value onto the node's params. */
export function applyVariables(model: SimModel, values: Record<string, number>): SimModel {
  const clone = JSON.parse(JSON.stringify(model)) as SimModel;
  for (const [key, val] of Object.entries(values)) {
    const dot = key.lastIndexOf('.');
    const nodeId = key.slice(0, dot);
    const param = key.slice(dot + 1);
    const node = clone.nodes.find((n) => n.id === nodeId);
    if (node) (node.params as Record<string, unknown>)[param] = val;
  }
  return clone;
}

/** Reads a constraint metric from an experiment result. Percentile metrics need detailed mode. */
export function metricValue(result: ExperimentResult, nodeId: string, metric: string): number {
  if (metric === 'p95Wait') return result.detail?.percentiles[nodeId]?.['wait']?.p95 ?? 0;
  if (metric === 'p95TimeInSystem') return result.detail?.percentiles[nodeId]?.['timeInSystem']?.p95 ?? 0;
  return result.nodes[nodeId]?.[metric]?.mean ?? 0;
}

export function needsDetailed(problem: OptProblem): boolean {
  return problem.constraints.some((c) => c.metric === 'p95Wait' || c.metric === 'p95TimeInSystem');
}

export function costOf(problem: OptProblem, values: Record<string, number>): number {
  return problem.variables.reduce((sum, v) => sum + v.costPerUnit * (values[keyOf(v)] ?? 0), 0);
}

export function scoreAndFeasible(
  problem: OptProblem, values: Record<string, number>, metrics: Record<string, number>,
): { cost: number; score: number; feasible: boolean } {
  const cost = costOf(problem, values);
  let penalty = 0; let feasible = true;
  for (const c of problem.constraints) {
    const m = metrics[`${c.nodeId}.${c.metric}`] ?? 0;
    if (c.soft !== undefined && m > c.soft) penalty += c.wSoft * (m - c.soft);
    if (c.hard !== undefined && m > c.hard) penalty += c.wHard * (m - c.hard);
    const bar = c.hard ?? c.soft;
    if (bar !== undefined && m > bar) feasible = false;
  }
  return { cost, score: cost + penalty, feasible };
}

function gauss(rng: Random, m: number, s: number): number {
  const u1 = Math.max(1e-12, rng.next());
  const u2 = rng.next();
  return m + s * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function optimize(
  model: SimModel,
  problem: OptProblem,
  settings: RunSettings,
  options: OptOptions = {},
  ceSeed = 42,
  onProgress?: (iter: number, total: number, best: Candidate) => void,
): OptimizationResult {
  const N = options.population ?? 40;
  const rho = options.eliteFraction ?? 0.2;
  const iters = options.iterations ?? 15;
  const R = options.replications ?? 10;
  const alpha = options.alpha ?? 0.7;
  const stdFloor = options.stdFloor ?? 0.5;
  const detailed = needsDetailed(problem);
  const evalSettings: RunSettings = { ...settings, replications: R }; // settings.seed fixed across candidates = CRN
  const rng = new Random(streamSeed(ceSeed, 'ce'));
  const vars = problem.variables;
  const mean = vars.map((v) => (v.min + v.max) / 2);
  const std = vars.map((v) => Math.max(stdFloor, (v.max - v.min) / 2));

  const evaluate = (values: Record<string, number>): Candidate => {
    const result = runExperiment(applyVariables(model, values), evalSettings, undefined, { detailed });
    const metrics: Record<string, number> = {};
    for (const c of problem.constraints) metrics[`${c.nodeId}.${c.metric}`] = metricValue(result, c.nodeId, c.metric);
    const { cost, score, feasible } = scoreAndFeasible(problem, values, metrics);
    return { values, cost, metrics, score, feasible };
  };

  const trajectory: OptimizationResult['trajectory'] = [];
  const evaluations: Candidate[] = [];
  let best: Candidate | null = null;

  for (let it = 0; it < iters; it++) {
    const cands: Candidate[] = [];
    for (let n = 0; n < N; n++) {
      const values: Record<string, number> = {};
      vars.forEach((v, i) => {
        const x = Math.round(gauss(rng, mean[i]!, std[i]!));
        values[keyOf(v)] = Math.max(v.min, Math.min(v.max, x));
      });
      const cand = evaluate(values);
      cands.push(cand);
      evaluations.push(cand);
      if (best === null || cand.score < best.score) best = cand;
    }
    cands.sort((a, b) => a.score - b.score);
    const eliteN = Math.max(1, Math.ceil(rho * N));
    const elite = cands.slice(0, eliteN);
    trajectory.push({
      iter: it,
      bestScore: best!.score,
      eliteMeanScore: elite.reduce((s, c) => s + c.score, 0) / elite.length,
    });
    vars.forEach((v, i) => {
      const xs = elite.map((c) => c.values[keyOf(v)]!);
      const em = xs.reduce((s, x) => s + x, 0) / xs.length;
      const ev = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - em) ** 2, 0) / xs.length) : 0;
      mean[i] = alpha * em + (1 - alpha) * mean[i]!;
      std[i] = Math.max(stdFloor, alpha * ev + (1 - alpha) * std[i]!);
    });
    onProgress?.(it + 1, iters, best!);
    if (std.every((s) => s <= stdFloor)) break; // converged
  }
  return { best: best!, trajectory, evaluations };
}
