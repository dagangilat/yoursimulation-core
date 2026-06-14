import { describe, expect, it } from 'vitest';
import { runExperiment } from '../src/experiment.js';
import type { SimModel } from '../src/model.js';
import { quantile } from '../src/detail.js';

const m: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 10 } } },
    { id: 'q', type: 'queue', params: {} },
    { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 8 } } },
    { id: 'out', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'q' },
    { id: 'e2', from: 'q', to: 'desk' },
    { id: 'e3', from: 'desk', to: 'out' },
  ],
};

describe('runExperiment', () => {
  it('aggregates metrics across replications with CI half-widths', () => {
    const r = runExperiment(m, { horizon: 5000, warmup: 500, replications: 5, seed: 42 });
    expect(r.replications).toBe(5);
    const wait = r.nodes['q']!['avgWait']!;
    expect(wait.mean).toBeGreaterThan(0);
    expect(wait.ci95).toBeGreaterThan(0);
    expect(r.nodes['desk']!['utilization']!.mean).toBeGreaterThan(0.5);
  });

  it('replications differ from each other (independent streams)', () => {
    const a = runExperiment(m, { horizon: 2000, warmup: 0, replications: 2, seed: 1 });
    // ci95 > 0 implies the two replications produced different values
    expect(a.nodes['out']!['throughput']!.ci95).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed', () => {
    const a = runExperiment(m, { horizon: 2000, warmup: 200, replications: 3, seed: 7 });
    const b = runExperiment(m, { horizon: 2000, warmup: 200, replications: 3, seed: 7 });
    expect(a).toEqual(b);
  });

  it('throws on replications < 1', () => {
    expect(() => runExperiment(m, { horizon: 100, warmup: 0, replications: 0, seed: 1 })).toThrow(/replications/);
  });

  it('throws when warmup is not shorter than horizon', () => {
    expect(() => runExperiment(m, { horizon: 100, warmup: 100, replications: 1, seed: 1 })).toThrow(/warmup/);
  });

  it('reports progress once per replication', () => {
    const calls: Array<[number, number]> = [];
    runExperiment(m, { horizon: 200, warmup: 20, replications: 5, seed: 7 }, (done, total) =>
      calls.push([done, total]),
    );
    expect(calls).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
  });

  it('detailed mode adds percentiles/histograms/series without changing means', () => {
    const settings = { horizon: 500, warmup: 50, replications: 5, seed: 3 };
    const lean = runExperiment(m, settings);
    const detailed = runExperiment(m, settings, undefined, { detailed: true, buckets: 20 });
    expect(detailed.nodes).toEqual(lean.nodes);
    expect(detailed.detail).toBeDefined();
    expect(detailed.detail!.buckets).toBe(20);
    const sinkPct = Object.values(detailed.detail!.percentiles).find((mm) => 'timeInSystem' in mm);
    expect(sinkPct!.timeInSystem.p90).toBeGreaterThanOrEqual(sinkPct!.timeInSystem.p50);
    const series = Object.values(detailed.detail!.series).find((mm) => 'queueLength' in mm);
    expect(series!.queueLength).toHaveLength(20);
  });

  it('detailed mode is deterministic', () => {
    const s = { horizon: 200, warmup: 0, replications: 3, seed: 9 };
    expect(runExperiment(m, s, undefined, { detailed: true })).toEqual(runExperiment(m, s, undefined, { detailed: true }));
  });
});
