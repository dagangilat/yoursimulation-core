import { Random, streamSeed } from './random.js';
import { Simulation } from './simulation.js';
import { RuntimeNode, SinkNode, SourceNode, QueueNode, ResourceNode, BranchNode, DelayNode, SeizeNode, ReleaseNode, AssignNode, BatchNode, SeparateNode, ResourcePoolRuntime, type NodeContext } from './nodes.js';
import type { SimModel, SourceParams, QueueParams, ResourceParams, DelayParams, SeizeParams, ReleaseParams, AssignParams, BranchParams, BatchParams, SeparateParams } from './model.js';

export interface BuiltSimulation {
  sim: Simulation;
  nodes: Map<string, RuntimeNode>;
  pools: Map<string, ResourcePoolRuntime>;
  run(until: number): void;
  resetStats(): void;
  summaries(): Record<string, Record<string, number>>;
}

function validate(model: SimModel): void {
  const ids = new Set<string>();
  for (const n of model.nodes) {
    if (ids.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
    ids.add(n.id);
  }
  for (const e of model.edges) {
    if (!ids.has(e.from)) throw new Error(`edge ${e.id} references unknown node: ${e.from}`);
    if (!ids.has(e.to)) throw new Error(`edge ${e.id} references unknown node: ${e.to}`);
  }
  for (const n of model.nodes) {
    const outs = model.edges.filter((e) => e.from === n.id);
    if (n.type === 'sink' && outs.length > 0) throw new Error(`sink ${n.id} cannot have outgoing edges`);
    if (n.type !== 'sink' && n.type !== 'branch' && outs.length !== 1)
      throw new Error(`node ${n.id} must have exactly one outgoing edge`);
    if (n.type === 'branch') {
      if (outs.length === 0) throw new Error(`branch ${n.id} needs at least one outgoing edge`);
      const mode = (n.params as BranchParams).mode ?? 'probability';
      if (mode === 'probability') {
        const total = outs.reduce((a, e) => a + (e.probability ?? NaN), 0);
        if (!(Math.abs(total - 1) < 1e-9))
          throw new Error(`branch ${n.id} out-edge probabilities must sum to 1`);
      } else if (mode === 'by-attribute') {
        if (!(n.params as BranchParams).key)
          throw new Error(`by-attribute branch ${n.id} needs a key`);
        if (outs.filter((e) => e.value === undefined).length > 1)
          throw new Error(`by-attribute branch ${n.id} may have at most one default (value-less) out-edge`);
      }
    }
    if (n.type === 'assign' && !(n.params as AssignParams).to)
      throw new Error(`assign ${n.id} needs a target (an attribute name or "priority")`);
    if (n.type === 'batch') {
      const size = (n.params as BatchParams).size;
      if (!(Number.isInteger(size) && size >= 1))
        throw new Error(`batch ${n.id} size must be an integer >= 1`);
    }
    if (n.type === 'separate') {
      const sp = n.params as SeparateParams;
      if (sp.mode === 'duplicate' && sp.copies !== undefined && !(Number.isInteger(sp.copies) && sp.copies >= 1))
        throw new Error(`separate ${n.id} copies must be an integer >= 1`);
    }
  }
  // Resources must be fed by queues so entities always have somewhere to wait.
  for (const e of model.edges) {
    const to = model.nodes.find((n) => n.id === e.to)!;
    const from = model.nodes.find((n) => n.id === e.from)!;
    if (to.type === 'resource' && from.type !== 'queue')
      throw new Error(`resource ${to.id} must be fed by a queue (got ${from.type} ${from.id})`);
  }
  // Resource pools: unique ids, distinct from node ids, positive capacity.
  const poolIds = new Set<string>();
  for (const pool of model.resources ?? []) {
    if (poolIds.has(pool.id)) throw new Error(`duplicate pool id: ${pool.id}`);
    if (ids.has(pool.id)) throw new Error(`pool id ${pool.id} collides with a node id`);
    poolIds.add(pool.id);
    if (!(Number.isInteger(pool.capacity) && pool.capacity >= 1))
      throw new Error(`pool ${pool.id} capacity must be an integer >= 1`);
  }
  // Seize/release must reference a pool; a seize cannot ask for more than capacity.
  for (const n of model.nodes) {
    if (n.type === 'seize' || n.type === 'release') {
      const p = n.params as { pool?: string; units?: number };
      if (p.pool === undefined || !poolIds.has(p.pool))
        throw new Error(`${n.type} ${n.id} references unknown pool: ${p.pool}`);
      if (p.units !== undefined && !(Number.isInteger(p.units) && p.units >= 1))
        throw new Error(`${n.type} ${n.id} units must be an integer >= 1`);
      const cap = (model.resources ?? []).find((r) => r.id === p.pool)!.capacity;
      if (n.type === 'seize' && (p.units ?? 1) > cap)
        throw new Error(`seize ${n.id} requests ${p.units} units but pool ${p.pool} has capacity ${cap}`);
    }
  }
  // Queues and branches forward entities within the same instant; a cycle made
  // only of them would recurse forever at a single simulation time.
  const flowThrough = new Set(
    model.nodes.filter((n) => n.type === 'queue' || n.type === 'branch').map((n) => n.id),
  );
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id))
      throw new Error('model contains an instantaneous loop of queues/branches; route it through a resource');
    visiting.add(id);
    for (const e of model.edges) {
      if (e.from === id && flowThrough.has(e.to)) visit(e.to);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const id of flowThrough) visit(id);
}

export function buildSimulation(
  model: SimModel,
  seed: number,
  emit?: (e: import('./events.js').SimEvent) => void,
): BuiltSimulation {
  validate(model);
  const sim = new Simulation();
  const nodes = new Map<string, RuntimeNode>();
  const pools = new Map<string, ResourcePoolRuntime>();
  for (const pool of model.resources ?? []) {
    pools.set(pool.id, new ResourcePoolRuntime(pool.id, pool.capacity, sim));
  }
  const rngs = new Map<string, Random>();
  let entityCounter = 0;

  const singleOut = new Map<string, string>();
  for (const n of model.nodes) {
    const out = model.edges.find((e) => e.from === n.id);
    if (out && n.type !== 'branch') singleOut.set(n.id, out.to);
  }

  const ctx: NodeContext = {
    sim,
    nextEntityId: () => entityCounter++,
    out: (id) => nodes.get(singleOut.get(id)!)!,
    outs: (id) =>
      model.edges
        .filter((e) => e.from === id)
        .map((e) => ({ node: nodes.get(e.to)!, probability: e.probability ?? 1, value: e.value })),
    upstreamQueues: (id) =>
      model.edges
        .filter((e) => e.to === id)
        .map((e) => nodes.get(e.from)!)
        .filter((n): n is RuntimeNode & { dispatch(): void } => 'dispatch' in n),
    rngFor: (id) => {
      let rng = rngs.get(id);
      if (!rng) {
        rng = new Random(streamSeed(seed, id));
        rngs.set(id, rng);
      }
      return rng;
    },
    pool: (id) => pools.get(id)!,
    emit,
  };

  for (const n of model.nodes) {
    nodes.set(n.id, makeNode(n.id, n.type, n.params, ctx));
  }

  let started = false;
  return {
    sim,
    nodes,
    pools,
    run(until) {
      if (!started) {
        started = true;
        for (const n of nodes.values()) n.start();
      }
      sim.run(until);
    },
    resetStats() {
      for (const n of nodes.values()) n.resetStats();
      for (const p of pools.values()) p.resetStats();
    },
    summaries() {
      const out: Record<string, Record<string, number>> = {};
      for (const [id, n] of nodes) out[id] = n.summary();
      for (const [id, p] of pools) out[id] = p.summary();
      return out;
    },
  };
}

function makeNode(
  id: string,
  type: string,
  params: unknown,
  ctx: NodeContext,
): RuntimeNode {
  switch (type) {
    case 'source':
      return new SourceNode(id, ctx, params as SourceParams);
    case 'sink':
      return new SinkNode(id, ctx);
    case 'queue':
      return new QueueNode(id, ctx, params as QueueParams);
    case 'resource':
      return new ResourceNode(id, ctx, params as ResourceParams);
    case 'branch':
      return new BranchNode(id, ctx, params as BranchParams);
    case 'assign':
      return new AssignNode(id, ctx, params as AssignParams);
    case 'batch':
      return new BatchNode(id, ctx, params as BatchParams);
    case 'separate':
      return new SeparateNode(id, ctx, params as SeparateParams);
    case 'delay':
      return new DelayNode(id, ctx, params as DelayParams);
    case 'seize':
      return new SeizeNode(id, ctx, params as SeizeParams);
    case 'release':
      return new ReleaseNode(id, ctx, params as ReleaseParams);
    default:
      throw new Error(`unsupported node type: ${type}`);
  }
}
