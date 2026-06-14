import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSimulation, runExperiment, type SimModel } from '../src/index.js';

// Top-level examples/ — the runnable domain models shown in the docs.
const dir = fileURLToPath(new URL('../../../examples/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('top-level example models', () => {
  for (const file of files) {
    it(`${file} builds, runs, and reports throughput`, () => {
      const model = JSON.parse(readFileSync(dir + file, 'utf8')) as SimModel;
      const r = runExperiment(model, { horizon: 600, warmup: 60, replications: 4, seed: 1 });
      const sinks = model.nodes.filter((n) => n.type === 'sink').map((n) => n.id);
      const total = sinks.reduce((s, id) => s + (r.nodes[id]?.['throughput']?.mean ?? 0), 0);
      expect(total).toBeGreaterThan(0); // entities flow all the way through
    });
  }

  it('the example library uses every node type', () => {
    const used = new Set<string>();
    for (const file of files) {
      const m = JSON.parse(readFileSync(dir + file, 'utf8')) as SimModel;
      for (const n of m.nodes) used.add(n.type);
      buildSimulation(m, 1); // each is a valid graph
    }
    const all = ['source', 'queue', 'resource', 'delay', 'seize', 'release', 'assign', 'batch', 'separate', 'match', 'branch', 'sink'];
    expect(all.filter((t) => !used.has(t))).toEqual([]);
  });
});
