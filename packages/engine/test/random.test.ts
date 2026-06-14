import { describe, expect, it } from 'vitest';
import { Random, streamSeed } from '../src/random.js';

describe('Random (mulberry32)', () => {
  it('is deterministic for the same seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    const a = new Random(1);
    const b = new Random(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('emits values in [0, 1) with mean near 0.5', () => {
    const rng = new Random(7);
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 100_000; i++) {
      const u = rng.next();
      if (u < min) min = u;
      if (u > max) max = u;
      sum += u;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(sum / 100_000).toBeCloseTo(0.5, 2);
  });

  it('matches locked reference outputs for seed 42 (regression)', () => {
    const rng = new Random(42);
    expect(rng.next()).toBeCloseTo(0.6011037519201636, 15);
    expect(rng.next()).toBeCloseTo(0.44829055899754167, 15);
    expect(rng.next()).toBeCloseTo(0.8524657934904099, 15);
  });
});

describe('streamSeed', () => {
  it('derives stable, distinct seeds per stream id', () => {
    expect(streamSeed(42, 'node-a')).toBe(streamSeed(42, 'node-a'));
    expect(streamSeed(42, 'node-a')).not.toBe(streamSeed(42, 'node-b'));
    expect(streamSeed(42, 'node-a')).not.toBe(streamSeed(43, 'node-a'));
  });

  it('does not collide for shifted (root, first-char) pairs', () => {
    expect(streamSeed(0, 'c')).not.toBe(streamSeed(1, 'b'));
  });

  it('has no zero fixed point when root equals the first char code', () => {
    expect(streamSeed(97, 'a')).not.toBe(0);
  });
});
