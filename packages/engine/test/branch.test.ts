import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';

describe('branch', () => {
  it('routes probabilistically close to edge weights', () => {
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 10_000 } },
        { id: 'b', type: 'branch', params: {} },
        { id: 'a', type: 'sink', params: {} },
        { id: 'z', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'b' },
        { id: 'e2', from: 'b', to: 'a', probability: 0.7 },
        { id: 'e3', from: 'b', to: 'z', probability: 0.3 },
      ],
    };
    const built = buildSimulation(m, 42);
    built.run(20_000);
    const s = built.summaries();
    expect(s['a']!['throughput']! + s['z']!['throughput']!).toBe(10_000);
    expect(s['a']!['throughput']! / 10_000).toBeCloseTo(0.7, 1);
  });

  it('rejects branch probabilities that do not sum to 1', () => {
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 } } },
        { id: 'b', type: 'branch', params: {} },
        { id: 'a', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'b' },
        { id: 'e2', from: 'b', to: 'a', probability: 0.5 },
      ],
    };
    expect(() => buildSimulation(m, 1)).toThrow(/sum to 1/);
  });
});
