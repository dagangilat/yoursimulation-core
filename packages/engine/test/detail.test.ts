import { describe, expect, it } from 'vitest';
import { quantile, histogram, deriveRep } from '../src/detail.js';
import type { SimEvent } from '../src/index.js';

describe('quantile', () => {
  it('interpolates percentiles of a sorted array', () => {
    const xs = Array.from({ length: 101 }, (_, i) => i);
    expect(quantile(xs, 0.5)).toBe(50);
    expect(quantile(xs, 0.9)).toBeCloseTo(90, 6);
    expect(quantile(xs, 0.95)).toBeCloseTo(95, 6);
  });
  it('returns 0 for an empty array', () => { expect(quantile([], 0.9)).toBe(0); });
});

describe('histogram', () => {
  it('bins samples and counts sum to n', () => {
    const h = histogram([1, 2, 2, 3, 9], 4);
    expect(h.binWidth).toBeCloseTo(9 / 4, 6);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('deriveRep', () => {
  const events: SimEvent[] = [
    { kind: 'arrival', t: 0, entityId: 1, nodeId: 'src' },
    { kind: 'move', t: 0, entityId: 1, from: 'src', to: 'q' },
    { kind: 'queue', t: 0, nodeId: 'q', length: 1 },
    { kind: 'move', t: 2, entityId: 1, from: 'q', to: 'r' },
    { kind: 'queue', t: 2, nodeId: 'q', length: 0 },
    { kind: 'server', t: 2, nodeId: 'r', busy: 1, servers: 2 },
    { kind: 'server', t: 5, nodeId: 'r', busy: 0, servers: 2 },
    { kind: 'move', t: 5, entityId: 1, from: 'r', to: 'snk' },
    { kind: 'depart', t: 5, entityId: 1, nodeId: 'snk' },
  ];
  const d = deriveRep(events, new Set(['q']), new Set(['snk']), new Set(['r']), 0, 10, 5);
  it('extracts wait samples per queue', () => { expect(d.wait['q']).toEqual([2]); });
  it('extracts time-in-system per sink', () => { expect(d.tis['snk']).toEqual([5]); });
  it('builds series of length buckets', () => {
    expect(d.queueSeries['q']).toHaveLength(5);
    expect(d.utilSeries['r']).toHaveLength(5);
    expect(d.utilSeries['r']!.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
  it('excludes wait completing before warmup but keeps later departures', () => {
    const d2 = deriveRep(events, new Set(['q']), new Set(['snk']), new Set(['r']), 3, 10, 5);
    expect(d2.wait['q'] ?? []).toEqual([]);    // wait completed at t=2 < warmup 3 → excluded
    expect(d2.tis['snk']).toEqual([5]);        // depart t=5 ≥ 3 → kept
  });
});
