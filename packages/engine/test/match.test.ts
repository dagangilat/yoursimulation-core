import { describe, expect, it } from 'vitest';
import { buildSimulation } from '../src/build.js';
import type { SimModel } from '../src/model.js';

// Two part streams (A tagged part=1, B tagged part=2) assembled one-of-each.
function assembly(bArrivals: number): SimModel {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'srcA', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: 3 } },
      { id: 'tagA', type: 'assign', params: { to: 'part', value: { dist: 'const', value: 1 } } },
      { id: 'srcB', type: 'source', params: { interarrival: { dist: 'const', value: 1 }, maxArrivals: bArrivals } },
      { id: 'tagB', type: 'assign', params: { to: 'part', value: { dist: 'const', value: 2 } } },
      { id: 'asm', type: 'match', params: { key: 'part', parts: [1, 2] } },
      { id: 'out', type: 'sink', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'srcA', to: 'tagA' },
      { id: 'e2', from: 'tagA', to: 'asm' },
      { id: 'e3', from: 'srcB', to: 'tagB' },
      { id: 'e4', from: 'tagB', to: 'asm' },
      { id: 'e5', from: 'asm', to: 'out' },
    ],
  };
}

describe('match (assembly)', () => {
  it('emits one combined entity per complete set of parts', () => {
    const built = buildSimulation(assembly(3), 1); // 3 of each part
    built.run(100);
    const s = built.summaries();
    expect(s['asm']!['matched']).toBe(3); // three full assemblies
    expect(s['out']!['throughput']).toBe(3);
  });

  it('waits for the scarce part — only as many assemblies as the limiting stream', () => {
    const built = buildSimulation(assembly(1), 1); // 3 of part 1, only 1 of part 2
    built.run(100);
    const s = built.summaries();
    expect(s['asm']!['matched']).toBe(1); // limited by the single part-2
    expect(s['out']!['throughput']).toBe(1);
  });

  it('a combined entity carries its members (for a later separate)', () => {
    const built = buildSimulation(assembly(3), 1);
    built.run(100);
    // Split the assemblies back: throughput at a separate-fed sink = 2 × matches.
    const m = assembly(3);
    m.nodes.push({ id: 'split', type: 'separate', params: { mode: 'split-batch' } });
    m.nodes.find((n) => n.id === 'out')!; // keep
    m.edges = m.edges.filter((e) => e.id !== 'e5');
    m.edges.push({ id: 'e5', from: 'asm', to: 'split' }, { id: 'e6', from: 'split', to: 'out' });
    const b2 = buildSimulation(m, 1);
    b2.run(100);
    expect(b2.summaries()['out']!['throughput']).toBe(6); // 3 assemblies × 2 members
  });

  it('rejects a match without parts', () => {
    const m = assembly(3);
    m.nodes.find((n) => n.id === 'asm')!.params = { key: 'part', parts: [] };
    expect(() => buildSimulation(m, 1)).toThrow(/non-empty parts/);
  });
});
