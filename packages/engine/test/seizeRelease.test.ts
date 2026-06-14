import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';

describe('seize / release with resource pools', () => {
  it('matches a plain resource when used as seize → delay → release (sugar equivalence)', () => {
    // Reference: source → queue → resource(1 server, service 5) → sink.
    const asResource: SimModel = {
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
    // Same thing via a pool of capacity 1.
    const asPool: SimModel = {
      schemaVersion: 1,
      resources: [{ id: 'staff', capacity: 1 }],
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 3 } },
        { id: 'grab', type: 'seize', params: { pool: 'staff' } },
        { id: 'work', type: 'delay', params: { delay: { dist: 'const', value: 5 } } },
        { id: 'free', type: 'release', params: { pool: 'staff' } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'grab' },
        { id: 'e2', from: 'grab', to: 'work' },
        { id: 'e3', from: 'work', to: 'free' },
        { id: 'e4', from: 'free', to: 'out' },
      ],
    };
    const r = buildSimulation(asResource, 1);
    r.run(100);
    const p = buildSimulation(asPool, 1);
    p.run(100);
    const rs = r.summaries();
    const ps = p.summaries();
    expect(ps['out']!['throughput']).toBe(rs['out']!['throughput']); // 3
    expect(ps['out']!['avgTimeInSystem']).toBe(rs['out']!['avgTimeInSystem']); // 9
    expect(ps['grab']!['avgWait']).toBe(rs['q']!['avgWait']); // 4
    // Pool utilization over [0,20] equals the resource's (busy t=1..16 → 0.75).
    const p20 = buildSimulation(asPool, 1);
    p20.run(20);
    expect(p20.summaries()['staff']!['utilization']).toBeCloseTo(0.75, 9);
  });

  it('holds the resource across MULTIPLE steps (the whole point)', () => {
    // One unit, held across two delays (3 then 4). A second arrival cannot start
    // until the first fully releases at t=8 — not after the first delay at t=4.
    const m: SimModel = {
      schemaVersion: 1,
      resources: [{ id: 'bed', capacity: 1 }],
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 2 } },
        { id: 'admit', type: 'seize', params: { pool: 'bed' } },
        { id: 'prep', type: 'delay', params: { delay: { dist: 'const', value: 3 } } },
        { id: 'treat', type: 'delay', params: { delay: { dist: 'const', value: 4 } } },
        { id: 'discharge', type: 'release', params: { pool: 'bed' } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'admit' },
        { id: 'e2', from: 'admit', to: 'prep' },
        { id: 'e3', from: 'prep', to: 'treat' },
        { id: 'e4', from: 'treat', to: 'discharge' },
        { id: 'e5', from: 'discharge', to: 'out' },
      ],
    };
    const built = buildSimulation(m, 1);
    built.run(100);
    const s = built.summaries();
    expect(s['out']!['throughput']).toBe(2);
    // id0: in 1, out 8 (7). id1: seize granted at 8, out 15 (13). Mean 10.
    expect(s['out']!['avgTimeInSystem']).toBe(10);
    // id1 waited 8 − 2 = 6; id0 waited 0 → mean 3. Proves the hold spans BOTH delays
    // (a per-stage resource would free at t=4 and id1's wait would be only 2).
    expect(s['admit']!['avgWait']).toBe(3);
  });

  it('a multi-unit seize blocks until enough units are free', () => {
    // Pool capacity 2. First entity grabs both units for 10; a 1-unit seizer waits.
    const m: SimModel = {
      schemaVersion: 1,
      resources: [{ id: 'crew', capacity: 2 }],
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 2 } },
        { id: 'grab', type: 'seize', params: { pool: 'crew', units: 2 } },
        { id: 'work', type: 'delay', params: { delay: { dist: 'const', value: 10 } } },
        { id: 'free', type: 'release', params: { pool: 'crew' } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'grab' },
        { id: 'e2', from: 'grab', to: 'work' },
        { id: 'e3', from: 'work', to: 'free' },
        { id: 'e4', from: 'free', to: 'out' },
      ],
    };
    const built = buildSimulation(m, 1);
    built.run(100);
    const s = built.summaries();
    expect(s['out']!['throughput']).toBe(2);
    // id0: in 1, out 11 (10). id1 needs 2 units, waits until 11, out 21 (19). Mean 14.5.
    expect(s['out']!['avgTimeInSystem']).toBe(14.5);
  });

  it('detects a held-resource leak (seize without release) at the sink', () => {
    const leaky: SimModel = {
      schemaVersion: 1,
      resources: [{ id: 'p', capacity: 1 }],
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 1 } },
        { id: 'grab', type: 'seize', params: { pool: 'p' } },
        { id: 'out', type: 'sink', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'grab' },
        { id: 'e2', from: 'grab', to: 'out' },
      ],
    };
    const built = buildSimulation(leaky, 1);
    expect(() => built.run(100)).toThrow(/still holding/);
  });

  it('rejects invalid pool references and over-capacity seizes', () => {
    const base = {
      schemaVersion: 1 as const,
      resources: [{ id: 'p', capacity: 2 }],
      nodes: [
        { id: 'src', type: 'source' as const, params: { interarrival: { dist: 'const' as const, value: 1 } } },
        { id: 'grab', type: 'seize' as const, params: { pool: 'p' } },
        { id: 'free', type: 'release' as const, params: { pool: 'p' } },
        { id: 'out', type: 'sink' as const, params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'grab' },
        { id: 'e2', from: 'grab', to: 'free' },
        { id: 'e3', from: 'free', to: 'out' },
      ],
    };
    const unknownPool = structuredClone(base);
    unknownPool.nodes[1]!.params = { pool: 'nope' };
    expect(() => buildSimulation(unknownPool, 1)).toThrow(/unknown pool/);

    const tooMany = structuredClone(base);
    (tooMany.nodes[1]!.params as { pool: string; units?: number }).units = 5;
    expect(() => buildSimulation(tooMany, 1)).toThrow(/capacity/);

    const dupPool = structuredClone(base);
    dupPool.resources = [{ id: 'p', capacity: 2 }, { id: 'p', capacity: 1 }];
    expect(() => buildSimulation(dupPool, 1)).toThrow(/duplicate pool id/);
  });
});
