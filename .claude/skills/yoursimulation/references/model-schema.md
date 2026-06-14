# YourSimulation model schema

Authoritative source: `packages/engine/src/model.ts` (engine types),
`apps/web/src/model/schema.ts` (zod validation used by the web app), and
`packages/engine/src/build.ts` (the `validate()` graph rules the engine enforces
at build time). A model is a single JSON object.

## Top-level shape

```json
{
  "schemaVersion": 1,
  "name": "My system",
  "settings": { "...": "..." },
  "presentation": { "theme": "generic" },
  "resources": [ { "id": "nurses", "capacity": 3 } ],
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be the literal `1`. |
| `nodes` | yes | Array of nodes (see below). |
| `edges` | yes | Array of edges (see below). |
| `resources` | optional | Array of **resource pools** `{ id, capacity }` — shared capacity seized/released across steps (see Resource pools). |
| `name` | app-level | Non-empty string. The engine ignores it; the web app requires it. |
| `settings` | app-level | Run settings (see below). The CLI reads these, or you pass `--horizon/--warmup/--replications/--seed`. |
| `presentation` | app-level | `{ "theme": string }`. Cosmetic only; the engine ignores it. |

The engine's `SimModel` type only requires `schemaVersion`, `nodes`, `edges`.
`name`, `settings`, and `presentation` are app metadata; include them so the
file also opens in the web app and so the CLI can run without settings flags.

Each node also carries `position: { x: number, y: number }` and an optional
`label` (and optional `illustration`) for the web canvas. `position` is required
by the web app's parser but ignored by the engine. Give nodes sensible
positions if you want the file to look right in the UI.

## Settings block

```json
"settings": { "timeUnit": "min", "horizon": 480, "warmup": 60, "replications": 30, "seed": 42 }
```

| Field | Rule |
| --- | --- |
| `timeUnit` | One of `sec`, `min`, `hr`, `day`. App-level metadata only — the engine's `RunSettings` does NOT use it; all times below are in this unit. |
| `horizon` | Positive number. Total run length (includes warm-up). |
| `warmup` | Non-negative number, and must be `< horizon`. Stats before this time are discarded. |
| `replications` | Integer `>= 1`. Independent runs averaged for mean + 95% CI. |
| `seed` | Integer. Base RNG seed. |

The engine `RunSettings` uses only `horizon`, `warmup`, `replications`, `seed`.

## Node types (12)

Every node: `{ "id": string, "type": NodeType, "label?": string, "position": {x,y}, "params": {...} }`.
`id` must be a non-empty string and unique across the model. The 12 types:
`source`, `queue`, `resource`, `delay`, `seize`, `release`, `assign`, `batch`,
`separate`, `match`, `branch`, `sink`.

### source
Generates arriving entities from an inter-arrival distribution. Model
arrivals/clients/traffic as ONE source with a rate distribution — not one node
per arriving entity.
```json
"params": { "interarrival": <distribution>, "priority?": int, "maxArrivals?": positive int }
```
- `interarrival` (required): time between arrivals.
- `priority` (optional integer): stamped on generated entities (lower = higher priority).
- `maxArrivals` (optional positive integer): stop after this many arrivals.

### queue
A waiting line. Buffers entities before a resource (or wherever they flow).
```json
"params": {
  "discipline?": "fifo" | "lifo" | "priority",
  "capacity?": positive int,
  "reneging?": { "patience": <distribution> }
}
```
- `discipline` (optional): defaults to FIFO. `priority` serves the lowest priority number first (FIFO among ties).
- `capacity` (optional positive integer): max waiting entities; arrivals beyond it **balk** (dropped; counted as `balked`).
- `reneging` (optional): an entity **abandons** the queue if it has not started service within a sampled `patience` time (counted as `reneged`). Models call-centre/ED abandonment (Erlang-A).

### resource
Servers that hold an entity for a service time (seize + service + release in one).
```json
"params": {
  "servers": int >= 1,
  "service": <distribution>,
  "preemption?": "resume" | "restart",
  "failures?": { "uptime": <distribution>, "repair": <distribution> }
}
```
- `servers` (required, integer `>= 1`): number of parallel servers.
- `service` (required): service-time distribution.
- `preemption` (optional): a higher-priority arrival **bumps** the weakest in-service entity off a server when full. `resume` keeps the victim's remaining service; `restart` resamples it. (Reports `preemptions`.)
- `failures` (optional): **breakdowns**. The resource alternates up (for `uptime`) and down (for `repair`); while down it serves nothing and in-progress work is paused, resuming on repair. Steady-state availability = mean(uptime)/(mean(uptime)+mean(repair)) (reported as `availability`).
- A resource MUST be fed by a queue (see validation rules).
- For capacity held **across multiple steps** or **shared** elsewhere, use a resource pool with seize/delay/release instead.

### delay
Pure time advance with **no contention** (infinite-server): every entity gets
its own timer, nothing ever waits. Use for transport/travel time, propagation
latency, mandatory observation — NOT as a big-`servers` resource.
```json
"params": { "delay": <distribution> }
```

### seize
Acquire `units` of a **resource pool** (see Resource pools), holding them until a
later `release`. Has its own internal priority wait list (no separate queue node
needed). Reports `seized` and `avgWait`.
```json
"params": { "pool": "poolId", "units?": int >= 1, "priority?": int }
```
- `units` defaults to 1. `priority` defaults to the entity's own priority.

### release
Return pool units the entity holds, then let the pool serve waiting seizers.
```json
"params": { "pool": "poolId", "units?": int >= 1 }
```
- `units` defaults to **all** the units the entity holds for that pool.

### assign
Set an attribute (or the entity's `priority`) to a sampled value, then forward.
Use to stamp a class/type after arrival (e.g. triage acuity, job type, QoS).
```json
"params": { "to": "class" | "priority" | "<attrName>", "value": <distribution> }
```
- `to`: the reserved word `"priority"` sets the entity's priority; any other string sets `attributes[to]`.
- A `const` distribution assigns a fixed value; `empirical` assigns a random class (e.g. 30% type 1 / 70% type 2).

### batch
Accumulate `size` entities into one representative entity.
```json
"params": { "size": int >= 1, "mode?": "permanent" | "temporary" }
```
- `permanent` (default): members are discarded; one entity continues. The representative inherits the **earliest** member's age (conservative cycle time).
- `temporary`: members are kept so a later `separate` can restore them.

### separate
Split a temporary batch back into its members, or duplicate an entity.
```json
"params": { "mode?": "split-batch" | "duplicate", "copies?": int >= 1 }
```
- `split-batch` (default): re-emits a temporary batch's members (each with its original age). A non-batch passes through unchanged.
- `duplicate`: emits `copies` (default 2) independent clones (fork/multicast).

### match
**Assemble** entities of different types into one. Waits until it holds one entity
of *each* value in `parts` (read from `attributes[key]`), then emits one combined
entity carrying them as members (a later `separate` can split them).
```json
"params": { "key": "part", "parts": [1, 2, 3] }
```
- Tag the parts upstream with `assign` (e.g. `assign to=part value=const 1`).
- Entities whose part value isn't in `parts` are dropped.
- Models assembly that needs distinct parts: patient + chart + clinician; order + payment; product from components.

### branch
Router. Routing depends on `mode`:
```json
"params": { "mode?": "probability" | "shortest-queue" | "by-attribute", "key?": string }
```
- `probability` (default): each out-edge carries a `probability`; they must sum to 1.
- `shortest-queue`: route to the least-congested downstream line (queue length + busy servers); random tie-break (**join-shortest-queue**).
- `by-attribute`: route to the out-edge whose `value` equals `attributes[key]`; a value-less out-edge is the default/else. Requires `key`.

### sink
Exit point. Records throughput and time-in-system. No params, no out-edges.
```json
"params": {}
```

## Resource pools

Top-level `resources: [{ "id": string, "capacity": int >= 1 }]`. A pool is named
capacity that `seize`/`release` nodes reference by `id`. Unlike a `resource`
(which is one self-contained station), a pool unit can be **held across several
steps** and **shared** by seize points anywhere in the model — e.g. a nurse seized
at triage and released only at discharge, an OR room held across prep→procedure→recovery,
or a forklift seized to move a load and released after.

Pattern: `seize(pool) → delay(activity) → … → release(pool)`. The plain `resource`
is exactly sugar for `seize → delay(service) → release` of a capacity-`servers` pool.
Pool stats appear in results keyed by the pool id (`utilization`, `avgQueue`).

## Distributions (8)

A distribution is `{ "dist": <name>, ...params }`. Times must be non-negative.

| `dist` | Params | Rules |
| --- | --- | --- |
| `const` | `value` | `value >= 0`. Deterministic. |
| `exp` | `mean` | `mean > 0`. Exponential (memoryless). |
| `uniform` | `min`, `max` | `min >= 0`, `max > 0`, `max > min`. |
| `triangular` | `min`, `mode`, `max` | `min >= 0`, `mode >= 0`, `max > 0`, and `min <= mode <= max` with `min < max`. |
| `normal` | `mean`, `sd` | `mean > 0`, `sd > 0`. (Truncated/clamped to non-negative when sampled.) |
| `lognormal` | `mu`, `sigma` | `mu` any number, `sigma > 0`. `mu`/`sigma` are of the underlying normal. |
| `erlang` | `k`, `mean` | `k` integer `>= 1`, `mean > 0`. |
| `empirical` | `values[]`, `weights?[]` | `values` non-empty, each `>= 0`; optional `weights` each `> 0` and same length as `values`. |

Examples: `{ "dist": "exp", "mean": 2 }`,
`{ "dist": "triangular", "min": 1, "mode": 3, "max": 6 }`,
`{ "dist": "empirical", "values": [1,2,5], "weights": [3,1,1] }`.

## Edges

```json
{ "id": string, "from": nodeId, "to": nodeId, "probability?": number, "value?": number }
```
- `id`, `from`, `to` are non-empty strings; `from`/`to` must reference existing node ids.
- `probability` is required on `probability`-mode branch out-edges (range 0..1, must sum to 1) and ignored elsewhere.
- `value` is used by `by-attribute`-mode branch out-edges: the attribute value that selects this edge. A by-attribute out-edge with no `value` is the default/else route.

## Validation rules (enforced by `build.ts` `validate()`)

Building a model (`buildSimulation`, and the CLI's `validate`/`run`) throws if any fail:

1. **Unique node ids** — no duplicate `id` across nodes.
2. **Edges reference existing nodes** — every edge's `from` and `to` must be a known node id.
3. **Sinks have no out-edges** — a `sink` cannot have any outgoing edge.
4. **Exactly one out-edge for flow nodes** — every node that is NOT a `sink` and NOT a `branch` (i.e. `source`, `queue`, `resource`, `delay`, `seize`, `release`, `assign`, `batch`, `separate`, `match`) must have exactly one outgoing edge.
5. **Branch out-edges** — a `branch` needs at least one out-edge. In `probability` mode the `probability` values must sum to 1 (within 1e-9; a missing probability is invalid). In `by-attribute` mode `key` is required and at most one out-edge may be value-less (the default).
6. **Resources fed by a queue** — every edge into a `resource` must come from a `queue`. (Put a queue in front of every resource. `seize` does NOT need this — it has its own wait list.)
7. **No instantaneous loops** — queues and branches forward entities at the same simulation instant; a cycle made only of queues/branches is rejected. Route such loops through a resource/delay/seize (which consume time).
8. **Resource pools** — pool ids are unique, distinct from node ids, and `capacity` is an integer `>= 1`.
9. **Seize/release** — `pool` must reference an existing pool; `units` (if given) is an integer `>= 1`; a `seize` cannot request more units than the pool's capacity.
10. **No held-resource leaks** — at run time, an entity reaching a `sink` while still holding pool units is an error. Every seized unit must be released on every path to a sink.
11. **Batch/separate** — `batch` `size` is an integer `>= 1`; `separate` `copies` (duplicate mode) is an integer `>= 1`.
12. **Match** — needs a `key` and a non-empty `parts` array. Tag part values upstream with `assign`.

## Minimal valid model

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

See `examples/airport.json`, `examples/network.json`, and the generator
`examples/generate-network.ts` for larger, parameterized topologies.
