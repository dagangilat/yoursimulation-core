import { EventCalendar, type EventCallback, type EventHandle } from './calendar.js';

export class Simulation {
  clock = 0;
  private calendar = new EventCalendar();

  /** Schedule `fn` to run `delay` time units after the current clock.
   *  Returns a handle whose `cancel()` prevents the event from firing. */
  schedule(delay: number, fn: EventCallback): EventHandle {
    if (delay < 0) throw new Error(`negative delay: ${delay}`);
    return this.calendar.schedule(this.clock + delay, fn);
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
