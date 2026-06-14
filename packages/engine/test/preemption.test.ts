import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import { runExperiment } from '../src/experiment.js';
import type { SimModel } from '../src/model.js';
import type { SinkNode } from '../src/nodes.js';

// A low-priority job (arrives t=1) is mid-service when a high-priority job arrives
// (t=4). Both have service time 10. id0 = low (t=1), id1 = high (t=4).
function twoJobs(preemption?: 'resume' | 'restart'): SimModel {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'lo', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 1, priority: 5 } },
      { id: 'hi', type: 'source', params: { interarrival: { dist: 'const', value: 4 }, maxArrivals: 1, priority: 1 } },
      { id: 'q', type: 'queue', params: { discipline: 'priority' } },
      { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 10 }, ...(preemption ? { preemption } : {}) } },
      { id: 'out', type: 'sink', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'lo', to: 'q' },
      { id: 'e2', from: 'hi', to: 'q' },
      { id: 'e3', from: 'q', to: 'desk' },
      { id: 'e4', from: 'desk', to: 'out' },
    ],
  };
}

describe('preemptive priority', () => {
  it('without preemption, the high job waits its turn (FIFO of service)', () => {
    const built = buildSimulation(twoJobs(), 1);
    built.run(100);
    const sink = built.nodes.get('out') as SinkNode;
    // lo runs 1..11, then hi 11..21 → departures lo, hi.
    expect(sink.departures).toEqual([0, 1]);
    expect(built.summaries()['desk']!['preemptions']).toBe(0);
  });

  it('resume: high job bumps low, low finishes its REMAINING work', () => {
    const built = buildSimulation(twoJobs('resume'), 1);
    built.run(100);
    const s = built.summaries();
    const sink = built.nodes.get('out') as SinkNode;
    // lo runs 1..4 (3 done), preempted; hi runs 4..14; lo resumes 14, 7 left → done 21.
    // hi in system 4→14 (10); lo 1→21 (20). hi departs first.
    expect(sink.departures).toEqual([1, 0]);
    expect(s['out']!['avgTimeInSystem']).toBe(15); // (10 + 20) / 2
    expect(s['desk']!['preemptions']).toBe(1);
  });

  it('restart: preempted low job starts its service over', () => {
    const built = buildSimulation(twoJobs('restart'), 1);
    built.run(100);
    const s = built.summaries();
    // lo preempted at 4; hi 4..14; lo restarts 14 with full 10 → done 24. lo 1→24 (23).
    expect(s['out']!['avgTimeInSystem']).toBe(16.5); // (10 + 23) / 2
    expect(s['desk']!['preemptions']).toBe(1);
  });
});

describe('M/M/1 preemptive-resume priority — analytical (high class is its own M/M/1)', () => {
  it("high-priority class sojourn equals 1/(μ − λ_high), unaffected by low priority", () => {
    // μ = 1 (service exp mean 1). λ_high = 0.3, λ_low = 0.5 (total ρ = 0.8, stable).
    // Under preempt-resume, the high class never waits for low work →
    // W_high = 1/(μ − λ_high) = 1/(1 − 0.3) = 1.42857.
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'srcH', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 / 0.3 }, priority: 1 } },
        { id: 'srcL', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 / 0.5 }, priority: 5 } },
        { id: 'tagH', type: 'assign', params: { to: 'cls', value: { dist: 'const', value: 1 } } },
        { id: 'tagL', type: 'assign', params: { to: 'cls', value: { dist: 'const', value: 2 } } },
        { id: 'q', type: 'queue', params: { discipline: 'priority' } },
        { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 1 }, preemption: 'resume' } },
        { id: 'route', type: 'branch', params: { mode: 'by-attribute', key: 'cls' } },
        { id: 'outH', type: 'sink', params: {} },
        { id: 'outL', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'srcH', to: 'tagH' },
        { id: 'e2', from: 'tagH', to: 'q' },
        { id: 'e3', from: 'srcL', to: 'tagL' },
        { id: 'e4', from: 'tagL', to: 'q' },
        { id: 'e5', from: 'q', to: 'desk' },
        { id: 'e6', from: 'desk', to: 'route' },
        { id: 'e7', from: 'route', to: 'outH', value: 1 },
        { id: 'e8', from: 'route', to: 'outL', value: 2 },
      ],
    };
    const r = runExperiment(m, { horizon: 30000, warmup: 3000, replications: 12, seed: 7 });
    expect(r.nodes['outH']!['avgTimeInSystem']!.mean).toBeCloseTo(1.4286, 1);
  });
});
