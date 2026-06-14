import type { Random } from './random.js';

export type Distribution =
  | { dist: 'const'; value: number }
  | { dist: 'exp'; mean: number }
  | { dist: 'uniform'; min: number; max: number }
  | { dist: 'triangular'; min: number; mode: number; max: number }
  | { dist: 'normal'; mean: number; sd: number }
  | { dist: 'lognormal'; mu: number; sigma: number }
  | { dist: 'erlang'; k: number; mean: number }
  | { dist: 'empirical'; values: number[]; weights?: number[] };

function standardNormal(rng: Random): number {
  // Box–Muller; guard u1 = 0.
  const u1 = rng.next() || Number.EPSILON;
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sample(d: Distribution, rng: Random): number {
  switch (d.dist) {
    case 'const':
      return d.value;
    case 'exp':
      return -d.mean * Math.log(1 - rng.next());
    case 'uniform':
      return d.min + (d.max - d.min) * rng.next();
    case 'triangular': {
      const u = rng.next();
      const f = (d.mode - d.min) / (d.max - d.min);
      return u < f
        ? d.min + Math.sqrt(u * (d.max - d.min) * (d.mode - d.min))
        : d.max - Math.sqrt((1 - u) * (d.max - d.min) * (d.max - d.mode));
    }
    case 'normal':
      // Service/interarrival times cannot be negative.
      return Math.max(0, d.mean + d.sd * standardNormal(rng));
    case 'lognormal':
      return Math.exp(d.mu + d.sigma * standardNormal(rng));
    case 'erlang': {
      if (d.k < 1 || !Number.isInteger(d.k)) throw new Error('erlang requires integer k >= 1');
      let sum = 0;
      for (let i = 0; i < d.k; i++) sum += -(d.mean / d.k) * Math.log(1 - rng.next());
      return sum;
    }
    case 'empirical': {
      if (d.values.length === 0) throw new Error('empirical distribution requires at least one value');
      const weights = d.weights ?? d.values.map(() => 1);
      const total = weights.reduce((a, b) => a + b, 0);
      let u = rng.next() * total;
      for (let i = 0; i < d.values.length; i++) {
        u -= weights[i]!;
        if (u < 0) return d.values[i]!;
      }
      return d.values[d.values.length - 1]!;
    }
  }
}
