import { describe, expect, it } from 'vitest';
import { runExperiment } from '../src/experiment.js';
import type { SimModel } from '../src/model.js';

function mmModel(interMean: number, svcMean: number, servers: number): SimModel {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: interMean } } },
      { id: 'q', type: 'queue', params: {} },
      { id: 'svc', type: 'resource', params: { servers, service: { dist: 'exp', mean: svcMean } } },
      { id: 'out', type: 'sink', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'src', to: 'q' },
      { id: 'e2', from: 'q', to: 'svc' },
      { id: 'e3', from: 'svc', to: 'out' },
    ],
  };
}

/** Erlang C probability of waiting, for offered load a = λ/μ on c servers. */
function erlangC(c: number, a: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < c; k++) {
    term *= a / k;
    sum += term;
  }
  term *= a / c; // a^c / c!
  const pc = term * (c / (c - a));
  return pc / (sum + pc);
}

const settings = { horizon: 110_000, warmup: 10_000, replications: 10, seed: 42 };

describe('M/M/1 validation (λ=0.1, μ=0.125, ρ=0.8)', () => {
  // Theory: Wq = ρ/(μ−λ) = 32, Lq = λ·Wq = 3.2, utilization = 0.8
  const r = runExperiment(mmModel(10, 8, 1), settings);

  it('mean wait in queue ≈ 32 (±10%)', () => {
    expect(r.nodes['q']!['avgWait']!.mean).toBeGreaterThan(32 * 0.9);
    expect(r.nodes['q']!['avgWait']!.mean).toBeLessThan(32 * 1.1);
  });

  it('mean queue length ≈ 3.2 (±10%)', () => {
    expect(r.nodes['q']!['avgLength']!.mean).toBeGreaterThan(3.2 * 0.9);
    expect(r.nodes['q']!['avgLength']!.mean).toBeLessThan(3.2 * 1.1);
  });

  it('utilization ≈ 0.8 (±0.03)', () => {
    expect(Math.abs(r.nodes['svc']!['utilization']!.mean - 0.8)).toBeLessThan(0.03);
  });
});

describe('M/M/3 validation (λ=1, mean service 2.4, ρ=0.8)', () => {
  // a = λ/μ = 2.4; Wq = ErlangC(3, 2.4) / (cμ − λ) = 0.6472/0.25 ≈ 2.589
  const expectedWq = erlangC(3, 2.4) / (3 / 2.4 - 1);
  const r = runExperiment(mmModel(1, 2.4, 3), { ...settings, horizon: 60_000, warmup: 5_000 });

  it('mean wait in queue matches Erlang C (±10%)', () => {
    expect(r.nodes['q']!['avgWait']!.mean).toBeGreaterThan(expectedWq * 0.9);
    expect(r.nodes['q']!['avgWait']!.mean).toBeLessThan(expectedWq * 1.1);
  });

  it('utilization ≈ 0.8 (±0.03)', () => {
    expect(Math.abs(r.nodes['svc']!['utilization']!.mean - 0.8)).toBeLessThan(0.03);
  });
});
