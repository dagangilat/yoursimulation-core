export type EventCallback = () => void;

/** Returned by `schedule`; lets a caller cancel an event before it fires. */
export interface EventHandle {
  cancel(): void;
}

interface ScheduledEvent {
  time: number;
  seq: number;
  fn: EventCallback;
  cancelled: boolean;
}

/** Min-heap event calendar ordered by (time, seq) — seq guarantees FIFO ties. */
export class EventCalendar {
  private heap: ScheduledEvent[] = [];
  private seq = 0;

  /** Live (non-cancelled) events. O(n); used only by tests/diagnostics. */
  get size(): number {
    return this.heap.reduce((n, e) => n + (e.cancelled ? 0 : 1), 0);
  }

  schedule(time: number, fn: EventCallback): EventHandle {
    const ev: ScheduledEvent = { time, seq: this.seq++, fn, cancelled: false };
    this.heap.push(ev);
    this.bubbleUp(this.heap.length - 1);
    return { cancel: () => { ev.cancelled = true; } };
  }

  next(): { time: number; fn: EventCallback } | undefined {
    this.purgeCancelledTop();
    if (this.heap.length === 0) return undefined;
    const top = this.removeRoot();
    return { time: top.time, fn: top.fn };
  }

  peek(): { time: number } | undefined {
    this.purgeCancelledTop();
    const top = this.heap[0];
    return top === undefined ? undefined : { time: top.time };
  }

  /** Drop cancelled events sitting at the root so peek/next see only live ones. */
  private purgeCancelledTop(): void {
    while (this.heap.length > 0 && this.heap[0]!.cancelled) this.removeRoot();
  }

  private removeRoot(): ScheduledEvent {
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private before(a: ScheduledEvent, b: ScheduledEvent): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(this.heap[i]!, this.heap[parent]!)) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.before(this.heap[l]!, this.heap[smallest]!)) smallest = l;
      if (r < n && this.before(this.heap[r]!, this.heap[smallest]!)) smallest = r;
      if (smallest === i) return;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest]!, this.heap[i]!];
      i = smallest;
    }
  }
}
