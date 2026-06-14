import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import { runExperiment } from '../src/experiment.js';
import type { SimModel } from '../src/model.js';

function model(failures?: { uptime: number; repair: number }, serviceMean = 1): SimModel {
  return {
    schemaVersion: 1,
    nodes: [
      // λ ≈ 0.91: a reliable μ=1 server keeps up, but a failing one (μ_eff = 0.8) saturates.
      { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1.1 } } },
      { id: 'q', type: 'queue', params: {} },
      {
        id: 'desk',
        type: 'resource',
        params: {
          servers: 1,
          service: { dist: 'exp', mean: serviceMean },
          ...(failures
            ? { failures: { uptime: { dist: 'exp', mean: failures.uptime }, repair: { dist: 'exp', mean: failures.repair } } }
            : {}),
        },
      },
      { id: 'out', type: 'sink', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'src', to: 'q' },
      { id: 'e2', from: 'q', to: 'desk' },
      { id: 'e3', from: 'desk', to: 'out' },
    ],
  };
}

describe('resource failures (breakdowns)', () => {
  it('availability equals uptime / (uptime + repair) — analytical', () => {
    // uptime mean 8, repair mean 2 → A = 8 / (8 + 2) = 0.8.
    const r = runExperiment(model({ uptime: 8, repair: 2 }), { horizon: 40000, warmup: 4000, replications: 10, seed: 3 });
    expect(r.nodes['desk']!['availability']!.mean).toBeCloseTo(0.8, 1);
  });

  it('a job in service when the machine breaks down resumes its remaining work', () => {
    // Deterministic: arrival t=1, service 5 (would finish t=6). First failure at
    // t=3 (uptime 3), repair 4 → up at t=7, 3 work left → finishes t=10.
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 1 } },
        { id: 'q', type: 'queue', params: {} },
        { id: 'desk', type: 'resource', params: {
          servers: 1, service: { dist: 'const', value: 5 },
          failures: { uptime: { dist: 'const', value: 3 }, repair: { dist: 'const', value: 4 } },
        } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'q' },
        { id: 'e2', from: 'q', to: 'desk' },
        { id: 'e3', from: 'desk', to: 'out' },
      ],
    };
    const built = buildSimulation(m, 1);
    built.run(100);
    const s = built.summaries();
    expect(s['out']!['throughput']).toBe(1);
    expect(s['out']!['avgTimeInSystem']).toBe(9); // departs t=10, arrived t=1
  });

  it('breakdowns reduce throughput versus a reliable server', () => {
    const reliable = runExperiment(model(undefined), { horizon: 20000, warmup: 2000, replications: 8, seed: 9 });
    const unreliable = runExperiment(model({ uptime: 8, repair: 2 }), { horizon: 20000, warmup: 2000, replications: 8, seed: 9 });
    expect(unreliable.nodes['out']!['throughput']!.mean).toBeLessThan(reliable.nodes['out']!['throughput']!.mean);
    expect(unreliable.nodes['desk']!['availability']!.mean).toBeLessThan(0.95);
  });
});
