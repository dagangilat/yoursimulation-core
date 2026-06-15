#!/usr/bin/env node
import { readFile as fsReadFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSimulation } from './build.js';
import { runExperiment, optimize, recordRun } from './index.js';
import type { SimModel } from './model.js';
import type { RunSettings } from './experiment.js';
import type { OptProblem } from './optimize.js';

export interface CliDeps {
  readFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
}

const defaultDeps: CliDeps = {
  readFile: (p) => fsReadFile(p, 'utf8'),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin as AsyncIterable<Buffer>) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  },
};

interface Parsed { positionals: string[]; flags: Record<string, string | boolean> }
function parseArgs(args: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
    } else positionals.push(a);
  }
  return { positionals, flags };
}

async function loadModel(pathArg: string | undefined, deps: CliDeps): Promise<SimModel> {
  if (!pathArg) throw new Error('a model file path (or "-" for stdin) is required');
  const raw = pathArg === '-' ? await deps.readStdin() : await deps.readFile(pathArg);
  return JSON.parse(raw) as SimModel;
}

function resolveSettings(model: SimModel, flags: Record<string, string | boolean>): RunSettings {
  const m = (model as { settings?: Partial<RunSettings> }).settings ?? {};
  const pick = (k: keyof RunSettings): number | undefined =>
    flags[k] !== undefined ? Number(flags[k]) : m[k];
  const horizon = pick('horizon'); const warmup = pick('warmup');
  const replications = pick('replications'); const seed = pick('seed');
  if ([horizon, warmup, replications, seed].some((v) => v === undefined || Number.isNaN(v))) {
    throw new Error('settings required: provide model.settings or --horizon --warmup --replications --seed');
  }
  return { horizon: horizon!, warmup: warmup!, replications: replications!, seed: seed! };
}

const dump = (value: unknown, flags: Record<string, string | boolean>): string =>
  JSON.stringify(value, null, flags['pretty'] ? 2 : undefined);

export async function runCommand(
  argv: string[],
  deps: CliDeps = defaultDeps,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { positionals, flags } = parseArgs(argv);
  const [command, ...rest] = positionals;
  try {
    switch (command) {
      case 'validate': {
        const model = await loadModel(rest[0], deps);
        try { buildSimulation(model, 1); return { stdout: dump({ ok: true }, flags), stderr: '', exitCode: 0 }; }
        catch (e) { return { stdout: dump({ ok: false, issues: [e instanceof Error ? e.message : String(e)] }, flags), stderr: '', exitCode: 1 }; }
      }
      case 'run': {
        const model = await loadModel(rest[0], deps);
        const result = runExperiment(model, resolveSettings(model, flags), undefined, { detailed: true });
        return { stdout: dump(result, flags), stderr: '', exitCode: 0 };
      }
      case 'record': {
        const model = await loadModel(rest[0], deps);
        const result = recordRun(model, resolveSettings(model, flags));
        return { stdout: dump(result, flags), stderr: '', exitCode: 0 };
      }
      case 'optimize': {
        const model = await loadModel(rest[0], deps);
        if (!rest[1]) throw new Error('optimize requires a problem.json path');
        const problem = JSON.parse(await deps.readFile(rest[1])) as OptProblem;
        const result = optimize(model, problem, resolveSettings(model, flags), {}, resolveSettings(model, flags).seed);
        return { stdout: dump(result, flags), stderr: '', exitCode: 0 };
      }
      default:
        return { stdout: '', stderr: `unknown command: ${command ?? '(none)'}\nusage: validate|run|optimize|record <model.json|-> [problem.json] [--horizon N --warmup N --replications N --seed N --pretty]`, exitCode: 1 };
    }
  } catch (e) {
    return { stdout: '', stderr: e instanceof Error ? e.message : String(e), exitCode: 1 };
  }
}

// Run when executed directly OR via the package's bin symlink (npm/npx).
// argv[1] may be a symlink (e.g. node_modules/.bin/yoursim → dist/cli.js); resolve it
// before comparing to import.meta.url, or `main` never runs when invoked as the bin.
function isDirectEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}
if (isDirectEntry()) {
  void runCommand(process.argv.slice(2)).then(({ stdout, stderr, exitCode }) => {
    if (stdout) process.stdout.write(stdout + '\n');
    if (stderr) process.stderr.write(stderr + '\n');
    process.exit(exitCode);
  });
}
