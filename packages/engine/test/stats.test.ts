import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation.js';
import { Tally, TimeWeighted } from '../src/stats.js';

describe('Tally', () => {
  it('tracks count and mean', () => {
    const t = new Tally();
    [2, 4, 6].forEach((x) => t.record(x));
    expect(t.count).toBe(3);
    expect(t.mean).toBe(4);
  });

  it('reset clears observations', () => {
    const t = new Tally();
    t.record(100);
    t.reset();
    expect(t.count).toBe(0);
    expect(t.mean).toBe(0);
  });
});

describe('TimeWeighted', () => {
  it('computes the time-weighted mean', () => {
    const sim = new Simulation();
    const tw = new TimeWeighted(sim);
    sim.schedule(0, () => tw.update(2)); // value 2 over [0,10)
    sim.schedule(10, () => tw.update(0)); // value 0 over [10,20)
    sim.run(20);
    expect(tw.mean()).toBe(1);
  });

  it('reset re-anchors at the current clock (warm-up)', () => {
    const sim = new Simulation();
    const tw = new TimeWeighted(sim);
    sim.schedule(0, () => tw.update(100)); // polluting warm-up value
    sim.schedule(10, () => {
      tw.reset();
      tw.update(4);
    });
    sim.run(20);
    expect(tw.mean()).toBe(4);
  });

  it('reset preserves the in-progress value for trailing area', () => {
    const sim = new Simulation();
    const tw = new TimeWeighted(sim);
    sim.schedule(0, () => tw.update(3)); // level 3 from t=0
    sim.schedule(10, () => tw.reset()); // warm-up cutoff, no update afterwards
    sim.run(20);
    expect(tw.mean()).toBe(3); // 3 × 10 / 10 — level persists across reset
  });
});
