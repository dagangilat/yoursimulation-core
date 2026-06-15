import { describe, expect, it } from 'vitest';
import { expandGroups, type SimModel } from '../src/index.js';

const grouped: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 } } },
    { id: 'q', type: 'queue', params: {} },
    { id: 'r', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 2 } } },
    { id: 'snk', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'q' },
    { id: 'e2', from: 'q', to: 'r' },
    { id: 'e3', from: 'r', to: 'snk' },
  ],
  groups: [{ id: 'br', members: ['q', 'r'], entry: 'q', exit: 'r', count: 3 }],
};

describe('expandGroups — flatten', () => {
  it('clones members x count, inserts a shortest-queue split, merges exits', () => {
    const flat = expandGroups(grouped, { maxFlattenNodes: 1000 });
    expect(flat.groups).toBeUndefined();
    expect(flat.nodes.filter((n) => n.id.startsWith('q__g')).length).toBe(3);
    expect(flat.nodes.filter((n) => n.id.startsWith('r__g')).length).toBe(3);
    const split = flat.nodes.find((n) => n.type === 'branch' && n.id.includes('br__split'));
    expect(split).toBeDefined();
    expect(flat.edges.filter((e) => e.from === split!.id).map((e) => e.to).sort())
      .toEqual(['q__g_br_1', 'q__g_br_2', 'q__g_br_3']);
    expect(flat.edges.some((e) => e.from === 'src' && e.to === split!.id)).toBe(true);
    expect(flat.edges.filter((e) => e.to === 'snk').map((e) => e.from).sort())
      .toEqual(['r__g_br_1', 'r__g_br_2', 'r__g_br_3']);
    expect(flat.edges.some((e) => e.from === 'q__g_br_1' && e.to === 'r__g_br_1')).toBe(true);
  });

  it('count=1 inlines members with no split and no id suffix', () => {
    const flat = expandGroups({ ...grouped, groups: [{ id: 'br', members: ['q', 'r'], entry: 'q', exit: 'r', count: 1 }] });
    expect(flat.groups).toBeUndefined();
    expect(flat.nodes.map((n) => n.id).sort()).toEqual(['q', 'r', 'snk', 'src']);
    expect(flat.nodes.some((n) => n.type === 'branch')).toBe(false);
  });

  it('does not mutate the input model', () => {
    const before = JSON.stringify(grouped);
    expandGroups(grouped, { maxFlattenNodes: 1000 });
    expect(JSON.stringify(grouped)).toBe(before);
  });
});

describe('expandGroups — aggregate + budget', () => {
  const grouped: SimModel = {
    schemaVersion: 1,
    nodes: [
      { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 } } },
      { id: 'q', type: 'queue', params: { capacity: 5 } },
      { id: 'r', type: 'resource', params: { servers: 2, service: { dist: 'exp', mean: 2 } } },
      { id: 'snk', type: 'sink', params: {} },
    ],
    edges: [{ id: 'e1', from: 'src', to: 'q' }, { id: 'e2', from: 'q', to: 'r' }, { id: 'e3', from: 'r', to: 'snk' }],
    groups: [{ id: 'br', members: ['q', 'r'], entry: 'q', exit: 'r', count: 10 }],
  };

  it('aggregates when flattening would exceed the budget: one copy with scaled capacity', () => {
    const flat = expandGroups(grouped, { maxFlattenNodes: 6 });
    expect(flat.nodes.filter((n) => n.id.startsWith('q')).length).toBe(1);
    const r = flat.nodes.find((n) => n.id === 'r')!;
    expect((r.params as { servers: number }).servers).toBe(20);
    const q = flat.nodes.find((n) => n.id === 'q')!;
    expect((q.params as { capacity?: number }).capacity).toBe(50);
    expect(flat.nodes.some((n) => n.type === 'branch')).toBe(false);
    expect(flat.edges.some((e) => e.from === 'src' && e.to === 'q')).toBe(true);
  });

  it('flattens when within budget', () => {
    const flat = expandGroups(grouped, { maxFlattenNodes: 1000 });
    expect(flat.nodes.filter((n) => n.id.startsWith('q__g')).length).toBe(10);
  });
});

describe('expandGroups — nested', () => {
  it('expands innermost groups first', () => {
    const m: SimModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 1 } } },
        { id: 'q', type: 'queue', params: {} },
        { id: 'r', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 1 } } },
        { id: 'snk', type: 'sink', params: {} },
      ],
      edges: [{ id: 'e1', from: 'src', to: 'q' }, { id: 'e2', from: 'q', to: 'r' }, { id: 'e3', from: 'r', to: 'snk' }],
      groups: [
        { id: 'inner', members: ['r'], entry: 'r', exit: 'r', count: 2 },
        { id: 'outer', members: ['q', 'r'], entry: 'q', exit: 'r', count: 2 },
      ],
    };
    const flat = expandGroups(m, { maxFlattenNodes: 1000 });
    expect(flat.nodes.filter((n) => n.type === 'resource').length).toBeGreaterThanOrEqual(4);
  });
});
