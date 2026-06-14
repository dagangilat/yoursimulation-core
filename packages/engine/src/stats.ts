import type { Simulation } from './simulation.js';

/** Observation-based statistic (wait times, time-in-system). */
export class Tally {
  private n = 0;
  private sum = 0;

  record(x: number): void {
    this.n++;
    this.sum += x;
  }

  get count(): number {
    return this.n;
  }

  get mean(): number {
    return this.n === 0 ? 0 : this.sum / this.n;
  }

  reset(): void {
    this.n = 0;
    this.sum = 0;
  }
}

/** Time-weighted statistic (queue length, utilization). */
export class TimeWeighted {
  private area = 0;
  private lastTime: number;
  private lastValue = 0;
  private startTime: number;

  constructor(private readonly sim: Simulation) {
    this.lastTime = sim.clock;
    this.startTime = sim.clock;
  }

  update(value: number): void {
    this.area += this.lastValue * (this.sim.clock - this.lastTime);
    this.lastTime = this.sim.clock;
    this.lastValue = value;
  }

  mean(): number {
    const elapsed = this.sim.clock - this.startTime;
    if (elapsed <= 0) return 0;
    const area = this.area + this.lastValue * (this.sim.clock - this.lastTime);
    return area / elapsed;
  }

  /** Re-anchor at the current clock, keeping the current value (warm-up truncation). */
  reset(): void {
    this.area = 0;
    this.lastTime = this.sim.clock;
    this.startTime = this.sim.clock;
  }
}
