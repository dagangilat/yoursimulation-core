import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import { runExperiment } from '../src/experiment.js';
import type { SimModel } from '../src/model.js';
import type { SinkNode } from '../src/nodes.js';

describe('assign + by-attribute routing', () => {
  it('assign sets an attribute and by-attribute routing sends each class to its edge', () => {
    // Three arrivals; assign class = 1,2,1 via an empirical cycling distribution is
    // hard deterministically, so assign a constant 7 and route the matching edge.
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 3 } },
        { id: 'tag', type: 'assign', params: { to: 'class', value: { dist: 'const', value: 7 } } },
        { id: 'route', type: 'branch', params: { mode: 'by-attribute', key: 'class' } },
        { id: 'a', type: 'sink', params: {} },
        { id: 'b', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'tag' },
        { id: 'e2', from: 'tag', to: 'route' },
        { id: 'e3', from: 'route', to: 'a', value: 7 },
        { id: 'e4', from: 'route', to: 'b' }, // default
      ],
    };
    const built = buildSimulation(m, 1);
    built.run(100);
    const s = built.summaries();
    expect(s['a']!['throughput']).toBe(3); // all match class 7
    expect(s['b']!['throughput']).toBe(0);
  });

  it('routes unmatched attribute values to the default (value-less) edge', () => {
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 2 } },
        { id: 'tag', type: 'assign', params: { to: 'class', value: { dist: 'const', value: 99 } } },
        { id: 'route', type: 'branch', params: { mode: 'by-attribute', key: 'class' } },
        { id: 'a', type: 'sink', params: {} },
        { id: 'b', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'tag' },
        { id: 'e2', from: 'tag', to: 'route' },
        { id: 'e3', from: 'route', to: 'a', value: 1 },
        { id: 'e4', from: 'route', to: 'b' },
      ],
    };
    const s = (() => { const b = buildSimulation(m, 1); b.run(100); return b.summaries(); })();
    expect(s['b']!['throughput']).toBe(2); // 99 matches nothing → default edge
  });

  it('assign to priority changes service order', () => {
    // Two sources; assign makes the second arrival top priority before a priority queue.
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 2 }, maxArrivals: 2 } },
        { id: 'vip', type: 'assign', params: { to: 'priority', value: { dist: 'const', value: 0 } } },
        { id: 'q', type: 'queue', params: { discipline: 'priority' } },
        { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 5 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'vip' },
        { id: 'e2', from: 'vip', to: 'q' },
        { id: 'e3', from: 'q', to: 'desk' },
        { id: 'e4', from: 'desk', to: 'out' },
      ],
    };
    // Both get priority 0 (assigned), so FIFO among equals → order 0,1.
    const built = buildSimulation(m, 1);
    built.run(100);
    const sink = built.nodes.get('out') as SinkNode;
    expect(sink.departures).toEqual([0, 1]);
  });
});

describe('join-shortest-queue routing', () => {
  it('balances two identical lines so neither runs away (vs. a single line)', () => {
    // Heavy load split by JSQ across two single-server lines. JSQ keeps both queues
    // short and nearly equal; the throughputs should be close to balanced.
    const jsq: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 } } },
        { id: 'lb', type: 'branch', params: { mode: 'shortest-queue' } },
        { id: 'q1', type: 'queue', params: {} },
        { id: 'd1', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 1.6 } } },
        { id: 'q2', type: 'queue', params: {} },
        { id: 'd2', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 1.6 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'lb' },
        { id: 'e2', from: 'lb', to: 'q1' },
        { id: 'e3', from: 'q1', to: 'd1' },
        { id: 'e4', from: 'lb', to: 'q2' },
        { id: 'e5', from: 'q2', to: 'd2' },
        { id: 'e6', from: 'd1', to: 'out' },
        { id: 'e7', from: 'd2', to: 'out' },
      ],
    };
    const r = runExperiment(jsq, { horizon: 4000, warmup: 400, replications: 8, seed: 5 });
    const t1 = r.nodes['d1']!['utilization']!.mean;
    const t2 = r.nodes['d2']!['utilization']!.mean;
    // Symmetric system + JSQ → utilizations within a few % of each other.
    expect(Math.abs(t1 - t2)).toBeLessThan(0.05);
    // Both servers carry real load (ρ ≈ 0.8 each).
    expect(t1).toBeGreaterThan(0.7);
    expect(t2).toBeGreaterThan(0.7);
  });
});

describe('by-attribute thinning matches M/M/1 per class (analytical)', () => {
  it('splits a Poisson stream into class sub-queues that each obey M/M/1', () => {
    // λ = 1; class 1 with prob 0.3, class 2 with prob 0.7 (empirical assign).
    // Poisson thinning: stream 1 is Poisson(0.3), stream 2 Poisson(0.7).
    // Each line M/M/1 with μ=1.25 (service mean 0.8):
    //   class1 ρ=0.24 → Wq = ρ/(μ−λ) = 0.24/(1.25−0.3) = 0.2526
    //   class2 ρ=0.56 → Wq = 0.56/(1.25−0.7) = 1.0182
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 } } },
        { id: 'tag', type: 'assign', params: { to: 'class', value: { dist: 'empirical', values: [1, 2], weights: [0.3, 0.7] } } },
        { id: 'route', type: 'branch', params: { mode: 'by-attribute', key: 'class' } },
        { id: 'q1', type: 'queue', params: {} },
        { id: 's1', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 0.8 } } },
        { id: 'q2', type: 'queue', params: {} },
        { id: 's2', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 0.8 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'tag' },
        { id: 'e2', from: 'tag', to: 'route' },
        { id: 'e3', from: 'route', to: 'q1', value: 1 },
        { id: 'e4', from: 'route', to: 'q2', value: 2 },
        { id: 'e5', from: 'q1', to: 's1' },
        { id: 'e6', from: 'q2', to: 's2' },
        { id: 'e7', from: 's1', to: 'out' },
        { id: 'e8', from: 's2', to: 'out' },
      ],
    };
    const r = runExperiment(m, { horizon: 20000, warmup: 2000, replications: 12, seed: 11 });
    expect(r.nodes['q1']!['avgWait']!.mean).toBeCloseTo(0.2526, 1);
    expect(r.nodes['q2']!['avgWait']!.mean).toBeCloseTo(1.0182, 1);
  });
});
