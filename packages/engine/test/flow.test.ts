import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';
import type { SinkNode } from '../src/nodes.js';

const mSingleServer: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 3 } },
    { id: 'q', type: 'queue', params: {} },
    { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 5 } } },
    { id: 'out', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'q' },
    { id: 'e2', from: 'q', to: 'desk' },
    { id: 'e3', from: 'desk', to: 'out' },
  ],
};

const sourceSink: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 2 }, maxArrivals: 5 } },
    { id: 'out', type: 'sink', params: {} },
  ],
  edges: [{ id: 'e1', from: 'src', to: 'out' }],
};

describe('queue + resource', () => {
  it('computes exact waits for a deterministic single-server queue', () => {
    // Arrivals t=1,2,3; service 5 → starts 1,6,11; waits 0,4,8.
    const built = buildSimulation(mSingleServer, 42);
    built.run(100);
    const s = built.summaries();
    expect(s['q']!['avgWait']).toBe(4);
    expect(s['out']!['throughput']).toBe(3);
    expect(s['out']!['avgTimeInSystem']).toBe(9); // 5+9+13 over 3
  });

  it('respects queue capacity by balking', () => {
    const m = structuredClone(mSingleServer);
    m.nodes[1] = { id: 'q', type: 'queue', params: { capacity: 1 } };
    const built = buildSimulation(m, 42);
    built.run(100);
    const s = built.summaries();
    // e1 goes straight to the idle desk, e2 occupies the single slot, e3 balks.
    expect(s['q']!['balked']).toBe(1);
    expect(s['out']!['throughput']).toBe(2);
  });

  it('priority discipline serves lowest priority number first', () => {
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'reg', type: 'source', params: { interarrival: { dist: 'const', value: 2 }, maxArrivals: 3, priority: 5 } },
        { id: 'vip', type: 'source', params: { interarrival: { dist: 'const', value: 5 }, maxArrivals: 1, priority: 1 } },
        { id: 'q', type: 'queue', params: { discipline: 'priority' } },
        { id: 'desk', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 10 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'reg', to: 'q' },
        { id: 'e2', from: 'vip', to: 'q' },
        { id: 'e3', from: 'q', to: 'desk' },
        { id: 'e4', from: 'desk', to: 'out' },
      ],
    };
    const built = buildSimulation(m, 42);
    built.run(200);
    // Entity ids follow global creation order: t=2 reg(id0), t=4 reg(id1),
    // t=5 vip(id2), t=6 reg(id3).
    // t=2: id0 seizes desk until 12. Queue at t=12: id1(p5), id2(p1), id3(p5).
    // Priority pops id2 (p1) first; FIFO among equals → departures 0,2,1,3.
    const sink = built.nodes.get('out')! as import('../src/nodes.js').SinkNode;
    expect(sink.departures).toEqual([0, 2, 1, 3]);
  });

  it('utilization reflects busy servers over time', () => {
    // Desk is busy t=1..16 (15 busy-minutes) observed over window [0,20] → 0.75.
    const built = buildSimulation(mSingleServer, 42);
    built.run(20);
    expect(built.summaries()['desk']!['utilization']).toBeCloseTo(0.75, 5);
  });

  it('lifo discipline serves the most recent arrival first', () => {
    const m = structuredClone(mSingleServer);
    m.nodes[1] = { id: 'q', type: 'queue', params: { discipline: 'lifo' } };
    const built = buildSimulation(m, 42);
    built.run(100);
    // Arrivals t=1(id0),2(id1),3(id2); id0 seizes desk to 6. LIFO pops id2 then id1.
    const sink = built.nodes.get('out')! as import('../src/nodes.js').SinkNode;
    expect(sink.departures).toEqual([0, 2, 1]);
  });
});

describe('source → sink', () => {
  it('creates entities at the interarrival cadence and counts departures', () => {
    const built = buildSimulation(sourceSink, 42);
    built.run(100);
    const s = built.summaries();
    expect(s['src']!['created']).toBe(5);
    expect(s['out']!['throughput']).toBe(5);
    // entities arrive at t=2,4,6,8,10 and depart instantly
    expect(s['out']!['avgTimeInSystem']).toBe(0);
  });

  it('rejects models with unknown edge endpoints', () => {
    const bad: SimModel = { ...sourceSink, edges: [{ id: 'e1', from: 'src', to: 'nope' }] };
    expect(() => buildSimulation(bad, 1)).toThrow(/unknown node/);
  });

  it('rejects two out-edges from a non-branch node', () => {
    const bad: SimModel = {
      ...sourceSink,
      nodes: [...sourceSink.nodes, { id: 'out2', type: 'sink', params: {} }],
      edges: [
        { id: 'e1', from: 'src', to: 'out' },
        { id: 'e2', from: 'src', to: 'out2' },
      ],
    };
    expect(() => buildSimulation(bad, 1)).toThrow(/one outgoing edge/);
  });

  it('maxArrivals is a lifetime cap unaffected by resetStats', () => {
    // arrivals at t=10,20,30 (cap 3)
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 10 }, maxArrivals: 3 } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [{ id: 'e1', from: 'src', to: 'out' }],
    };
    const built = buildSimulation(m, 1);
    built.run(15); // one arrival (t=10)
    built.resetStats();
    built.run(100); // remaining arrivals t=20,30 — cap must not re-arm
    const s = built.summaries();
    expect(s['src']!['created']).toBe(2); // post-reset arrivals only
    expect(s['out']!['throughput']).toBe(2);
  });

  it('rejects duplicate node ids', () => {
    const bad: SimModel = {
      ...sourceSink,
      nodes: [...sourceSink.nodes, { id: 'src', type: 'sink', params: {} }],
    };
    expect(() => buildSimulation(bad, 1)).toThrow(/duplicate node id/);
  });

  it('rejects sinks with outgoing edges', () => {
    const bad: SimModel = {
      schemaVersion: 1,
      nodes: sourceSink.nodes,
      edges: [
        { id: 'e1', from: 'src', to: 'out' },
        { id: 'e2', from: 'out', to: 'src' },
      ],
    };
    expect(() => buildSimulation(bad, 1)).toThrow(/cannot have outgoing edges/);
  });

  it('rejects instantaneous queue/branch loops', () => {
    const bad: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 } } },
        { id: 'q1', type: 'queue', params: {} },
        { id: 'q2', type: 'queue', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'q1' },
        { id: 'e2', from: 'q1', to: 'q2' },
        { id: 'e3', from: 'q2', to: 'q1' },
      ],
    };
    expect(() => buildSimulation(bad, 1)).toThrow(/instantaneous loop/);
  });

  it('rejects resources not fed by a queue', () => {
    const bad: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 } } },
        { id: 'r', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 1 } } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'r' },
        { id: 'e2', from: 'r', to: 'out' },
      ],
    };
    expect(() => buildSimulation(bad, 1)).toThrow(/must be fed by a queue/);
  });
});
