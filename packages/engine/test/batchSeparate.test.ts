import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';

const chain = (mid: SimModel['nodes'], edges: SimModel['edges'], resources?: SimModel['resources']): SimModel => ({
  schemaVersion: 1,
  ...(resources ? { resources } : {}),
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 6 } },
    ...mid,
    { id: 'out', type: 'sink', params: {} },
  ],
  edges,
});

describe('batch / separate', () => {
  it('batches every `size` entities into one (permanent)', () => {
    const m = chain(
      [{ id: 'b', type: 'batch', params: { size: 3 } }],
      [
        { id: 'e1', from: 'src', to: 'b' },
        { id: 'e2', from: 'b', to: 'out' },
      ],
    );
    const built = buildSimulation(m, 1);
    built.run(100);
    const s = built.summaries();
    expect(s['b']!['batches']).toBe(2); // 6 arrivals / 3
    expect(s['out']!['throughput']).toBe(2); // permanent: one entity per batch
  });

  it('temporary batch + separate restores every member with its original age', () => {
    // 6 arrivals (t=1..6), batch of 3 (forms at t=3 and t=6), then separate.
    const m = chain(
      [
        { id: 'b', type: 'batch', params: { size: 3, mode: 'temporary' } },
        { id: 'sep', type: 'separate', params: { mode: 'split-batch' } },
      ],
      [
        { id: 'e1', from: 'src', to: 'b' },
        { id: 'e2', from: 'b', to: 'sep' },
        { id: 'e3', from: 'sep', to: 'out' },
      ],
    );
    const built = buildSimulation(m, 1);
    built.run(100);
    const s = built.summaries();
    expect(s['out']!['throughput']).toBe(6); // all members re-emerge
    // batch 1 forms at t=3 → members aged 2,1,0; batch 2 at t=6 → 5,4,3 ... wait:
    // members keep their own createdAt; separate emits at batch-formation time.
    // m1: created 1,2,3 emitted at 3 → ages 2,1,0. m2: created 4,5,6 emitted at 6 → 2,1,0.
    // mean time in system = (2+1+0+2+1+0)/6 = 1.
    expect(s['out']!['avgTimeInSystem']).toBeCloseTo(1, 9);
  });

  it('duplicate fans one entity into N copies', () => {
    const m = chain(
      [{ id: 'sep', type: 'separate', params: { mode: 'duplicate', copies: 3 } }],
      [
        { id: 'e1', from: 'src', to: 'sep' },
        { id: 'e2', from: 'sep', to: 'out' },
      ],
    );
    const built = buildSimulation(m, 1);
    built.run(100);
    expect(built.summaries()['out']!['throughput']).toBe(18); // 6 × 3
  });

  it('rejects a non-integer batch size', () => {
    const m = chain(
      [{ id: 'b', type: 'batch', params: { size: 0 } }],
      [
        { id: 'e1', from: 'src', to: 'b' },
        { id: 'e2', from: 'b', to: 'out' },
      ],
    );
    expect(() => buildSimulation(m, 1)).toThrow(/size must be an integer/);
  });
});
