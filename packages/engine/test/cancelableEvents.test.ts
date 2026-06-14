import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation.js';

describe('cancelable events', () => {
  it('does not fire a cancelled event but still fires the rest in order', () => {
    const sim = new Simulation();
    const fired: string[] = [];
    sim.schedule(1, () => fired.push('a'));
    const h = sim.schedule(2, () => fired.push('b')); // cancel this one
    sim.schedule(3, () => fired.push('c'));
    h.cancel();
    sim.run(10);
    expect(fired).toEqual(['a', 'c']);
  });

  it('cancelling the next-to-fire event advances the clock correctly', () => {
    const sim = new Simulation();
    const at: number[] = [];
    const h = sim.schedule(5, () => at.push(sim.clock));
    sim.schedule(8, () => at.push(sim.clock));
    h.cancel();
    sim.run(20);
    expect(at).toEqual([8]); // 5 cancelled; only the t=8 event runs
  });

  it('cancelling an already-fired event is a no-op', () => {
    const sim = new Simulation();
    let n = 0;
    const h = sim.schedule(1, () => { n++; });
    sim.run(2);
    expect(n).toBe(1);
    expect(() => h.cancel()).not.toThrow();
    sim.run(5);
    expect(n).toBe(1);
  });
});
