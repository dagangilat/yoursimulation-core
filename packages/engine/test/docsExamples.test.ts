import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSimulation, type SimModel } from '../src/index.js';

const dir = fileURLToPath(new URL('../../../docs/examples/', import.meta.url));

describe('docs example models', () => {
  for (const file of ['mm1.json', 'airport-tutorial.json']) {
    it(`${file} is a valid, buildable model`, () => {
      const model = JSON.parse(readFileSync(dir + file, 'utf8')) as SimModel;
      expect(() => buildSimulation(model, 1)).not.toThrow();
    });
  }
});
