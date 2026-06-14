---
name: yoursimulation
description: Build, run, optimize, and interpret discrete-event queue simulations with the YourSimulation engine. Use when the user wants to model a service/queue/network system (airport, hospital, data network, logistics, call center, factory…), estimate waits/utilization/throughput, or find the cheapest design meeting a service target.
---

# YourSimulation

YourSimulation is a discrete-event queue simulator. You describe a system as a
JSON model (a graph of nodes and edges), then use the engine CLI to validate it,
run it for KPIs, and optimize its parameters against a budget and service
targets.

## Mental model

The engine simulates entities (passengers, packets, patients, jobs…) flowing
through a network of **12 generic node types**. Five cover most models:

| Node | Role | Maps to (examples) |
| --- | --- | --- |
| `source` | Generates arrivals from an inter-arrival distribution | passengers arriving, clients/traffic, incoming calls, jobs released |
| `queue` | Waiting line (FIFO/LIFO/priority, optional capacity, optional reneging) | check-in line, network buffer, hold queue, WIP buffer |
| `resource` | Servers that hold an entity for a service time | check-in desks, a router/link, agents, machines |
| `branch` | Router: probability / shortest-queue / by-attribute | traffic routing, triage, load balancing, product mix |
| `sink` | Exit; records throughput + time-in-system | boarding, delivered packets, discharged patients |

Six more unlock advanced behaviour:

| Node | Role | Use when |
| --- | --- | --- |
| `delay` | Infinite-server pure time advance (no contention) | transport/travel time, propagation latency, mandatory observation |
| `seize` / `release` | Acquire / return units of a shared **resource pool** | a nurse/bed/OR/forklift held across multiple steps or shared model-wide |
| `assign` | Set an attribute or `priority` from a sampled value | stamp a class/acuity/QoS after arrival, then route by it |
| `batch` / `separate` | Combine N→1 / split a batch back (or duplicate) | shuttle-when-full, pallet/kit assembly, packet aggregation, fork-join |
| `match` | Assemble one entity of each part type into one | order+payment, patient+chart+clinician, product from components |

`resource` also supports `preemption` (urgent work bumps a server) and `failures`
(breakdowns: uptime/repair, with availability reporting).

**Resource pools** (top-level `resources: [{id, capacity}]`) are named capacity that
`seize`/`release` reference by id — capacity that can be **held across steps** and
**shared** across the model. A plain `resource` is just sugar for
`seize → delay(service) → release`.

Key modeling idea: **arrivals/clients/traffic are an arrival-RATE distribution on
a single `source`, NOT one node per arriving entity.** A million packets is one
`source` with a small inter-arrival mean — never a million nodes.

Map any domain onto these nodes. E.g. a data network:
clients → `source`, edge/buffer → `queue`, router/link → `resource`,
routing to destinations → `branch`, destination → `sink`.

Every `resource` must be fed by a queue (give entities somewhere to wait). A
`seize` does not — it has its own internal wait list. Every `seize` must be
matched by a `release` on every path to a sink (held units that reach a sink are
an error).

## Author a model

Read `references/model-schema.md` for the exact node params, the 8 distributions,
edge rules, and the validation rules the engine enforces. Tiny inline example
(single-server queue):

```json
{
  "schemaVersion": 1,
  "name": "Single server queue",
  "settings": { "timeUnit": "min", "horizon": 480, "warmup": 60, "replications": 20, "seed": 42 },
  "nodes": [
    { "id": "src", "type": "source", "position": { "x": 0, "y": 0 }, "params": { "interarrival": { "dist": "exp", "mean": 5 } } },
    { "id": "q", "type": "queue", "position": { "x": 150, "y": 0 }, "params": { "discipline": "fifo" } },
    { "id": "svr", "type": "resource", "position": { "x": 300, "y": 0 }, "params": { "servers": 1, "service": { "dist": "exp", "mean": 4 } } },
    { "id": "out", "type": "sink", "position": { "x": 450, "y": 0 }, "params": {} }
  ],
  "edges": [
    { "id": "e1", "from": "src", "to": "q" },
    { "id": "e2", "from": "q", "to": "svr" },
    { "id": "e3", "from": "svr", "to": "out" }
  ]
}
```

For large or parameterized topologies (N locations, M stations…), **write a
small generator script** that prints model JSON to stdout, instead of hand-writing
hundreds of nodes. See `references/examples/generate-network.ts` for the pattern,
then pipe its output straight into the CLI (see stdin below).

Example models to copy/adapt: `references/examples/airport.json`,
`references/examples/network.json`, and `references/examples/clinic-pool.json`
(shows resource pools + seize/delay/release, queue reneging, `assign`, and
`by-attribute` routing in one valid model).

### Advanced patterns (quick recipes)
- **Hold one resource across steps / share it** — declare a top-level pool
  `"resources": [{ "id": "nurses", "capacity": 4 }]`, then
  `seize(nurses) → delay → … → delay → release(nurses)`. Use a seize `priority`
  so urgent work preempts the wait order. Every seize needs a matching release.
- **Pure travel/latency time** — use `delay`, never a big-`servers` resource.
- **Abandonment** — put `reneging: { patience }` on the **queue that feeds a
  resource** (reneging happens while waiting for a finite server; a queue in front
  of a `seize` passes through instantly, so put patience where the real wait is).
- **Class-based routing** — `assign` an attribute (e.g. `acuity` via an
  `empirical` distribution), then a `by-attribute` branch with `value` on each
  out-edge. For load balancing across parallel lines, use a `shortest-queue` branch.
- **Batching** — `batch` (size, permanent/temporary) then optionally `separate`
  to restore members downstream.
- **Assembly** — tag parts with `assign` (e.g. `part`=1, `part`=2), then `match`
  with `parts: [1,2]` waits for one of each and emits a combined entity.
- **Preemption** — set `preemption: "resume"` on a resource so urgent (lower
  priority number) work bumps a lower-priority job off a server.
- **Breakdowns** — set `failures: { uptime, repair }` on a resource; check the
  reported `availability` ≈ mean(uptime)/(mean(uptime)+mean(repair)).

## Run the CLI

The `${CLAUDE_PLUGIN_ROOT:-.}` prefix resolves to the plugin root when installed
as a plugin, and falls back to `.` (the repo root) when working in-repo — so the
same commands run in both contexts. The model arg is a path, or `-` to read stdin.

```bash
# Validate the model graph (exits non-zero, prints {ok:false, issues:[...]} on failure)
npx tsx "${CLAUDE_PLUGIN_ROOT:-.}/packages/engine/src/cli.ts" validate model.json

# Run the experiment -> KPIs JSON (add --pretty to read it)
npx tsx "${CLAUDE_PLUGIN_ROOT:-.}/packages/engine/src/cli.ts" run model.json --pretty

# Optimize parameters against a problem definition
npx tsx "${CLAUDE_PLUGIN_ROOT:-.}/packages/engine/src/cli.ts" optimize model.json problem.json --pretty

# Record an event trace of a single run
npx tsx "${CLAUDE_PLUGIN_ROOT:-.}/packages/engine/src/cli.ts" record model.json
```

Settings come from `model.settings`, or override with flags:
`--horizon N --warmup N --replications N --seed N`.

**Keep time units consistent.** `timeUnit` is metadata only — the engine never
converts. Every time value (inter-arrival mean, service mean, horizon, warmup)
must be expressed in that one unit. E.g. "calls every 30 s, handled in ~4 min":
pick `"timeUnit": "sec"` and use `interarrival` mean `30` and `service` mean
`240` (not `4`). Mixing units silently produces answers off by 60×.

Read a generated model from stdin with `-`:

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT:-.}/.claude/skills/yoursimulation/references/examples/generate-network.ts" 100 \
  | npx tsx "${CLAUDE_PLUGIN_ROOT:-.}/packages/engine/src/cli.ts" run -
```

## Workflow

1. **Author** the model (or generate it).
2. **`validate`** — fix any reported issues before doing anything else. Always
   validate before running.
3. **`run`** — get KPIs (use `--pretty`).
4. **Read the KPIs** and explain them to the user.
5. **Optionally `optimize`** to find the cheapest design meeting a target.

## Interpret KPIs

`run` returns `{ replications, nodes: { <id>: { <metric>: { mean, ci95 } } }, detail? }`.
Each metric reports the `mean` across replications and `ci95` (95% CI half-width).
Per node type:

- **resource** → `utilization` (busy fraction, 0..1; near 1 = bottleneck).
- **queue** → `avgWait` (mean time waiting in line), `avgLength` (mean queue length), `balked` (count dropped when over capacity).
- **sink** → `throughput` (entities completed), `avgTimeInSystem` (end-to-end time).
- **source** → `created` (entities generated).

With detailed mode (the CLI's `run` enables it), `detail.percentiles[<id>]` gives
`wait` and `timeInSystem` **p50/p90/p95**, and `detail.series`/`detail.distributions`
give time series and histograms.

Rules of thumb: high `utilization` with growing `avgWait`/`p95Wait` = the resource
is the bottleneck (add servers); persistent `balked` = queue capacity too small.

**Watch for instability.** If a resource's `utilization` sits at ~1.0, demand
exceeds capacity: the queue never reaches steady state, so its `avgWait` keeps
rising with `horizon` and is NOT a meaningful number (re-running longer gives a
bigger wait). The fix is more servers (so utilization < 1), not a longer run.
Quick check: a resource is stable only if arrival rate < servers ÷ mean service
time (e.g. arrivals every 30 s, 4 min = 240 s service → needs > 240/30 = 8
servers).

## Optimize

`optimize model.json problem.json` searches integer `servers`/`capacity` values
to minimize cost while meeting constraints. `problem.json` shape:

```json
{
  "variables": [
    { "nodeId": "desks", "param": "servers", "min": 1, "max": 12, "costPerUnit": 100 }
  ],
  "constraints": [
    { "nodeId": "checkin-q", "metric": "p95Wait", "soft": 5, "hard": 10, "wSoft": 50, "wHard": 500 }
  ]
}
```

- `variables[]`: `{ nodeId, param: "servers" | "capacity", min, max, costPerUnit }`.
- `constraints[]`: `{ nodeId, metric, soft?, hard?, wSoft, wHard }`. A metric over
  `soft` adds `wSoft * excess` penalty; over `hard` adds `wHard * excess` and marks
  the candidate infeasible.
- Valid `metric` values: `avgWait`, `utilization`, `avgTimeInSystem`, `throughput`,
  `p95Wait`, `p95TimeInSystem`.

Result: `{ best, trajectory, evaluations }`. Report `best.values` (the chosen
parameters), `best.cost`, `best.metrics`, and especially **`best.feasible`** — if
`false`, no design in the search range met the hard constraints (widen `max`,
relax targets, or revisit the model).
