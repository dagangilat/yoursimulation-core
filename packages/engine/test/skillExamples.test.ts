import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSimulation, type SimModel } from '../src/index.js';

const dir = fileURLToPath(new URL('../../../.claude/skills/yoursimulation/references/examples/', import.meta.url));

describe('skill example models', () => {
  for (const file of ['airport.json', 'network.json']) {
    it(`${file} is a valid, buildable model`, () => {
      const model = JSON.parse(readFileSync(dir + file, 'utf8')) as SimModel;
      expect(() => buildSimulation(model, 1)).not.toThrow();
    });
  }
});
