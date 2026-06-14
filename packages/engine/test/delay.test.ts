import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';

// source → delay → sink. Arrivals t=2,4,6,8,10; each delayed by 10.
const m: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 2 }, maxArrivals: 5 } },
    { id: 'transit', type: 'delay', params: { delay: { dist: 'const', value: 10 } } },
    { id: 'out', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'transit' },
    { id: 'e2', from: 'transit', to: 'out' },
  ],
};

describe('delay node (infinite-server)', () => {
  it('passes every entity through after its delay, with no contention', () => {
    const built = buildSimulation(m, 7);
    built.run(100);
    const s = built.summaries();
    expect(s['transit']!['count']).toBe(5);
    expect(s['transit']!['avgDelay']).toBe(10);
    // Each entity's only wait is the 10-unit delay → time in system is exactly 10.
    expect(s['out']!['throughput']).toBe(5);
    expect(s['out']!['avgTimeInSystem']).toBe(10);
  });

  it('tracks time-weighted work-in-progress', () => {
    // WIP ramps 0→5 then back to 0 over [0,20]; ∫WIP dt = 50 → mean 2.5.
    const built = buildSimulation(m, 7);
    built.run(20);
    expect(built.summaries()['transit']!['avgWip']).toBeCloseTo(2.5, 9);
  });

  it('never blocks: simultaneous entities all delay in parallel', () => {
    // A branch fans one arrival is overkill; instead burst 3 arrivals at t=1,1,1
    // via a fast source and check all three are in transit at once.
    const burst: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 3 } },
        { id: 'd', type: 'delay', params: { delay: { dist: 'const', value: 100 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'd' },
        { id: 'e2', from: 'd', to: 'out' },
      ],
    };
    const built = buildSimulation(burst, 1);
    built.run(50); // arrivals at 1,2,3; none have left yet (delay 100)
    expect(built.summaries()['d']!['avgWip']).toBeGreaterThan(0);
    expect(built.summaries()['out']!['throughput']).toBe(0); // still in transit
  });

  it('rejects a resource fed by a delay (must be a queue)', () => {
    const bad: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 } } },
        { id: 'd', type: 'delay', params: { delay: { dist: 'const', value: 1 } } },
        { id: 'r', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 1 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'd' },
        { id: 'e2', from: 'd', to: 'r' },
        { id: 'e3', from: 'r', to: 'out' },
      ],
    };
    expect(() => buildSimulation(bad, 1)).toThrow(/must be fed by a queue/);
  });
});
