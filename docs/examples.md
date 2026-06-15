# Example domain models

Six runnable models, each a different industry, that **together exercise every one of
the 12 block types** and every advanced feature. They live in this repo's
[`examples/`](https://github.com/dagangilat/yoursimulation-core/tree/main/examples)
folder — run any of them from a clone with the CLI:

```bash
npx @plantagoai/yoursim-engine run examples/restaurant.json --pretty
# or: airport.json · hospital.json · bank.json · factory-line.json · network.json
```

An engine test builds and runs every example and asserts the set covers all 12 node
types, so these stay valid as the engine evolves.

## What each model shows

| Feature | Airport | Clinic | Bank | Factory | Restaurant |
|---|:---:|:---:|:---:|:---:|:---:|
| source / queue / resource / sink | ● | ● | ● | ● | ● |
| **branch** routing | | by-attribute | shortest-queue | probability | |
| **delay** (no contention) | | ● | | | ● (pay bill) |
| **seize / release + pools** | | ● | | | |
| **assign** attributes / priority | | ● | ● | ● | |
| **batch / separate** | | | | batch | batch + separate |
| **match** (assembly) | | | | ● | |
| queue **reneging** | | ● | ● | | |
| queue **capacity / balking** | | | | | ● |
| **priority** discipline | | ● | ● | ● | |
| resource **preemption** | | | | ● | |
| resource **failures** | | | | ● | |

Every node type appears at least once; an engine test asserts this stays true.

---

## ✈️ Airport check-in — the textbook M/M/c

`source → queue → resource (desks) → sink`

The simplest model and the right place to start: a single stream of passengers, one
waiting line, and a bank of identical check-in desks. This is a classic **M/M/c**
queue — change the number of `servers` and watch utilization and average wait trade
off. The [optimizer](/theory/04-cross-entropy) can find the cheapest desk count that
keeps the wait under a target.

**Shows:** the four essentials, multi-server resources, utilization vs. wait.

## 🏥 Emergency clinic — shared beds held across care

`arrivals → registration queue (reneging) → registration desk → triage (assign acuity)
→ branch (by-attribute) → {urgent | routine} → seize(beds) → treat (delay) → release → discharged`

A bed is **held across the whole episode of care**, not just one step — that's a
resource **pool** seized at admission and released at discharge, shared between the
urgent and routine paths (urgent seizes at higher priority). Patients **renege** from
the registration line if they wait too long (left-without-being-seen), and a
**by-attribute** branch routes by the acuity stamped at triage.

**Shows:** resource pools, multi-step holds, reneging (Erlang-A), class routing,
priority seizing. *(~87 discharged/run, beds ~73% utilized.)*

## 🏦 Bank branch — pick the shortest line

`customers → assign (VIP / regular) → branch (shortest-queue) → 3 lines [queue
(priority + reneging) → teller] → served`

Each customer **joins the shortest of three teller lines** (join-shortest-queue,
measuring queue + busy server), VIPs are stamped with a higher **priority** so they
jump each line, and impatient customers **renege** if the wait drags on. Compare
shortest-queue routing against splitting customers randomly — the balanced policy
keeps every line short.

**Shows:** join-shortest-queue routing, priority discipline, abandonment.
*(~407 served/run, ~17 leave impatient.)*

## 🏭 Factory line — assemble, machine, palletize

`{bodies | lids} → assign (part) → match (assemble) → assign (express/standard)
→ queue → CNC mill (preemption + breakdowns) → QC branch (probability)
→ {palletize (batch) → shipped | scrapped}`

Two part streams are **matched** into one assembled product (one body + one lid). The
**CNC mill breaks down** (uptime/repair, with reported availability) and **express
orders preempt** standard ones mid-cut (resume). Good units are **batched onto
pallets** of six before shipping; a probabilistic **quality check** scraps the rest.

**Shows:** assembly (match), preemptive priority, machine breakdowns/availability,
batching, yield routing. *(~264 assembled, mill ~88% available, ~34 preemptions, 8% scrapped.)*

## 🍽️ Restaurant — seat parties, limited waiting area

`diners → batch (party of 3) → waiting area (capacity → balking) → tables → pay (delay)
→ separate (party leaves) → departed`

Individual diners are **batched into parties** that are seated together. The waiting
area has a **capacity** — when it's full, arriving parties **balk** (turn away). A
party holds a table for the whole meal, settles up (a pure **delay**), then
**separates** back into individuals on the way out.

**Shows:** batching groups, balking on a full buffer, splitting a temporary batch,
pure delay. *(at a busy load, tables ~100% utilized and ~36 parties/run turned away.)*

---

## Also in the editor — teaching & at-scale models

A few more starting points (each is a one-click template in the Studio **New** menu):

### Blank
An empty canvas — start from nothing.

### M/M/1 — the canonical single-server queue
`source (λ) → queue → server (1 · μ) → sink`

One arrival stream, one line, one server. The textbook queue: at load ρ = λ/μ the mean
wait is `Wq = ρ / (μ − λ)`. The best first model for intuition — compare its simulated
KPIs to the closed form on the [queueing-theory page](/theory/02-queueing-theory).

### M/M/c — c parallel servers
`source (λ) → queue → servers (c · μ) → sink`

The same arrivals served by **c identical servers** sharing one queue (Erlang-C, c = 3 by
default). Raise `c` and watch utilization and wait trade off — exactly what the
[optimizer](/theory/04-cross-entropy) tunes for the cheapest feasible design.

### Hospital ER
`patients → triage → care stations → discharge`

An emergency department with triage and limited care capacity — priorities and waiting
under load. (The pooled-bed **Clinic** model above is a fuller seize/release variant.)

### Corporate network — modelling at scale
`device populations → classify traffic → Branch ×30 (LAN switch → router) → WAN link
→ core → data center (web / app / database) → Internet`

A global corporate network: 100k clients as **rate-based population sources**, the branch
modelled once as a **group replicated ×30**, a WAN link (latency + jitter), and a data
center. It shows how [groups](/blocks#groups-scale) keep a huge topology tractable —
they **expand** (flatten or aggregate) at run time. Best explored in Studio, where the
group expands when you run it.

---

See the [Blocks reference](/blocks) for every parameter, and the
[tutorial](/tutorial) to build your own from scratch.
