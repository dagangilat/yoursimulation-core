# YourSim Engine — one-pager

**A fast, deterministic discrete-event simulation + design-optimization engine for service, queue, and network systems — in TypeScript, zero dependencies, MIT.**

`npm i @plantagoai/yoursim-engine` · `npx @plantagoai/yoursim-engine run model.json`

---

## The problem

Real systems — airports, clinics, bank branches, factory lines, restaurants, corporate networks — are **queues of work flowing through limited resources**. Two questions matter: *"how will it behave (waits, utilization, throughput)?"* and *"what's the **cheapest** design that still meets my service target?"* Spreadsheets and closed-form formulas break down once you add priorities, finite buffers, reneging, failures, batching, or routing. YourSim Engine answers both questions by **simulating** the system, event by event.

## What you can model

A model is a graph of **12 block types** — `source · queue · resource · delay · seize · release · assign · batch · separate · match · branch · sink` — plus shared **resource pools**, **8 probability distributions**, priorities, reneging/balking, preemption, breakdowns, and rule-based routing (probability / shortest-queue / by-attribute). Scale is handled with **groups** that collapse and replicate (`×N`) and expand at run time. The same primitives model an airport or a 100k-client global network.

## What it computes

- **KPIs with statistics:** wait, time-in-system, queue length, utilization, throughput, balking/reneging — as **mean ± 95% CI** across replications, plus percentiles (p50/p90/p95) and over-time series.
- **Design optimization:** the built-in **Cross-Entropy optimizer** searches server counts / buffer sizes for the **lowest-cost** configuration that satisfies your service constraints, comparing candidates under **common random numbers**.

## Why you can trust it

- **Deterministic & reproducible** — every run is seeded; same input + seed ⇒ identical output.
- **Validated against theory** — M/M/1 and M/M/c results land within CI of the closed-form values (e.g. M/M/1 at ρ≈0.79: utilization 0.794, Wq 30.8); preemptive-priority and availability models match their analytical targets.
- **Tested** — 140 engine tests, many asserting analytical results, not just "it runs".

## How you use it

- **CLI:** `validate` · `run` · `optimize` · `record` — JSON in, JSON out (pipe a generator's output with `-`).
- **Library:** `buildSimulation`, `runExperiment`, `optimize`, `recordRun`, `expandGroups`.
- **Anywhere JS runs** — browser, Node, or a Web Worker (it powers [YourSim Studio](https://yoursim.plantagoai.com)).

## At a glance

| | |
|---|---|
| Package | `@plantagoai/yoursim-engine` (public npm) |
| License | MIT · zero runtime dependencies |
| Language | TypeScript (ESM + types) |
| Docs | [yoursim-engine.plantagoai.com](https://yoursim-engine.plantagoai.com) |
| Visual companion | [YourSim Studio](https://yoursim.plantagoai.com) — free |

See the [tutorial](/tutorial), the [blocks reference](/blocks), the [theory notes](/theory/01-discrete-event-simulation), or the [whitepaper](/whitepaper).
