import { describe, expect, it } from 'vitest';
import { recordRun, type SimModel } from '../src/index.js';

const model: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 3 } },
    { id: 'q', type: 'queue', params: {} },
    { id: 'r', type: 'resource', params: { servers: 1, service: { dist: 'const', value: 2 } } },
    { id: 'snk', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'q' },
    { id: 'e2', from: 'q', to: 'r' },
    { id: 'e3', from: 'r', to: 'snk' },
  ],
};
const settings = { horizon: 50, warmup: 0, replications: 1, seed: 7 };

describe('recordRun', () => {
  it('is deterministic for the same seed', () => {
    expect(recordRun(model, settings)).toEqual(recordRun(model, settings));
  });
  it('emits chronologically ordered events', () => {
    const { events } = recordRun(model, settings);
    for (let i = 1; i < events.length; i++) expect(events[i]!.t).toBeGreaterThanOrEqual(events[i - 1]!.t);
  });
  it('produces an arrival, server activity, and a departure', () => {
    const { events } = recordRun(model, settings);
    expect(events.some((e) => e.kind === 'arrival' && e.nodeId === 'src')).toBe(true);
    expect(events.some((e) => e.kind === 'server' && e.nodeId === 'r' && e.busy === 1)).toBe(true);
    expect(events.some((e) => e.kind === 'depart' && e.nodeId === 'snk')).toBe(true);
  });
  it('records exactly 3 arrivals and 3 departures', () => {
    const { events } = recordRun(model, settings);
    expect(events.filter((e) => e.kind === 'arrival').length).toBe(3);
    expect(events.filter((e) => e.kind === 'depart').length).toBe(3);
  });
});
