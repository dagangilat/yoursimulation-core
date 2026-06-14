import { describe, expect, it } from 'vitest';
import { applyVariables, scoreAndFeasible, optimize, type SimModel, type OptProblem } from '../src/index.js';

const model: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 } } },
    { id: 'q', type: 'queue', params: {} },
    { id: 'r', type: 'resource', params: { servers: 2, service: { dist: 'exp', mean: 3 } } },
    { id: 'snk', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'q' }, { id: 'e2', from: 'q', to: 'r' }, { id: 'e3', from: 'r', to: 'snk' },
  ],
};
const settings = { horizon: 600, warmup: 100, replications: 6, seed: 7 };

describe('applyVariables', () => {
  it('sets node params on a clone without mutating the original', () => {
    const out = applyVariables(model, { 'r.servers': 5 });
    expect((out.nodes.find((n) => n.id === 'r')!.params as { servers: number }).servers).toBe(5);
    expect((model.nodes.find((n) => n.id === 'r')!.params as { servers: number }).servers).toBe(2);
  });
});

describe('scoreAndFeasible', () => {
  const problem: OptProblem = {
    variables: [{ nodeId: 'r', param: 'servers', min: 1, max: 10, costPerUnit: 10 }],
    constraints: [{ nodeId: 'q', metric: 'avgWait', soft: 5, hard: 15, wSoft: 50, wHard: 500 }],
  };
  it('feasible when under the bar; penalized over soft', () => {
    const ok = scoreAndFeasible(problem, { 'r.servers': 4 }, { 'q.avgWait': 3 });
    expect(ok.feasible).toBe(true); expect(ok.cost).toBe(40); expect(ok.score).toBe(40);
    const soft = scoreAndFeasible(problem, { 'r.servers': 4 }, { 'q.avgWait': 9 });
    expect(soft.feasible).toBe(true); expect(soft.score).toBeCloseTo(40 + 50 * 4, 6);
    const hard = scoreAndFeasible(problem, { 'r.servers': 3 }, { 'q.avgWait': 20 });
    expect(hard.feasible).toBe(false);
  });
});

describe('optimize', () => {
  const problem: OptProblem = {
    variables: [{ nodeId: 'r', param: 'servers', min: 1, max: 8, costPerUnit: 10 }],
    constraints: [{ nodeId: 'q', metric: 'avgWait', soft: 3, hard: 10, wSoft: 50, wHard: 500 }],
  };
  it('finds a feasible, low-cost server count and is deterministic', () => {
    const a = optimize(model, problem, settings, { population: 24, iterations: 8 }, 1);
    const b = optimize(model, problem, settings, { population: 24, iterations: 8 }, 1);
    expect(a).toEqual(b);
    expect(a.best.feasible).toBe(true);
    expect(a.best.values['r.servers']).toBeGreaterThanOrEqual(4);
    expect(a.best.values['r.servers']).toBeLessThanOrEqual(7);
    expect(a.trajectory.length).toBeGreaterThan(0);
    expect(a.evaluations.length).toBeGreaterThan(0);
  });
});
