import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';

// Arrivals t=1..5; one slow server (service 10); patience 2.5.
function model(patience?: number): SimModel {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 5 } },
      {
        id: 'q',
        type: 'queue',
        params: patience === undefined ? {} : { reneging: { patience: { dist: 'const', value: patience } } },
      },
      { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 10 } } },
      { id: 'out', type: 'sink', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'src', to: 'q' },
      { id: 'e2', from: 'q', to: 'desk' },
      { id: 'e3', from: 'desk', to: 'out' },
    ],
  };
}

describe('reneging (abandonment)', () => {
  it('abandons entities that wait past their patience', () => {
    // t=1 id0 seizes the desk (no wait, no renege). id1..id4 wait; desk busy
    // until t=11, so each abandons at enqueue+2.5 (4.5, 5.5, 6.5, 7.5).
    const built = buildSimulation(model(2.5), 1);
    built.run(100);
    const s = built.summaries();
    expect(s['q']!['reneged']).toBe(4);
    expect(s['out']!['throughput']).toBe(1);
    // Conservation: every created entity either departs or reneges (none left waiting).
    expect(s['out']!['throughput'] + s['q']!['reneged']).toBe(s['src']!['created']);
  });

  it('does not abandon when no reneging is configured', () => {
    const built = buildSimulation(model(undefined), 1);
    built.run(200); // 5 × service 10, served serially → all done well before 200
    const s = built.summaries();
    expect(s['q']!['reneged']).toBe(0);
    expect(s['out']!['throughput']).toBe(5);
  });

  it('does not abandon when patience comfortably exceeds the wait', () => {
    // Longest wait is ~40 (id4 served at t≈41); patience 1000 → nobody leaves.
    const built = buildSimulation(model(1000), 1);
    built.run(200);
    const s = built.summaries();
    expect(s['q']!['reneged']).toBe(0);
    expect(s['out']!['throughput']).toBe(5);
  });
});
