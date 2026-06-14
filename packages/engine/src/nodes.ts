import { sample } from './distributions.js';
import { Tally, TimeWeighted } from './stats.js';
import type { Entity } from './entity.js';
import type { Random } from './random.js';
import type { Simulation } from './simulation.js';
import type { EventHandle } from './calendar.js';
import type { SourceParams, QueueParams, ResourceParams, DelayParams, SeizeParams, ReleaseParams, AssignParams, BranchParams, BatchParams, SeparateParams } from './model.js';
import type { SimEvent } from './events.js';

/** Services the runtime nodes need; implemented by build.ts. */
export interface NodeContext {
  sim: Simulation;
  nextEntityId(): number;
  /** Single downstream node (non-branch nodes). */
  out(nodeId: string): RuntimeNode;
  /** All downstream nodes with their edge probability/value (branch nodes). */
  outs(nodeId: string): { node: RuntimeNode; probability: number; value?: number }[];
  /** Queues feeding this node, for pull-on-release and re-queuing preempted entities. */
  upstreamQueues(nodeId: string): (RuntimeNode & { dispatch(): void })[];
  rngFor(nodeId: string): Random;
  /** Shared resource pool by id, for seize/release. */
  pool(id: string): ResourcePoolRuntime;
  emit?(e: SimEvent): void;
}

export abstract class RuntimeNode {
  constructor(
    readonly id: string,
    protected readonly ctx: NodeContext,
  ) {}

  canAccept(_forPriority?: number): boolean {
    return true;
  }

  receive(_e: Entity): void {
    throw new Error(`node ${this.id} cannot receive entities`);
  }

  /** Called once before the first run; sources schedule their first arrival here. */
  start(): void {}

  resetStats(): void {}

  /** Congestion measure for join-shortest-queue routing (lower = preferred). */
  congestion(): number {
    return 0;
  }

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
    if (e.held) {
      for (const [poolId, units] of e.held) {
        if (units > 0)
          throw new Error(`entity ${e.id} reached sink ${this.id} still holding ${units} of pool ${poolId} — add a release`);
      }
    }
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

  /** The entity pop() would choose next, without removing it. */
  private peekNext(): Entity {
    const d = this.p.discipline ?? 'fifo';
    if (d === 'fifo') return this.items[0]!;
    if (d === 'lifo') return this.items[this.items.length - 1]!;
    let best = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i]!.priority < this.items[best]!.priority) best = i;
    }
    return this.items[best]!;
  }

  /** Push waiting entities downstream while it can accept (passing the candidate's
   *  priority so a preemptive resource can decide to bump a lower-priority entity). */
  dispatch(): void {
    const down = this.ctx.out(this.id);
    while (this.items.length > 0 && down.canAccept(this.peekNext().priority)) {
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

  override congestion(): number {
    // Occupancy of the whole station: those waiting here plus those busy downstream.
    return this.items.length + this.ctx.out(this.id).congestion();
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

interface InService {
  entity: Entity;
  handle: EventHandle;
  completionTime: number;
}

export class ResourceNode extends RuntimeNode {
  private inService: InService[] = [];
  preemptions = 0;
  readonly utilization: TimeWeighted;

  constructor(id: string, ctx: NodeContext, private readonly p: ResourceParams) {
    super(id, ctx);
    this.utilization = new TimeWeighted(ctx.sim);
  }

  private get busy(): number {
    return this.inService.length;
  }

  override canAccept(forPriority?: number): boolean {
    if (this.busy < this.p.servers) return true;
    // Full: a preemptive resource still accepts an arrival that outranks its
    // weakest in-service entity (strict <, so equal priority does not preempt).
    if (this.p.preemption !== undefined && forPriority !== undefined)
      return forPriority < this.weakestServedPriority();
    return false;
  }

  override congestion(): number {
    return this.busy;
  }

  private weakestServedPriority(): number {
    let w = -Infinity;
    for (const s of this.inService) if (s.entity.priority > w) w = s.entity.priority;
    return w;
  }

  override receive(e: Entity): void {
    if (this.busy >= this.p.servers) {
      // canAccept() guaranteed a preemption is allowed. Bump the weakest victim,
      // start the arrival (refilling the slot), THEN re-queue the victim so it
      // doesn't immediately bounce back into the now-full resource.
      const victim = this.preemptWeakest();
      this.startService(e);
      this.requeue(victim);
    } else {
      this.startService(e);
    }
  }

  private startService(e: Entity): void {
    const serviceTime = e.remainingService ?? sample(this.p.service, this.ctx.rngFor(this.id));
    e.remainingService = undefined;
    const entry: InService = { entity: e, handle: { cancel() {} }, completionTime: this.ctx.sim.clock + serviceTime };
    this.inService.push(entry);
    this.utilization.update(this.busy / this.p.servers);
    this.ctx.emit?.({ kind: 'server', t: this.ctx.sim.clock, nodeId: this.id, busy: this.busy, servers: this.p.servers });
    entry.handle = this.ctx.sim.schedule(serviceTime, () => {
      this.inService = this.inService.filter((s) => s !== entry);
      this.utilization.update(this.busy / this.p.servers);
      this.ctx.emit?.({ kind: 'server', t: this.ctx.sim.clock, nodeId: this.id, busy: this.busy, servers: this.p.servers });
      const dest = this.ctx.out(this.id);
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
      dest.receive(e);
      for (const q of this.ctx.upstreamQueues(this.id)) q.dispatch();
    });
  }

  private preemptWeakest(): Entity {
    let idx = 0;
    for (let i = 1; i < this.inService.length; i++) {
      if (this.inService[i]!.entity.priority > this.inService[idx]!.entity.priority) idx = i;
    }
    const entry = this.inService.splice(idx, 1)[0]!;
    entry.handle.cancel();
    this.preemptions++;
    this.utilization.update(this.busy / this.p.servers);
    if (this.p.preemption === 'resume')
      entry.entity.remainingService = entry.completionTime - this.ctx.sim.clock;
    // 'restart' → leave remainingService unset so the next service resamples.
    return entry.entity;
  }

  private requeue(victim: Entity): void {
    const ups = this.ctx.upstreamQueues(this.id);
    if (ups.length > 0) ups[0]!.receive(victim);
  }

  override summary(): Record<string, number> {
    return { utilization: this.utilization.mean(), preemptions: this.preemptions };
  }

  // servers >= 1 is assumed (schema validation owns the guard).
  override resetStats(): void {
    this.utilization.reset();
    this.utilization.update(this.busy / this.p.servers);
    this.preemptions = 0;
  }
}

export class BranchNode extends RuntimeNode {
  constructor(id: string, ctx: NodeContext, private readonly p: BranchParams) {
    super(id, ctx);
  }

  override receive(e: Entity): void {
    const outs = this.ctx.outs(this.id);
    const mode = this.p.mode ?? 'probability';
    let target: RuntimeNode;

    if (mode === 'shortest-queue') {
      // Join the least-congested downstream node; break ties RANDOMLY so a
      // symmetric system stays balanced (always picking the first biases it).
      const cong = outs.map((o) => o.node.congestion());
      const min = Math.min(...cong);
      const tied = outs.filter((_, i) => cong[i] === min);
      target = (tied.length === 1
        ? tied[0]!
        : tied[Math.floor(this.ctx.rngFor(this.id).next() * tied.length)]!
      ).node;
    } else if (mode === 'by-attribute') {
      const v = e.attributes?.[this.p.key ?? ''];
      const match = outs.find((o) => o.value === v) ?? outs.find((o) => o.value === undefined);
      target = (match ?? outs[outs.length - 1]!).node;
    } else {
      // probability
      const u = this.ctx.rngFor(this.id).next();
      let cum = 0;
      let chosen = outs[outs.length - 1]!.node; // float-rounding fallback
      for (const o of outs) {
        cum += o.probability;
        if (u < cum) {
          chosen = o.node;
          break;
        }
      }
      target = chosen;
    }

    this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: target.id });
    target.receive(e);
  }

  override summary(): Record<string, number> {
    return {};
  }
}

/** Set an attribute (or the entity's priority) to a sampled value, then forward. */
export class AssignNode extends RuntimeNode {
  count = 0;

  constructor(id: string, ctx: NodeContext, private readonly p: AssignParams) {
    super(id, ctx);
  }

  override receive(e: Entity): void {
    const v = sample(this.p.value, this.ctx.rngFor(this.id));
    if (this.p.to === 'priority') {
      e.priority = v;
    } else {
      (e.attributes ?? (e.attributes = {}))[this.p.to] = v;
    }
    this.count++;
    const dest = this.ctx.out(this.id);
    this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
    dest.receive(e);
  }

  override summary(): Record<string, number> {
    return { assigned: this.count };
  }

  override resetStats(): void {
    this.count = 0;
  }
}

/** Accumulate `size` entities, then emit one representative (permanent or temporary). */
export class BatchNode extends RuntimeNode {
  batches = 0;
  private holding: Entity[] = [];

  constructor(id: string, ctx: NodeContext, private readonly p: BatchParams) {
    super(id, ctx);
  }

  override receive(e: Entity): void {
    this.holding.push(e);
    if (this.holding.length < this.p.size) return;
    const members = this.holding;
    this.holding = [];
    const batch: Entity = {
      id: this.ctx.nextEntityId(),
      // Conservative cycle time: the batch is as old as its earliest member.
      createdAt: Math.min(...members.map((m) => m.createdAt)),
      priority: members[0]!.priority,
      enqueuedAt: 0,
    };
    if ((this.p.mode ?? 'permanent') === 'temporary') batch.members = members;
    this.batches++;
    const dest = this.ctx.out(this.id);
    this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: batch.id, from: this.id, to: dest.id });
    dest.receive(batch);
  }

  override summary(): Record<string, number> {
    return { batches: this.batches };
  }

  override resetStats(): void {
    this.batches = 0;
  }
}

/** Split a temporary batch into its members, or duplicate an entity into copies. */
export class SeparateNode extends RuntimeNode {
  emitted = 0;

  constructor(id: string, ctx: NodeContext, private readonly p: SeparateParams) {
    super(id, ctx);
  }

  override receive(e: Entity): void {
    const dest = this.ctx.out(this.id);
    const forward = (x: Entity): void => {
      this.emitted++;
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: x.id, from: this.id, to: dest.id });
      dest.receive(x);
    };
    if ((this.p.mode ?? 'split-batch') === 'duplicate') {
      const copies = this.p.copies ?? 2;
      for (let i = 0; i < copies; i++) {
        forward(i === 0 ? e : { id: this.ctx.nextEntityId(), createdAt: e.createdAt, priority: e.priority, enqueuedAt: 0, attributes: e.attributes ? { ...e.attributes } : undefined });
      }
    } else if (e.members) {
      const members = e.members;
      e.members = undefined;
      for (const m of members) forward(m);
    } else {
      forward(e); // not a batch — pass through unchanged
    }
  }

  override summary(): Record<string, number> {
    return { emitted: this.emitted };
  }

  override resetStats(): void {
    this.emitted = 0;
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

interface WaitingRequest {
  units: number;
  priority: number;
  seq: number;
  grant(): void;
}

/** A named pool of interchangeable capacity, seized and released across steps. */
export class ResourcePoolRuntime {
  available: number;
  readonly utilization: TimeWeighted;
  readonly queueLen: TimeWeighted;
  private waiting: WaitingRequest[] = [];
  private seq = 0;
  private dispatching = false;

  constructor(readonly id: string, readonly capacity: number, sim: Simulation) {
    this.available = capacity;
    this.utilization = new TimeWeighted(sim);
    this.utilization.update(0);
    this.queueLen = new TimeWeighted(sim);
  }

  private busyFraction(): number {
    return (this.capacity - this.available) / this.capacity;
  }

  /** Acquire `units` for `entity`, calling `onGrant` now (if free) or later (on release). */
  request(entity: Entity, units: number, priority: number, onGrant: () => void): void {
    const grant = (): void => {
      this.available -= units;
      this.utilization.update(this.busyFraction());
      const held = entity.held ?? (entity.held = new Map());
      held.set(this.id, (held.get(this.id) ?? 0) + units);
      onGrant();
    };
    if (units <= this.available) {
      grant();
    } else {
      this.waiting.push({ units, priority, seq: this.seq++, grant });
      this.queueLen.update(this.waiting.length);
    }
  }

  release(entity: Entity, units?: number): void {
    const held = entity.held?.get(this.id) ?? 0;
    const u = units ?? held;
    if (u > held)
      throw new Error(`release of ${u} from pool ${this.id} but entity ${entity.id} holds ${held}`);
    this.available += u;
    const remaining = held - u;
    if (remaining > 0) entity.held!.set(this.id, remaining);
    else entity.held?.delete(this.id);
    this.utilization.update(this.busyFraction());
    this.dispatch();
  }

  /** Grant feasible waiting requests in (priority, seq) order, skipping infeasible ones. */
  private dispatch(): void {
    if (this.dispatching) return; // re-entrant release; the running loop will re-scan
    this.dispatching = true;
    try {
      this.waiting.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      let i = 0;
      while (i < this.waiting.length) {
        const r = this.waiting[i]!;
        if (r.units <= this.available) {
          this.waiting.splice(i, 1);
          this.queueLen.update(this.waiting.length);
          r.grant();
          i = 0; // availability changed — re-scan from the highest priority
        } else {
          i++;
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  summary(): Record<string, number> {
    return { utilization: this.utilization.mean(), avgQueue: this.queueLen.mean() };
  }

  resetStats(): void {
    this.utilization.reset();
    this.utilization.update(this.busyFraction());
    this.queueLen.reset();
    this.queueLen.update(this.waiting.length);
  }
}

/** Acquire pool capacity, holding it until a downstream release. Has its own wait list. */
export class SeizeNode extends RuntimeNode {
  seized = 0;
  readonly waitTime = new Tally();

  constructor(id: string, ctx: NodeContext, private readonly p: SeizeParams) {
    super(id, ctx);
  }

  override receive(e: Entity): void {
    const units = this.p.units ?? 1;
    const priority = this.p.priority ?? e.priority;
    const t0 = this.ctx.sim.clock;
    this.ctx.pool(this.p.pool).request(e, units, priority, () => {
      this.seized++;
      this.waitTime.record(this.ctx.sim.clock - t0);
      const dest = this.ctx.out(this.id);
      this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
      dest.receive(e);
    });
  }

  override summary(): Record<string, number> {
    return { seized: this.seized, avgWait: this.waitTime.mean };
  }

  override resetStats(): void {
    this.seized = 0;
    this.waitTime.reset();
  }
}

/** Return pool capacity held by the entity, then let the pool serve waiting seizers. */
export class ReleaseNode extends RuntimeNode {
  released = 0;

  constructor(id: string, ctx: NodeContext, private readonly p: ReleaseParams) {
    super(id, ctx);
  }

  override receive(e: Entity): void {
    this.ctx.pool(this.p.pool).release(e, this.p.units);
    this.released++;
    const dest = this.ctx.out(this.id);
    this.ctx.emit?.({ kind: 'move', t: this.ctx.sim.clock, entityId: e.id, from: this.id, to: dest.id });
    dest.receive(e);
  }

  override summary(): Record<string, number> {
    return { released: this.released };
  }

  override resetStats(): void {
    this.released = 0;
  }
}
