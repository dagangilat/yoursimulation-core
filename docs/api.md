# Engine API & CLI

`@plantagoai/yoursim-engine` is a **zero-dependency** TypeScript discrete-event
simulation engine. Everything the hosted app computes — KPIs, percentiles,
optimization, event traces — is in this package and runs headless.

## Install

```bash
npm install @plantagoai/yoursim-engine
```

Or clone this repo and run from source with [`tsx`](https://github.com/privatenumber/tsx)
(no build step needed).

## Library API

```ts
import {
  buildSimulation,
  runExperiment,
  optimize,
  recordRun,
  type SimModel,
} from '@plantagoai/yoursim-engine';
```

### `buildSimulation(model, seed, emit?) → BuiltSimulation`
Validates the model graph and constructs a runnable simulation. Throws on an
invalid model (see the [Blocks reference](/blocks) validation rules). `BuiltSimulation`
exposes `run(until)`, `resetStats()`, `summaries()`, `nodes`, and `pools`.

### `runExperiment(model, settings, onProgress?, options?) → ExperimentResult`
Runs **independent replications** and returns each node's metrics as
`{ mean, ci95 }` (95% confidence interval). With `options.detailed`, it also returns
**percentiles** (p50/p90/p95), **histograms**, and bucketed **time-series**.

```ts
const r = runExperiment(model, { horizon: 480, warmup: 60, replications: 30, seed: 42 });
console.log(r.nodes['desk'].utilization.mean); // e.g. 0.79 ± 0.01
```

`settings`: `{ horizon, warmup, replications, seed }` — `horizon` is total run length
(includes warm-up); stats before `warmup` are discarded; `replications` independent
runs are averaged; `seed` is the base RNG seed.

### `optimize(model, problem, settings, options?, ceSeed?, onProgress?) → OptimizeResult`
The **Cross-Entropy** optimizer: searches integer design variables (server counts,
queue capacities) for the **cheapest** configuration that meets your service
constraints, evaluating each candidate by simulation with common random numbers.
`problem` declares `variables` (node param, min/max, cost-per-unit) and `constraints`
(node metric, soft/hard thresholds). See [Cross-Entropy](/theory/04-cross-entropy).

### `recordRun(model, settings) → RunRecording`
Produces a deterministic **event trace** (arrival / move / depart / server / queue
events) — the stream the app's watch-mode animation plays back.

### `expandGroups(model, options?) → SimModel`
Expands replicated/collapsed node **groups** into a flat graph, to call before
`buildSimulation`/`runExperiment`/`optimize`/`recordRun`. A `count: N` group is
**flattened** (cloned N× with a shortest-queue split and merged exits) while the node
total stays under `options.maxFlattenNodes` (default 1500), otherwise **aggregated**
(one copy with server counts / capacities / source rates scaled by N). Pure and
deterministic, and a no-op for models without `groups`. See the model schema's
*Groups* section.

## CLI

From a clone of this repo:

```bash
# validate the model graph (exit 1 + {ok:false, issues:[…]} on failure)
npx @plantagoai/yoursim-engine validate examples/bank.json

# run → KPIs JSON (add --pretty)
npx @plantagoai/yoursim-engine run examples/bank.json --pretty

# optimize parameters against a problem.json
npx @plantagoai/yoursim-engine optimize examples/airport.json problem.json --pretty

# record an event trace of one run
npx @plantagoai/yoursim-engine record examples/restaurant.json
```

A model path may be `-` to read from stdin (pipe a generator's output straight in).
Settings come from the model's `settings` block, or override with
`--horizon N --warmup N --replications N --seed N`.

## Determinism

Every stochastic draw uses a per-node seeded RNG stream derived from `seed`, so runs
are **reproducible** and the optimizer compares candidates under common random
numbers. The engine is validated against closed-form queueing theory — see
[Queueing theory](/theory/02-queueing-theory).

## Next

- [Blocks reference](/blocks) — the 12 node types + parameters
- [Example domain models](/examples) — six runnable models
- [Theory](/theory/01-discrete-event-simulation) — how it all works
