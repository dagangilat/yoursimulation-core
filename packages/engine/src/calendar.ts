export type EventCallback = () => void;

interface ScheduledEvent {
  time: number;
  seq: number;
  fn: EventCallback;
}

/** Min-heap event calendar ordered by (time, seq) — seq guarantees FIFO ties. */
export class EventCalendar {
  private heap: ScheduledEvent[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  schedule(time: number, fn: EventCallback): void {
    this.heap.push({ time, seq: this.seq++, fn });
    this.bubbleUp(this.heap.length - 1);
  }

  next(): { time: number; fn: EventCallback } | undefined {
    const top = this.heap[0];
    if (top === undefined) return undefined;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return { time: top.time, fn: top.fn };
  }

  peek(): { time: number } | undefined {
    const top = this.heap[0];
    return top === undefined ? undefined : { time: top.time };
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
