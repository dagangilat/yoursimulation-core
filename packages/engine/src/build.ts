import { Random, streamSeed } from './random.js';
import { Simulation } from './simulation.js';
import { RuntimeNode, SinkNode, SourceNode, QueueNode, ResourceNode, BranchNode, type NodeContext } from './nodes.js';
import type { SimModel, SourceParams, QueueParams, ResourceParams } from './model.js';

export interface BuiltSimulation {
  sim: Simulation;
  nodes: Map<string, RuntimeNode>;
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
      const total = outs.reduce((a, e) => a + (e.probability ?? NaN), 0);
      if (!(Math.abs(total - 1) < 1e-9))
        throw new Error(`branch ${n.id} out-edge probabilities must sum to 1`);
    }
  }
  // Resources must be fed by queues so entities always have somewhere to wait.
  for (const e of model.edges) {
    const to = model.nodes.find((n) => n.id === e.to)!;
    const from = model.nodes.find((n) => n.id === e.from)!;
    if (to.type === 'resource' && from.type !== 'queue')
      throw new Error(`resource ${to.id} must be fed by a queue (got ${from.type} ${from.id})`);
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
        .map((e) => ({ node: nodes.get(e.to)!, probability: e.probability ?? 1 })),
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
    emit,
  };

  for (const n of model.nodes) {
    nodes.set(n.id, makeNode(n.id, n.type, n.params, ctx));
  }

  let started = false;
  return {
    sim,
    nodes,
    run(until) {
      if (!started) {
        started = true;
        for (const n of nodes.values()) n.start();
      }
      sim.run(until);
    },
    resetStats() {
      for (const n of nodes.values()) n.resetStats();
    },
    summaries() {
      const out: Record<string, Record<string, number>> = {};
      for (const [id, n] of nodes) out[id] = n.summary();
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
      return new BranchNode(id, ctx);
    default:
      throw new Error(`unsupported node type: ${type}`);
  }
}
