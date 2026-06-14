import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation.js';

describe('Simulation', () => {
  it('advances the clock through scheduled events', () => {
    const sim = new Simulation();
    const seen: number[] = [];
    sim.schedule(5, () => seen.push(sim.clock));
    sim.schedule(2, () => seen.push(sim.clock));
    sim.run(10);
    expect(seen).toEqual([2, 5]);
    expect(sim.clock).toBe(10);
  });

  it('events can schedule further events relative to now', () => {
    const sim = new Simulation();
    const seen: number[] = [];
    sim.schedule(1, () => {
      seen.push(sim.clock);
      sim.schedule(3, () => seen.push(sim.clock)); // fires at t=4
    });
    sim.run(10);
    expect(seen).toEqual([1, 4]);
  });

  it('does not execute events beyond the horizon', () => {
    const sim = new Simulation();
    let fired = false;
    sim.schedule(15, () => (fired = true));
    sim.run(10);
    expect(fired).toBe(false);
    expect(sim.clock).toBe(10);
  });

  it('run can be called again to continue (warm-up pattern)', () => {
    const sim = new Simulation();
    const seen: number[] = [];
    sim.schedule(5, () => seen.push(sim.clock));
    sim.schedule(15, () => seen.push(sim.clock));
    sim.run(10);
    sim.run(20);
    expect(seen).toEqual([5, 15]);
  });
});
