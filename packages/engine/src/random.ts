/** Mulberry32 — small, fast, statistically solid enough for DES sampling. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * Derive an independent stream seed from a root seed + stream id.
 * Each stochastic node gets its own stream so scenario edits don't
 * shift every other node's draws (common random numbers).
 */
export function streamSeed(root: number, streamId: string): number {
  let h = root >>> 0;
  // Pre-mix so raw root bits can't cancel against the first character.
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  for (let i = 0; i < streamId.length; i++) {
    h = Math.imul(h ^ streamId.charCodeAt(i), 2654435761);
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
