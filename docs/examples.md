# Example domain models

Five worked models, each a different industry, that **together exercise every one of
the 12 block types** and every advanced feature. They live in the skill's
`references/examples/` folder; run any of them with the CLI:

```bash
npx tsx packages/engine/src/cli.ts run restaurant.json --pretty
```

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

See the [Blocks reference](/blocks) for every parameter, and the
[tutorial](/tutorial) to build your own from scratch.
