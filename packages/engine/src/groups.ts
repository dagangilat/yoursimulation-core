import type { SimModel, SimGroup, ModelNode, ModelEdge } from './model.js';

export interface ExpandOptions { maxFlattenNodes?: number }

// deterministic per-copy id: "<nodeId>__g_<groupId>_<i>"  (stable across runs)
const cid = (nodeId: string, groupId: string, i: number): string => `${nodeId}__g_${groupId}_${i}`;

function cloneNode(n: ModelNode): ModelNode {
  return { ...n, params: JSON.parse(JSON.stringify(n.params)) as ModelNode['params'] };
}

/** Flatten one group into `count` cloned sub-networks with a shortest-queue split + merged exits. */
function flattenGroup(nodes: ModelNode[], edges: ModelEdge[], g: SimGroup): { nodes: ModelNode[]; edges: ModelEdge[] } {
  const member = new Set(g.members);
  const isMember = (id: string): boolean => member.has(id);
  const others = nodes.filter((n) => !isMember(n.id));
  const memberNodes = nodes.filter((n) => isMember(n.id));
  const internal = edges.filter((e) => isMember(e.from) && isMember(e.to));
  const incoming = edges.filter((e) => !isMember(e.from) && e.to === g.entry);
  const outgoing = edges.filter((e) => e.from === g.exit && !isMember(e.to));
  const untouched = edges.filter((e) => !(isMember(e.from) || isMember(e.to)));

  const outNodes: ModelNode[] = [...others];
  const outEdges: ModelEdge[] = [...untouched];

  for (let i = 1; i <= g.count; i++) {
    for (const n of memberNodes) outNodes.push({ ...cloneNode(n), id: cid(n.id, g.id, i) });
    for (const e of internal) outEdges.push({ ...e, id: `${e.id}__${g.id}_${i}`, from: cid(e.from, g.id, i), to: cid(e.to, g.id, i) });
  }

  const splitId = `${g.id}__split`;
  const entriesAreQueues = memberNodes.find((n) => n.id === g.entry)?.type === 'queue';
  if (incoming.length > 0) {
    outNodes.push({ id: splitId, type: 'branch', params: entriesAreQueues ? { mode: 'shortest-queue' } : { mode: 'probability' } } as ModelNode);
    for (const e of incoming) outEdges.push({ ...e, id: `${e.id}__toSplit`, to: splitId });
    for (let k = 1; k <= g.count; k++) {
      const to = cid(g.entry, g.id, k);
      outEdges.push(entriesAreQueues
        ? { id: `${splitId}__${k}`, from: splitId, to }
        : { id: `${splitId}__${k}`, from: splitId, to, probability: 1 / g.count });
    }
  }
  for (let i = 1; i <= g.count; i++) {
    for (const e of outgoing) outEdges.push({ ...e, id: `${e.id}__${g.id}_${i}`, from: cid(g.exit, g.id, i) });
  }
  return { nodes: outNodes, edges: outEdges };
}

type Dist = Record<string, unknown> & { dist: string };

/** Multiply a source's arrival rate by k (shorter interarrival). Scales the dist's central value(s). */
function scaleRate(d: Dist, k: number): Dist {
  const div = (v: unknown) => (typeof v === 'number' ? v / k : v);
  switch (d.dist) {
    case 'exp': return { ...d, mean: div(d.mean) };
    case 'const': return { ...d, value: div(d.value) };
    case 'normal': return { ...d, mean: div(d.mean), sd: div(d.sd) };
    case 'erlang': return { ...d, mean: div(d.mean) };
    case 'uniform': return { ...d, min: div(d.min), max: div(d.max) };
    case 'triangular': return { ...d, min: div(d.min), mode: div(d.mode), max: div(d.max) };
    case 'lognormal': return { ...d, mu: typeof d.mu === 'number' ? d.mu - Math.log(k) : d.mu };
    case 'empirical': return { ...d, values: Array.isArray(d.values) ? (d.values as number[]).map((v) => v / k) : d.values };
    default: return d;
  }
}

/** Aggregate a replicated group into one copy with capacities/rates scaled by count. */
function aggregateGroup(nodes: ModelNode[], g: SimGroup): ModelNode[] {
  const member = new Set(g.members);
  return nodes.map((n) => {
    if (!member.has(n.id)) return n;
    const p = { ...(n.params as Record<string, unknown>) };
    if (n.type === 'resource' && typeof p.servers === 'number') p.servers = p.servers * g.count;
    if (n.type === 'queue' && typeof p.capacity === 'number') p.capacity = p.capacity * g.count;
    if (n.type === 'source' && p.interarrival) p.interarrival = scaleRate(p.interarrival as Dist, g.count);
    return { ...n, params: p as ModelNode['params'] };
  });
}

/** Pure: returns a flat SimModel (no `groups`). count=1 inlines; count>1 flattens within budget, else aggregate-scales. */
export function expandGroups(model: SimModel, opts: ExpandOptions = {}): SimModel {
  if (!model.groups || model.groups.length === 0) {
    const { groups: _g, ...rest } = model;
    return rest;
  }
  const budget = opts.maxFlattenNodes ?? 1500;
  let nodes = model.nodes.map(cloneNode);
  let edges = model.edges.map((e) => ({ ...e }));

  const groups = model.groups;
  // innermost-first: a group whose members are a subset of another's goes first.
  const depth = (g: SimGroup): number => groups.filter((o) => o !== g && g.members.every((m) => o.members.includes(m))).length;
  const ordered = [...groups].sort((a, b) => depth(b) - depth(a)).map((g) => ({ ...g, members: [...g.members] }));

  // When an inner group expands a member id into per-copy ids, any enclosing group
  // that still references that member must pick up the new copies so it replicates
  // the already-expanded sub-network (innermost-first nesting).
  const remap = (g: SimGroup, copies: Map<string, string[]>): SimGroup => {
    const members: string[] = [];
    for (const m of g.members) members.push(...(copies.get(m) ?? [m]));
    const lastOf = (id: string) => copies.get(id)?.[copies.get(id)!.length - 1] ?? id;
    return { ...g, members, entry: copies.get(g.entry)?.[0] ?? g.entry, exit: lastOf(g.exit) };
  };

  let running = nodes.length;
  for (const [gi, g] of ordered.entries()) {
    if (g.count <= 1) continue;
    if (running + g.members.length * g.count <= budget) {
      ({ nodes, edges } = flattenGroup(nodes, edges, g));
      running = nodes.length;
      const copies = new Map<string, string[]>(
        g.members.map((m) => [m, Array.from({ length: g.count }, (_, i) => cid(m, g.id, i + 1))]),
      );
      for (let j = gi + 1; j < ordered.length; j++) {
        const og = ordered[j];
        if (og && og.members.some((m) => copies.has(m))) ordered[j] = remap(og, copies);
      }
    } else {
      nodes = aggregateGroup(nodes, g);
    }
  }
  return { schemaVersion: model.schemaVersion, nodes, edges, ...(model.resources ? { resources: model.resources } : {}) };
}
