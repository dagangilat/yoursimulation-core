import { EventCalendar, type EventCallback } from './calendar.js';

export class Simulation {
  clock = 0;
  private calendar = new EventCalendar();

  /** Schedule `fn` to run `delay` time units after the current clock. */
  schedule(delay: number, fn: EventCallback): void {
    if (delay < 0) throw new Error(`negative delay: ${delay}`);
    this.calendar.schedule(this.clock + delay, fn);
  }

  /** Execute events in order until the clock reaches `until` (absolute time). */
  run(until: number): void {
    for (;;) {
      const head = this.calendar.peek();
      if (head === undefined || head.time > until) break;
      const ev = this.calendar.next()!;
      this.clock = ev.time;
      ev.fn();
    }
    this.clock = until;
  }
}
