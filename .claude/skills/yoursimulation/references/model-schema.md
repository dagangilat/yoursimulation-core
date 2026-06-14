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
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be the literal `1`. |
| `nodes` | yes | Array of nodes (see below). |
| `edges` | yes | Array of edges (see below). |
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

## Node types (5)

Every node: `{ "id": string, "type": NodeType, "label?": string, "position": {x,y}, "params": {...} }`.
`id` must be a non-empty string and unique across the model.

### source
Generates arriving entities from an inter-arrival distribution. Model
arrivals/clients/traffic as ONE source with a rate distribution — not one node
per arriving entity.
```json
"params": { "interarrival": <distribution>, "priority?": int, "maxArrivals?": positive int }
```
- `interarrival` (required): time between arrivals.
- `priority` (optional integer): assigned to generated entities (used by priority queues).
- `maxArrivals` (optional positive integer): stop after this many arrivals.

### queue
A waiting line. Buffers entities before a resource (or wherever they flow).
```json
"params": { "discipline?": "fifo" | "lifo" | "priority", "capacity?": positive int }
```
- `discipline` (optional): defaults to FIFO behaviour. `priority` uses entity priority.
- `capacity` (optional positive integer): max waiting entities; arrivals beyond it balk (are dropped).

### resource
Servers that hold an entity for a service time.
```json
"params": { "servers": int >= 1, "service": <distribution> }
```
- `servers` (required, integer `>= 1`): number of parallel servers.
- `service` (required): service-time distribution.
- A resource MUST be fed by a queue (see validation rules).

### branch
Probabilistic router. Has no params; routing weights live on its out-edges.
```json
"params": {}
```
- Each out-edge must carry a `probability`, and they must sum to 1.

### sink
Exit point. Records throughput and time-in-system. No params, no out-edges.
```json
"params": {}
```

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
{ "id": string, "from": nodeId, "to": nodeId, "probability?": number }
```
- `id`, `from`, `to` are non-empty strings; `from`/`to` must reference existing node ids.
- `probability` is required on branch out-edges (range 0..1) and ignored elsewhere.

## Validation rules (enforced by `build.ts` `validate()`)

Building a model (`buildSimulation`, and the CLI's `validate`/`run`) throws if any fail:

1. **Unique node ids** — no duplicate `id` across nodes.
2. **Edges reference existing nodes** — every edge's `from` and `to` must be a known node id.
3. **Sinks have no out-edges** — a `sink` cannot have any outgoing edge.
4. **Exactly one out-edge for flow nodes** — every node that is NOT a `sink` and NOT a `branch` (i.e. `source`, `queue`, `resource`) must have exactly one outgoing edge.
5. **Branch out-edges** — a `branch` needs at least one out-edge, and their `probability` values must sum to 1 (within 1e-9). A missing probability counts as invalid.
6. **Resources fed by a queue** — every edge into a `resource` must come from a `queue`. (So put a queue in front of every resource.)
7. **No instantaneous loops** — queues and branches forward entities at the same simulation instant; a cycle made only of queues/branches is rejected. Route such loops through a resource (which consumes time).

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
