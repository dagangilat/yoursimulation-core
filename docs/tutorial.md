# Tutorial: model an airport check-in

This walkthrough builds a small but complete model — an airport check-in area —
from scratch, runs it, reads the KPIs, and then uses the optimizer to find the
cheapest number of desks that meets a wait target. Every number below is the
real output of the engine on the model file shipped in this repo
([`docs/examples/airport-tutorial.json`](https://github.com/dagangilat/yoursimulation-core/blob/main/docs/examples/airport-tutorial.json)).

## 1. The scenario

Passengers arrive at a check-in area and form a single line. A bank of desks
serves them one at a time.

- **Arrivals**: passengers arrive on average **every 2 minutes**
  (exponential inter-arrival, i.e. a Poisson arrival process).
- **Queue**: one **FIFO** check-in line.
- **Desks**: **4** desks (servers).
- **Service**: each check-in takes a **triangular(min 1, mode 3, max 6)**
  minutes.

We run for **480 minutes** (an 8-hour shift) with a **60-minute warm-up**,
**30 replications**, seed **42** — all from the model's `settings`.

Mapped onto the engine's five node types
([mental model](/theory/01-discrete-event-simulation)):

`source` (passengers) → `queue` (check-in line) → `resource` (desks) → `sink` (boarding).

## 2. The model JSON

```json
{
  "schemaVersion": 1,
  "name": "Airport check-in",
  "settings": { "timeUnit": "min", "horizon": 480, "warmup": 60, "replications": 30, "seed": 42 },
  "presentation": { "theme": "airport" },
  "nodes": [
    { "id": "arrivals", "type": "source", "label": "Passengers", "position": { "x": 0, "y": 120 }, "params": { "interarrival": { "dist": "exp", "mean": 2 } } },
    { "id": "checkin-q", "type": "queue", "label": "Check-in queue", "position": { "x": 220, "y": 120 }, "params": { "discipline": "fifo" } },
    { "id": "desks", "type": "resource", "label": "Desks", "position": { "x": 440, "y": 120 }, "params": { "servers": 4, "service": { "dist": "triangular", "min": 1, "mode": 3, "max": 6 } } },
    { "id": "exit", "type": "sink", "label": "Boarding", "position": { "x": 660, "y": 120 }, "params": {} }
  ],
  "edges": [
    { "id": "e1", "from": "arrivals", "to": "checkin-q" },
    { "id": "e2", "from": "checkin-q", "to": "desks" },
    { "id": "e3", "from": "desks", "to": "exit" }
  ]
}
```

A `resource` must always be fed by a `queue` (so an entity always has somewhere
to wait) — that is why the desks sit behind the check-in line.

## 3. Validate it

```bash
npx tsx packages/engine/src/cli.ts validate docs/examples/airport-tutorial.json
```

```json
{ "ok": true }
```

Validation checks structure: unique node ids, that edges reference real nodes,
that each non-sink/non-branch node has exactly one out-edge, that branch
probabilities sum to 1, and that resources are fed by queues.

## 4. Run it and read the KPIs

```bash
npx tsx packages/engine/src/cli.ts run docs/examples/airport-tutorial.json --pretty
```

The relevant KPIs (mean across 30 replications, with the 95% CI half-width):

| Node | Metric | Value |
| --- | --- | --- |
| `desks` | utilization | **0.42** ± 0.01 |
| `checkin-q` | avgWait | **0.09 min** ± 0.02 |
| `checkin-q` | wait p95 | **0.82 min** |
| `exit` | avgTimeInSystem | **3.44 min** ± 0.03 |
| `exit` | timeInSystem p95 | **5.29 min** |
| `exit` | throughput | **211** passengers |

How to read them:

- **Desk [utilization](/glossary#utilization) ≈ 0.42** — the desks are busy about
  42% of the time. With 4 desks and this load, there is plenty of slack.
- **Average [wait](/glossary#wait-time) ≈ 0.09 min** — essentially no line on
  average. Even the **95th percentile wait is under 1 minute** (0.82 min), so
  almost nobody waits long.
- **[Time in system](/glossary#time-in-system) ≈ 3.44 min** — close to the mean
  service time (the mode of triangular(1,3,6) is 3), confirming that waiting adds
  almost nothing; passengers are basically walking straight up to a desk.

(The `p95` percentile figures come from the engine's detailed statistics, which
the CLI emits in the `detail` block.)

## 5. Interpret — what if we cut to 3 desks?

Utilization at 0.42 with 4 desks is low; 4 desks looks like more than we need.
With **3** desks the same arrival load is spread over fewer servers, so
utilization rises to roughly 0.42 × 4 / 3 ≈ **0.56**. That is still comfortably
below 1, so the system stays stable — but waiting grows non-linearly as
utilization climbs ([why](/theory/02-queueing-theory)), so the average wait will
be noticeably higher than the near-zero we saw with 4 desks. The question is
whether 3 desks still meets our service target. Rather than guess, let the
optimizer answer.

## 6. Optimize — cheapest desk count that meets a wait target

Suppose the target is: **average check-in wait at most 0.5 minutes**, and we want
the **fewest desks** (each desk costs the same) that meets it.

Create `problem.json`:

```json
{
  "variables": [
    { "nodeId": "desks", "param": "servers", "min": 1, "max": 6, "costPerUnit": 1 }
  ],
  "constraints": [
    { "nodeId": "checkin-q", "metric": "avgWait", "hard": 0.5, "wSoft": 0, "wHard": 1000 }
  ]
}
```

The single **variable** is the desks resource's `servers` (search between 1 and
6, cost 1 per desk). The single **constraint** is a **hard** cap of 0.5 minutes
on the check-in queue's `avgWait`; violating it adds a heavy penalty so the
search avoids infeasible designs.

```bash
npx tsx packages/engine/src/cli.ts optimize docs/examples/airport-tutorial.json problem.json --pretty
```

The Cross-Entropy search ([theory](/theory/04-cross-entropy)) returns:

```json
{
  "best": {
    "values": { "desks.servers": 3 },
    "cost": 3,
    "metrics": { "checkin-q.avgWait": 0.42 },
    "score": 3,
    "feasible": true
  }
}
```

**3 desks** is the cheapest feasible design: its average wait (~0.42 min) sits
just under the 0.5-minute cap, while 2 desks would blow past it and the 4th desk
we started with was unnecessary. The thought experiment from step 5 is confirmed
by the engine.

## In the app

You don't have to use the CLI. In the [web app](https://yoursim.plantagoai.com):

1. Load the **Airport** starter (it is exactly the model above).
2. Use the **Experiment** tab to run it and see the KPI dashboard with the same
   means and 95% CIs.
3. Use the **Optimize** tab to define the variable and constraint and run the
   same search visually.

## See also

- [Glossary](/glossary) — utilization, wait time, time in system, and more.
- [Queueing theory](/theory/02-queueing-theory) — why wait explodes near
  utilization 1.
- [Distributions](/theory/03-distributions) — exponential and triangular.
- [Cross-Entropy optimization](/theory/04-cross-entropy) — how `optimize` works.
