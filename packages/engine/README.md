# @plantagoai/yoursim-engine

A **zero-dependency** TypeScript discrete-event simulation (DES) engine for
service, queue, and network systems. No DOM, no Node-specific APIs — the same
code runs in the browser (in a Web Worker), in Node (CLI and tests), and in any
other JS host.

You describe a system as a graph of five generic node types — `source`, `queue`,
`resource`, `branch`, `sink` — then run seeded replications to get KPIs with 95%
confidence intervals, record a single run for playback, or optimize parameters
against a budget and service targets.

- Concepts: [discrete-event simulation](https://yoursimulation-app.web.app/docs/theory/01-discrete-event-simulation),
  [queueing theory](https://yoursimulation-app.web.app/docs/theory/02-queueing-theory),
  [distributions](https://yoursimulation-app.web.app/docs/theory/03-distributions),
  [Cross-Entropy optimization](https://yoursimulation-app.web.app/docs/theory/04-cross-entropy).
- Full model schema: [`.claude/skills/yoursimulation/references/model-schema.md`](../../.claude/skills/yoursimulation/references/model-schema.md).

## Public API

All exports come from the package entry point (`src/index.ts`).

### `buildSimulation(model, seed, emit?) → BuiltSimulation`

Validates `model`, wires up the runtime nodes with seeded per-node RNG streams,
and returns a controllable simulation. The optional `emit` callback receives
every [`SimEvent`](src/events.ts) as it happens (used by `recordRun` and detailed
experiments).

```ts
interface BuiltSimulation {
  sim: Simulation;
  nodes: Map<string, RuntimeNode>;
  run(until: number): void;       // advance the clock to `until`
  resetStats(): void;             // discard collected stats (used for warm-up)
  summaries(): Record<string, Record<string, number>>; // per-node metrics
}
```

### `runExperiment(model, settings, onProgress?, options?) → ExperimentResult`

Runs `settings.replications` independent replications, applies the warm-up, and
aggregates each metric into a mean and a 95% CI half-width. Pass
`{ detailed: true }` to also collect percentiles, histograms, and time series.

```ts
interface RunSettings {
  horizon: number;      // total run length (includes warm-up)
  warmup: number;       // stats before this time are discarded
  replications: number;
  seed: number;
}

interface MetricSummary { mean: number; ci95: number }

interface ExperimentResult {
  replications: number;
  nodes: Record<string, Record<string, MetricSummary>>; // nodeId → metric → summary
  detail?: DetailStats; // present when options.detailed is true
}

type OnProgress = (completed: number, total: number) => void;
interface ExperimentOptions { detailed?: boolean; buckets?: number }
```

### `recordRun(model, settings) → RunRecording`

Runs **one** replication (using the same seed as experiment replication 0) and
records every event, for deterministic animated playback.

```ts
interface RunRecording {
  horizon: number;
  warmup: number;
  nodeIds: string[];
  events: SimEvent[];
}
```

### `optimize(model, problem, settings, options?, ceSeed?, onProgress?) → OptimizationResult`

Cross-Entropy search over integer design variables (`servers` or `capacity` on
chosen nodes), minimizing total cost subject to constraints on KPIs. Uses common
random numbers (a fixed `settings.seed`) across candidates for fair comparison.

```ts
interface OptVariable {
  nodeId: string; param: 'servers' | 'capacity';
  min: number; max: number; costPerUnit: number;
}
interface OptConstraint {
  nodeId: string; metric: string;
  soft?: number; hard?: number; wSoft: number; wHard: number;
}
interface OptProblem { variables: OptVariable[]; constraints: OptConstraint[] }

interface Candidate {
  values: Record<string, number>; cost: number;
  metrics: Record<string, number>; score: number; feasible: boolean;
}
interface OptimizationResult {
  best: Candidate;
  trajectory: { iter: number; bestScore: number; eliteMeanScore: number }[];
  evaluations: Candidate[];
}
```

Constraint `metric` may be any per-node metric (e.g. `avgWait`, `utilization`) or
the percentile metrics `p95Wait` / `p95TimeInSystem` (which automatically enable
detailed mode).

### Other exports

`Simulation`, `EventCalendar`, `Random`, `streamSeed`, `sample` (+ `Distribution`),
`Tally`, `TimeWeighted`, the node classes (`SourceNode`, `QueueNode`,
`ResourceNode`, `BranchNode`, `SinkNode`), `quantile`, `histogram`, and the
optimizer helpers (`applyVariables`, `scoreAndFeasible`, `costOf`, `metricValue`,
`needsDetailed`). Model types: `SimModel`, `ModelNode`, `ModelEdge`, `NodeType`,
and the per-type `*Params`.

## Minimal usage

```ts
import { runExperiment, type SimModel } from '@plantagoai/yoursim-engine';

const model: SimModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'src', type: 'source', params: { interarrival: { dist: 'exp', mean: 10 } } },
    { id: 'q', type: 'queue', params: { discipline: 'fifo' } },
    { id: 'svc', type: 'resource', params: { servers: 1, service: { dist: 'exp', mean: 8 } } },
    { id: 'out', type: 'sink', params: {} },
  ],
  edges: [
    { id: 'e1', from: 'src', to: 'q' },
    { id: 'e2', from: 'q', to: 'svc' },
    { id: 'e3', from: 'svc', to: 'out' },
  ],
};

const result = runExperiment(model, {
  horizon: 20000, warmup: 2000, replications: 20, seed: 42,
});

console.log(result.nodes['svc'].utilization);          // ~0.8 (ρ = 8/10)
console.log(result.nodes['out'].avgTimeInSystem.mean); // mean time in system
```

## CLI

The package also ships a JSON-in/JSON-out CLI:

```bash
npx tsx packages/engine/src/cli.ts run docs/examples/mm1.json --pretty
```

Commands: `validate`, `run`, `optimize <problem.json>`, `record`. Settings come
from the model's `settings` block or `--horizon --warmup --replications --seed`;
add `--pretty` for indented JSON. See the
[tutorial](https://yoursimulation-app.web.app/docs/tutorial).
