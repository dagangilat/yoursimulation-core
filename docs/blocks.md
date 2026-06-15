# Blocks reference

A YourSimulation model is a graph of **blocks** (nodes) connected by **edges**.
Entities — passengers, packets, patients, jobs — flow from a `source` to a `sink`,
and the blocks in between shape how they wait, get served, route, and combine.

There are **11 block types**. Five cover most models; six add advanced behaviour.

## The essentials

### Source
Generates arrivals from an **inter-arrival distribution**. Model a whole stream of
arrivals as *one* source with a rate — never one node per arriving entity.

- `interarrival` — time between arrivals (e.g. `{ "dist": "exp", "mean": 5 }`)
- `priority` *(optional)* — stamped on every entity (lower = higher priority)
- `maxArrivals` *(optional)* — stop after this many

### Queue
A **waiting line** in front of a server.

- `discipline` — `fifo` (default), `lifo`, or `priority` (lowest priority number first)
- `capacity` *(optional)* — when full, new arrivals **balk** (leave immediately)
- `reneging: { patience }` *(optional)* — an entity **abandons** the line if it hasn't
  started service within a sampled patience time. This is how you model call-centre
  or emergency-department abandonment (the Erlang-A model).

### Resource
**Servers** that hold an entity for a service time. A resource must be fed by a queue.

- `servers` — number of parallel servers (≥ 1)
- `service` — service-time distribution
- `preemption` *(optional)* — `resume` or `restart`: a higher-priority arrival bumps
  the weakest in-service entity off a server when full (emergency seizes a bed, rush
  order, CPU). `resume` keeps the victim's remaining work; `restart` resamples it.
- `failures` *(optional)* — `{ uptime, repair }` **breakdowns**: the server alternates
  up and down; while down it serves nothing and in-progress work pauses, resuming on
  repair. Steady-state availability = mean(uptime)/(mean(uptime)+mean(repair)).

> A resource bundles *seize + service + release*. To hold capacity across several
> steps or share it across the model, use a **resource pool** with seize/release instead.

### Branch
A **router**. Its `mode` decides how:

- `probability` *(default)* — each out-edge carries a `probability`; they sum to 1
- `shortest-queue` — send to the least-busy downstream line (**join-shortest-queue** /
  load balancing); ties broken randomly
- `by-attribute` — route by an entity attribute: set `key`, and give each out-edge a
  `value`; a value-less edge is the default

### Sink
The **exit**. Records throughput and time-in-system. No parameters, no out-edges.

## Time and shared resources

### Delay
**Pure time advance with no contention** — infinite-server. Every entity gets its own
timer; nothing ever waits. Use for transport/travel time, network propagation latency,
or a mandatory observation period. (Don't fake this with a high-`servers` resource.)

- `delay` — the holding-time distribution

### Seize / Release + Resource pools
A **resource pool** is named capacity declared at the top level:

```json
"resources": [{ "id": "nurses", "capacity": 4 }]
```

A `seize` block acquires `units` of a pool and **holds them** until a later `release`.
Because the units are held across whatever blocks sit between seize and release, you can
model a nurse held from triage through discharge, an OR room held across prep→procedure→recovery,
or a forklift seized to move a load and released after — and the *same* pool can be shared
by seize points anywhere in the model.

- **Seize** — `pool`, `units` *(default 1)*, `priority` *(default: the entity's own)*.
  Has its own internal priority wait list, so it doesn't need a queue in front.
- **Release** — `pool`, `units` *(default: all the entity holds)*.

Pattern: `seize(pool) → delay(activity) → … → release(pool)`. Every seize must be
matched by a release on every path to a sink (units that reach a sink are a modelling error).

## Transform and combine

### Assign
Sets an **attribute** (or the entity's `priority`) to a sampled value, then forwards.
Use it to stamp a class/acuity/type after arrival — then route on it with a
`by-attribute` branch.

- `to` — `"priority"`, or any attribute name (e.g. `"acuity"`)
- `value` — a distribution. `const` gives a fixed value; `empirical` gives a random
  class (e.g. 25% urgent / 75% routine).

### Batch / Separate
- **Batch** — accumulate `size` entities into one. `permanent` (default) discards the
  members; `temporary` keeps them for a later separate. The representative inherits the
  earliest member's age. Models shuttle-when-full, pallet/kit assembly, packet aggregation.
- **Separate** — `split-batch` restores a temporary batch's members (each with its
  original age); `duplicate` clones an entity into `copies` (fork / multicast).

### Match
**Assembles** distinct part types into one. Tag each part upstream with `assign`
(e.g. `part` = 1, `part` = 2), then a `match` with `parts: [1, 2]` waits until it holds
one entity of *each* value and emits a combined entity carrying them as members (a later
**Separate** can split them). Models a product built from components, or an order that
needs both the goods and the payment.

- `key` — the attribute that names the part type
- `parts` — the values to assemble one of each

## A model that uses the new blocks

The example `clinic-pool.json` (in the skill's `references/examples/`) wires several of
these together: arrivals → a registration queue **with reneging** → a registration
**resource** → an **assign** that tags acuity → a **by-attribute** branch → urgent and
routine paths that both **seize** from a shared `beds` pool (urgent at higher priority),
**delay** for treatment, and **release**. Run it with the CLI:

```bash
npx tsx packages/engine/src/cli.ts run clinic-pool.json --pretty
```

## Groups & scale

Real systems repeat: 30 identical branch offices, hundreds of edge sites, a fleet of
machines. Rather than draw each one, wrap a representative sub-network in a **group** and
give it a replication **count**. A group has a single **entry** and **exit** (where edges
from the rest of the model connect), a list of **members**, and a `count`. In the editor it
**collapses** to one tidy node with a `×count` badge; double-click to expand.

When you run the model, the engine expands groups first (`expandGroups`), choosing a strategy
by size:

- **Flatten** (default, while under a node budget): the group is cloned `count` times. Incoming
  traffic is split across the copies (shortest-queue, or an even split when the entry isn't a
  queue) and their exits merge back. You get exact per-copy queueing.
- **Aggregate** (very large counts): a single copy stands in, with server counts, capacities,
  and source rates scaled by `count` — much faster, an approximation.

This is how the **corporate-network** template models 100k clients across 30 branches: client
populations are rate-based `source` blocks (one source whose rate represents the whole
population, not a node per client), and the branch sub-network is a `×30` group. See the model
schema's *Groups* section for the exact fields.

## See also

- [Tutorial: model an airport](/tutorial) — build your first model step by step
- [Queueing theory](/theory/02-queueing-theory) — what the metrics mean
- [Glossary](/glossary)
