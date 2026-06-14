import { describe, expect, it } from 'vitest';
import { Random } from '../src/random.js';
import { sample, type Distribution } from '../src/distributions.js';

function meanOf(d: Distribution, n = 100_000, seed = 123): number {
  const rng = new Random(seed);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sample(d, rng);
  return sum / n;
}

describe('distributions', () => {
  it('const returns the exact value', () => {
    expect(sample({ dist: 'const', value: 3.5 }, new Random(1))).toBe(3.5);
  });

  it('exponential has the requested mean', () => {
    expect(meanOf({ dist: 'exp', mean: 10 })).toBeCloseTo(10, 0);
  });

  it('uniform has mean (min+max)/2 and respects bounds', () => {
    const rng = new Random(5);
    for (let i = 0; i < 10_000; i++) {
      const x = sample({ dist: 'uniform', min: 2, max: 6 }, rng);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(6);
    }
    expect(meanOf({ dist: 'uniform', min: 2, max: 6 })).toBeCloseTo(4, 1);
  });

  it('triangular has mean (min+mode+max)/3', () => {
    expect(meanOf({ dist: 'triangular', min: 1, mode: 3, max: 6 })).toBeCloseTo(10 / 3, 1);
  });

  it('normal truncates at zero and keeps mean when sd is small', () => {
    const rng = new Random(9);
    for (let i = 0; i < 10_000; i++) {
      expect(sample({ dist: 'normal', mean: 1, sd: 2 }, rng)).toBeGreaterThanOrEqual(0);
    }
    expect(meanOf({ dist: 'normal', mean: 50, sd: 5 })).toBeCloseTo(50, 0);
  });

  it('erlang(k) has the requested mean', () => {
    expect(meanOf({ dist: 'erlang', k: 3, mean: 12 })).toBeCloseTo(12, 0);
  });

  it('lognormal has mean exp(mu + sigma^2/2)', () => {
    const expected = Math.exp(1 + 0.25 / 2);
    expect(meanOf({ dist: 'lognormal', mu: 1, sigma: 0.5 })).toBeCloseTo(expected, 0);
  });

  it('empirical only emits listed values, weighted', () => {
    const rng = new Random(11);
    const counts = new Map<number, number>();
    for (let i = 0; i < 10_000; i++) {
      const x = sample({ dist: 'empirical', values: [1, 5], weights: [9, 1] }, rng);
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 5]);
    expect(counts.get(1)! / 10_000).toBeCloseTo(0.9, 1);
  });

  it('throws on empty empirical values', () => {
    expect(() => sample({ dist: 'empirical', values: [] }, new Random(1))).toThrow(/at least one value/);
  });

  it('throws on erlang k < 1 or non-integer k', () => {
    expect(() => sample({ dist: 'erlang', k: 0, mean: 5 }, new Random(1))).toThrow(/integer k >= 1/);
    expect(() => sample({ dist: 'erlang', k: 1.7, mean: 5 }, new Random(1))).toThrow(/integer k >= 1/);
  });
});
