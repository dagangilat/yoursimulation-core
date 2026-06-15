/**
 * Runs the engine against every bundled example model and writes a single
 * self-contained HTML report (validate → expand groups → run → KPIs).
 *
 *   npx tsx scripts/examples-report.ts [outfile.html]
 *
 * Default output: ../../examples-report.html (repo root).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { buildSimulation, runExperiment, expandGroups, type SimModel, type RunSettings } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outFile = resolve(process.argv[2] ?? join(repoRoot, 'examples-report.html'));

/** Directories that hold example model JSON files. */
const EXAMPLE_DIRS = [
  'packages/engine/../../.claude/skills/yoursimulation/references/examples',
  '.claude/skills/yoursimulation/references/examples',
  'docs/examples',
].map((d) => resolve(repoRoot, d));

interface RunInfo {
  file: string;
  name: string;
  nodes: number;
  edges: number;
  hasGroups: boolean;
  status: 'ok' | 'error';
  error?: string;
  durationMs: number;
  replications: number;
  metrics: Record<string, Record<string, { mean: number; ci95: number }>>;
}

function settingsOf(m: { settings?: Partial<RunSettings> }): RunSettings {
  const s = m.settings ?? {};
  return {
    horizon: s.horizon ?? 480,
    warmup: s.warmup ?? 60,
    replications: Math.min(s.replications ?? 10, 12), // cap for a quick report
    seed: s.seed ?? 42,
  };
}

function collectModels(): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const dir of EXAMPLE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const full = join(dir, f);
      if (seen.has(basename(f))) continue; // dedupe by filename
      seen.add(basename(f));
      files.push(full);
    }
  }
  return files.sort();
}

function runOne(file: string): RunInfo {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as SimModel & { name?: string; groups?: unknown[] };
  const info: RunInfo = {
    file, name: raw.name ?? basename(file, '.json'),
    nodes: raw.nodes?.length ?? 0, edges: raw.edges?.length ?? 0,
    hasGroups: Array.isArray(raw.groups) && raw.groups.length > 0,
    status: 'ok', durationMs: 0, replications: 0, metrics: {},
  };
  const settings = settingsOf(raw);
  info.replications = settings.replications;
  const t0 = Date.now();
  try {
    const flat = expandGroups(raw);
    buildSimulation(flat, settings.seed); // structural validation
    const res = runExperiment(flat, settings);
    info.metrics = res.nodes as RunInfo['metrics'];
  } catch (e) {
    info.status = 'error';
    info.error = e instanceof Error ? e.message : String(e);
  }
  info.durationMs = Date.now() - t0;
  return info;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const num = (n: number): string => (Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(2));

function metricsTable(m: RunInfo['metrics']): string {
  const nodeIds = Object.keys(m).filter((id) => Object.keys(m[id]!).length > 0);
  if (nodeIds.length === 0) return '<p class="muted">No per-node metrics.</p>';
  const cols = [...new Set(nodeIds.flatMap((id) => Object.keys(m[id]!)))].sort();
  const head = `<tr><th>Node</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const rows = nodeIds.map((id) => {
    const cells = cols.map((c) => {
      const v = m[id]![c];
      return v ? `<td>${num(v.mean)}<span class="ci">±${num(v.ci95)}</span></td>` : '<td class="muted">—</td>';
    }).join('');
    return `<tr><td class="node">${esc(id)}</td>${cells}</tr>`;
  }).join('');
  return `<table class="kpi"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function render(runs: RunInfo[]): string {
  const ok = runs.filter((r) => r.status === 'ok').length;
  const total = runs.length;
  const totalMs = runs.reduce((s, r) => s + r.durationMs, 0);
  const cards = runs.map((r) => `
    <section class="card ${r.status}">
      <div class="card-h">
        <h2>${esc(r.name)}</h2>
        <span class="badge ${r.status}">${r.status === 'ok' ? '✓ ran' : '✗ error'}</span>
      </div>
      <div class="meta">${basename(r.file)} · ${r.nodes} nodes · ${r.edges} edges${r.hasGroups ? ' · groups' : ''} · ${r.replications} reps · ${r.durationMs} ms</div>
      ${r.status === 'error' ? `<pre class="err">${esc(r.error ?? '')}</pre>` : metricsTable(r.metrics)}
    </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YourSim Engine — examples report</title>
<style>
  :root{--ink:#0F172A;--muted:#64748B;--line:#E2E8F0;--bg:#F4F7FB;--ok:#10B981;--err:#F43F5E;}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 'IBM Plex Sans',system-ui,sans-serif}
  .wrap{max-width:1040px;margin:0 auto;padding:32px 20px 72px}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
  .mark{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#0E7490,#4F46E5 60%,#7C3AED);display:grid;place-items:center;color:#fff;font-weight:700;font-size:20px}
  h1{font-size:24px;margin:0} .sub{color:var(--muted);font-size:14px;margin:2px 0 0}
  .summary{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0 8px;padding:16px 18px;background:#fff;border:1px solid var(--line);border-radius:14px}
  .summary b{font-size:22px;display:block} .summary span{color:var(--muted);font-size:13px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:16px 0;overflow:hidden}
  .card.error{border-color:#fecdd3}
  .card-h{display:flex;align-items:center;justify-content:space-between;gap:10px} h2{font-size:18px;margin:0}
  .badge{font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px}
  .badge.ok{color:#065f46;background:#d1fae5} .badge.error{color:#9f1239;background:#ffe4e6}
  .meta{color:var(--muted);font-size:12.5px;font-family:'IBM Plex Mono',ui-monospace,monospace;margin:6px 0 12px}
  table.kpi{border-collapse:collapse;width:100%;font-size:13px}
  table.kpi th,table.kpi td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
  table.kpi th{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
  td.node{font-weight:600} td{font-family:'IBM Plex Mono',ui-monospace,monospace}
  .ci{color:var(--muted);margin-left:4px;font-size:11px} .muted{color:var(--muted)}
  pre.err{background:#fff1f2;color:#9f1239;border:1px solid #fecdd3;border-radius:8px;padding:10px 12px;white-space:pre-wrap;font-size:12.5px}
</style></head><body><div class="wrap">
  <div class="brand"><div class="mark">▚</div><div><h1>YourSim Engine — examples report</h1><p class="sub">@plantagoai/yoursim-engine · validate → expand groups → run → KPIs (mean ± 95% CI)</p></div></div>
  <div class="summary">
    <div><b>${ok}/${total}</b><span>examples ran</span></div>
    <div><b>${total - ok}</b><span>errors</span></div>
    <div><b>${totalMs} ms</b><span>total</span></div>
    <div><b>${new Date().toISOString().slice(0, 19).replace('T', ' ')}</b><span>generated (UTC)</span></div>
  </div>
  ${cards}
</div></body></html>`;
}

const runs = collectModels().map(runOne);
writeFileSync(outFile, render(runs), 'utf8');
const ok = runs.filter((r) => r.status === 'ok').length;
console.log(`Ran ${runs.length} examples (${ok} ok, ${runs.length - ok} error) → ${outFile}`);
for (const r of runs) console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${basename(r.file)} (${r.durationMs} ms)${r.error ? ' — ' + r.error : ''}`);
if (ok < runs.length) process.exitCode = 1;
