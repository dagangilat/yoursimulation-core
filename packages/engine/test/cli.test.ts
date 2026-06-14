import { describe, expect, it } from 'vitest';
import { runCommand, type CliDeps } from '../src/cli.js';

const goodModel = {
  schemaVersion: 1,
  settings: { timeUnit: 'min', horizon: 200, warmup: 20, replications: 4, seed: 1 },
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 2 } } },
    { id: 'q', type: 'queue', params: {} },
    { id: 'r', type: 'resource', params: { servers: 2, service: { dist: 'exp', mean: 3 } } },
    { id: 'snk', type: 'sink', params: {} },
  ],
  edges: [{ id: 'e1', from: 'src', to: 'q' }, { id: 'e2', from: 'q', to: 'r' }, { id: 'e3', from: 'r', to: 'snk' }],
};
const brokenModel = { schemaVersion: 1, nodes: [{ id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 2 } } }], edges: [{ id: 'e1', from: 'src', to: 'ghost' }] };
const problem = { variables: [{ nodeId: 'r', param: 'servers', min: 1, max: 5, costPerUnit: 10 }], constraints: [{ nodeId: 'q', metric: 'avgWait', soft: 5, hard: 15, wSoft: 50, wHard: 500 }] };

const deps = (files: Record<string, unknown>, stdin = ''): CliDeps => ({
  readFile: async (p: string) => { if (!(p in files)) throw new Error(`ENOENT: ${p}`); return JSON.stringify(files[p]); },
  readStdin: async () => stdin,
});

describe('cli runCommand', () => {
  it('validate: ok for a good model', async () => {
    const r = await runCommand(['validate', 'm.json'], deps({ 'm.json': goodModel }));
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true });
  });
  it('validate: reports issues for a broken model (exit 1)', async () => {
    const r = await runCommand(['validate', 'm.json'], deps({ 'm.json': brokenModel }));
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.length).toBeGreaterThan(0);
  });
  it('run: returns an ExperimentResult with nodes', async () => {
    const r = await runCommand(['run', 'm.json'], deps({ 'm.json': goodModel }));
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout) as { replications: number; nodes: Record<string, unknown> };
    expect(out.replications).toBe(4);
    expect(Object.keys(out.nodes).length).toBeGreaterThan(0);
  });
  it('optimize: returns a best candidate', async () => {
    const r = await runCommand(['optimize', 'm.json', 'p.json'], deps({ 'm.json': goodModel, 'p.json': problem }));
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout) as { best: { feasible: boolean; values: Record<string, number> } };
    expect(typeof out.best.feasible).toBe('boolean');
  });
  it('record: returns a recording with events', async () => {
    const r = await runCommand(['record', 'm.json'], deps({ 'm.json': goodModel }));
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout) as { events: unknown[] };
    expect(Array.isArray(out.events)).toBe(true);
  });
  it('reads the model from stdin via "-"', async () => {
    const r = await runCommand(['run', '-'], deps({}, JSON.stringify(goodModel)));
    expect(r.exitCode).toBe(0);
  });
  it('flags override model settings', async () => {
    const r = await runCommand(['run', 'm.json', '--replications', '2'], deps({ 'm.json': goodModel }));
    expect((JSON.parse(r.stdout) as { replications: number }).replications).toBe(2);
  });
  it('unknown command → exit 1 with stderr', async () => {
    const r = await runCommand(['frobnicate', 'm.json'], deps({ 'm.json': goodModel }));
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/unknown command/i);
  });
});
