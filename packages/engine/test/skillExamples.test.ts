import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSimulation, type SimModel } from '../src/index.js';

const dir = fileURLToPath(new URL('../../../.claude/skills/yoursimulation/references/examples/', import.meta.url));

describe('skill example models', () => {
  const examples = ['airport.json', 'network.json', 'clinic-pool.json', 'bank.json', 'factory-line.json', 'restaurant.json'];
  for (const file of examples) {
    it(`${file} builds and runs without error`, () => {
      const model = JSON.parse(readFileSync(dir + file, 'utf8')) as SimModel;
      const built = buildSimulation(model, 1);
      // Running exercises the runtime too — e.g. the held-resource leak check
      // fires here, not at build time, so seize/release examples must run clean.
      expect(() => built.run(1200)).not.toThrow();
    });
  }

  it('the five domain models together use every node type', () => {
    const used = new Set<string>();
    for (const file of ['airport.json', 'clinic-pool.json', 'bank.json', 'factory-line.json', 'restaurant.json']) {
      const model = JSON.parse(readFileSync(dir + file, 'utf8')) as SimModel;
      for (const n of model.nodes) used.add(n.type);
    }
    const all = ['source', 'queue', 'resource', 'delay', 'seize', 'release', 'assign', 'batch', 'separate', 'match', 'branch', 'sink'];
    expect([...all].filter((t) => !used.has(t))).toEqual([]); // none missing
  });

  it('clinic-pool exercises pools, reneging, assign, and by-attribute routing end-to-end', () => {
    const model = JSON.parse(readFileSync(dir + 'clinic-pool.json', 'utf8')) as SimModel;
    const built = buildSimulation(model, 1);
    built.run(600);
    const s = built.summaries();
    expect(s['discharged']!['throughput']).toBeGreaterThan(0); // patients flow through
    expect(s['beds']!['utilization']).toBeGreaterThan(0); // the shared pool is used
    expect(s['reg-q']!['reneged']).toBeGreaterThanOrEqual(0); // reneging metric present
  });
});
