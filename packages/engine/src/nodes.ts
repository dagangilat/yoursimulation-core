import { sample } from './distributions.js';
import { Tally, TimeWeighted } from './stats.js';
import type { Entity } from './entity.js';
import type { Random } from './random.js';
import type { Simulation } from './simulation.js';
import type { EventHandle } from './calendar.js';
import type { SourceParams, QueueParams, ResourceParams, DelayParams } from './model.js';
import type { SimEvent } from './events.js';

/** Services the runtime nodes need; implemented by build.ts. */
export interface NodeContext {
  sim: Simulation;
  nextEntityId(): number;
  /** Single downstream node (non-branch nodes). */
  out(nodeId: string): RuntimeNode;
  /** All downstream nodes with probabilities (branch nodes). */
  outs(nodeId: string): { node: RuntimeNode; probability: number }[];
  /** Queues feeding this node, for pull-on-release. */
  upstreamQueues(nodeId: string): { dispatch(): void }[];
  rngFor(nodeId: string): Random;
  emit?(e: SimEvent): void;
}

export abstract class RuntimeNode {
  constructor(
    readonly id: string,
    protected readonly ctx: NodeContext,
  ) {}

  canAccept(): boolean {
    return true;
  }

  receive(_e: Entity): void {
    throw new Error(`node ${this.id} cannot receive entities`);
  }

  /** Called once before the first run; sources schedule their first arrival here. */
  start(): void {}

  resetStats(): void {}

  abstract summary(): Record<string, number>;
}

export class SourceNode extends RuntimeNode {
  created = 0;
  private arrivals = 0;

  constructor(id: string, ctx: NodeContext, private readonly p: SourceParams) {
    super(id, ctx);
  }

  override start(): void {
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.p.maxArrivals !== undefined && this.arrivals >= this.p.maxArrivals) return;
    const delay = sample(this.p.interarrival, this.ctx.rngFor(this.id));
    this.ctx.sim.schedule(delay, () => {
      this.arrivals++;
      this.created++;
      const e: Entity = {
        id: this.ctx.nextEntityId(),
        createdAt: this.ctx.sim.clock,
        priority: this.p.priority ?? 0,
        enqueuedAt: 0,
      };
      this.ctx.emit?.({ kind: 'arrival', t: this.ctx.sim.clock, entityId: e.id, nodeId: this.id });
      const dest = this.ctx.out(this.id);
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
      dest.receive(e);
      this.scheduleNext();
    });
  }

  override summary(): Record<string, number> {
    return { created: this.created };
  }

  /** Clears the created-count statistic. maxArrivals is a lifetime cap — a depleted source stays depleted. */
  override resetStats(): void {
    this.created = 0;
  }
}

export class SinkNode extends RuntimeNode {
  departed = 0;
  /** Entity ids in departure order — used by discipline tests. */
  readonly departures: number[] = [];
  readonly timeInSystem = new Tally();

  override receive(e: Entity): void {
    this.departed++;
    this.departures.push(e.id);
    this.timeInSystem.record(this.ctx.sim.clock - e.createdAt);
    this.ctx.emit?.({ kind: 'depart', t: this.ctx.sim.clock, entityId: e.id, nodeId: this.id });
  }

  override summary(): Record<string, number> {
    return { throughput: this.departed, avgTimeInSystem: this.timeInSystem.mean };
  }

  override resetStats(): void {
    this.departed = 0;
    this.departures.length = 0;
    this.timeInSystem.reset();
  }
}

export class QueueNode extends RuntimeNode {
  private items: Entity[] = [];
  balked = 0;
  reneged = 0;
  private readonly renegeHandles = new Map<number, EventHandle>();
  readonly waitTime = new Tally();
  readonly length: TimeWeighted;

  constructor(id: string, ctx: NodeContext, private readonly p: QueueParams) {
    super(id, ctx);
    this.length = new TimeWeighted(ctx.sim);
  }

  override canAccept(): boolean {
    return this.p.capacity === undefined || this.items.length < this.p.capacity;
  }

  override receive(e: Entity): void {
    if (!this.canAccept()) {
      this.balked++;
      return;
    }
    e.enqueuedAt = this.ctx.sim.clock;
    this.items.push(e);
    this.length.update(this.items.length);
    this.ctx.emit?.({ kind: 'queue', t: this.ctx.sim.clock, nodeId: this.id, length: this.items.length });
    if (this.p.reneging) this.scheduleRenege(e);
    this.dispatch();
  }

  /** Abandon the entity if it is still waiting when its patience runs out. */
  private scheduleRenege(e: Entity): void {
    const patience = sample(this.p.reneging!.patience, this.ctx.rngFor(`${this.id}:renege`));
    const handle = this.ctx.sim.schedule(patience, () => {
      const i = this.items.indexOf(e);
      if (i === -1) return; // already served — handle should have been cancelled
      this.items.splice(i, 1);
      this.renegeHandles.delete(e.id);
      this.reneged++;
      this.length.update(this.items.length);
      this.ctx.emit?.({ kind: 'queue', t: this.ctx.sim.clock, nodeId: this.id, length: this.items.length });
    });
    this.renegeHandles.set(e.id, handle);
  }

  /** Push waiting entities downstream while it can accept. Resources call this on release. */
  dispatch(): void {
    const down = this.ctx.out(this.id);
    while (this.items.length > 0 && down.canAccept()) {
      const e = this.pop();
      this.renegeHandles.get(e.id)?.cancel();
      this.renegeHandles.delete(e.id);
      this.length.update(this.items.length);
      this.waitTime.record(this.ctx.sim.clock - e.enqueuedAt);
      this.ctx.emit?.({ kind: 'queue', t: this.ctx.sim.clock, nodeId: this.id, length: this.items.length });
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: down.id });
      down.receive(e);
    }
  }

  private pop(): Entity {
    const d = this.p.discipline ?? 'fifo';
    if (d === 'fifo') return this.items.shift()!;
    if (d === 'lifo') return this.items.pop()!;
    // priority: lowest number wins; strict < keeps FIFO among equals
    let best = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i]!.priority < this.items[best]!.priority) best = i;
    }
    return this.items.splice(best, 1)[0]!;
  }

  override summary(): Record<string, number> {
    return { avgWait: this.waitTime.mean, avgLength: this.length.mean(), balked: this.balked, reneged: this.reneged };
  }

  override resetStats(): void {
    this.waitTime.reset();
    this.length.reset();
    this.length.update(this.items.length);
    this.balked = 0;
    this.reneged = 0;
  }
}

export class ResourceNode extends RuntimeNode {
  private busy = 0;
  readonly utilization: TimeWeighted;

  constructor(id: string, ctx: NodeContext, private readonly p: ResourceParams) {
    super(id, ctx);
    this.utilization = new TimeWeighted(ctx.sim);
  }

  override canAccept(): boolean {
    return this.busy < this.p.servers;
  }

  override receive(e: Entity): void {
    if (!this.canAccept())
      throw new Error(`resource ${this.id} received an entity while full`);
    this.busy++;
    this.utilization.update(this.busy / this.p.servers);
    this.ctx.emit?.({ kind: 'server', t: this.ctx.sim.clock, nodeId: this.id, busy: this.busy, servers: this.p.servers });
    const serviceTime = sample(this.p.service, this.ctx.rngFor(this.id));
    this.ctx.sim.schedule(serviceTime, () => {
      this.busy--;
      this.utilization.update(this.busy / this.p.servers);
      // Forward before pulling upstream so a freed slot is visible to the next entity.
      this.ctx.emit?.({ kind: 'server', t: this.ctx.sim.clock, nodeId: this.id, busy: this.busy, servers: this.p.servers });
      const dest = this.ctx.out(this.id);
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
      dest.receive(e);
      for (const q of this.ctx.upstreamQueues(this.id)) q.dispatch();
    });
  }

  override summary(): Record<string, number> {
    return { utilization: this.utilization.mean() };
  }

  // servers >= 1 is assumed (schema validation owns the guard).
  override resetStats(): void {
    this.utilization.reset();
    this.utilization.update(this.busy / this.p.servers);
  }
}

export class BranchNode extends RuntimeNode {
  override receive(e: Entity): void {
    const outs = this.ctx.outs(this.id);
    const u = this.ctx.rngFor(this.id).next();
    let cum = 0;
    for (const o of outs) {
      cum += o.probability;
      if (u < cum) {
        this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: o.node.id });
        o.node.receive(e);
        return;
      }
    }
    const fb = outs[outs.length - 1]!.node;
    this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: fb.id });
    fb.receive(e); // float-rounding fallback
  }

  override summary(): Record<string, number> {
    return {};
  }
}

/** Infinite-server delay: every entity gets its own timer; nothing ever waits. */
export class DelayNode extends RuntimeNode {
  count = 0;
  private inDelay = 0;
  readonly delayTime = new Tally();
  readonly wip: TimeWeighted;

  constructor(id: string, ctx: NodeContext, private readonly p: DelayParams) {
    super(id, ctx);
    this.wip = new TimeWeighted(ctx.sim);
  }

  override receive(e: Entity): void {
    this.inDelay++;
    this.wip.update(this.inDelay);
    const d = sample(this.p.delay, this.ctx.rngFor(this.id));
    this.delayTime.record(d);
    this.ctx.sim.schedule(d, () => {
      this.inDelay--;
      this.wip.update(this.inDelay);
      this.count++;
      const dest = this.ctx.out(this.id);
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
      dest.receive(e);
    });
  }

  override summary(): Record<string, number> {
    return { count: this.count, avgDelay: this.delayTime.mean, avgWip: this.wip.mean() };
  }

  override resetStats(): void {
    this.count = 0;
    this.delayTime.reset();
    this.wip.reset();
    this.wip.update(this.inDelay);
  }
}
