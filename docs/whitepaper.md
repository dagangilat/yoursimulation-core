# YourSim Engine — Whitepaper

*A deterministic discrete-event simulation and design-optimization engine for service, queue, and network systems.*

## 1. Motivation

Queueing networks underlie airports, hospitals, contact centers, factories, logistics, and computer networks: stochastic arrivals competing for limited resources, with priorities, finite buffers, abandonment, failures, batching, and routing. Two questions recur — *how does a given design behave?* and *what is the cheapest design that meets a service target?* Closed-form queueing results cover only idealized cases; beyond them, **discrete-event simulation (DES)** is the standard rigorous method. YourSim Engine is a small, dependency-free TypeScript engine that does both: it simulates the system and **optimizes the design**, runs anywhere JavaScript runs (Node, browser, Web Worker), and is auditable because every run is deterministic.

## 2. Model

A model is a directed graph of **12 node types** plus shared resource pools:

- **source** (arrivals), **queue** (FIFO/LIFO/priority, optional capacity → balking, optional reneging/abandonment), **resource** (c parallel servers; optional preemption and failures), **delay** (infinite-server time advance), **seize/release** (hold units of a named **resource pool** across steps), **assign** (set entity attributes / priority), **batch/separate** (group and split), **match** (assemble one of each part), **branch** (routing: probability / shortest-queue / by-attribute), **sink**.

Times are drawn from **8 distributions** (const, exp, uniform, triangular, normal, lognormal, Erlang, empirical). A plain `resource` is exactly sugar for `seize → delay(service) → release` of a capacity-`c` pool. Validation (a dry build) enforces structural rules: unique ids, edges reference real nodes, exactly one out-edge per flow node, branch probabilities sum to 1, every resource is queue-fed, no instantaneous loops, pool/seize integrity, and no held-resource leaks.

## 3. Methods

**Event-driven simulation.** A binary-heap **event calendar** advances simulated time event-by-event; events can be cancelled (used for reneging timers and preempting in-service completions). Randomness comes from a seeded PRNG with independent streams per concern, so a run is a pure function of `(model, seed)`.

**Statistics.** `runExperiment` performs N independent replications, discards a warm-up window, and reports per-node KPIs (wait, time-in-system, queue length, utilization, throughput, balked/reneged) as **mean ± 95% confidence interval**, with an optional detailed mode adding **percentiles** (p50/p90/p95), histograms, and bucketed over-time series — all derived from the same event stream, so means are identical to the lean path.

**Design optimization — Cross-Entropy.** `optimize` solves *minimize cost subject to service constraints* over integer decision variables (server counts, buffer capacities). It uses the **Cross-Entropy method** (Rubinstein): maintain a per-variable Gaussian, sample a population of candidate designs, simulate and score each as `cost + Σ wᵢ·max(0, metricᵢ − thresholdᵢ)`, keep the elite fraction, and refit the Gaussians toward the elite with smoothing — iterating until the search distribution collapses. Candidates are evaluated under **common random numbers** (a fixed seed across the population) so comparisons are low-variance and fair. Streaming progress exposes the elite-mean score and the narrowing per-variable distribution.

**Scale via groups.** `expandGroups` rewrites a model before simulation: a group with `count = N` is **flattened** into N cloned sub-networks (with a shortest-queue split and merged exits) while under a node budget, or **aggregated** into one copy with capacities/rates scaled by N beyond it — so a 30-branch or 100k-client topology stays tractable.

## 4. API & CLI

- **Library:** `buildSimulation`, `runExperiment`, `optimize`, `recordRun` (an event trace for animation), `expandGroups`. ESM with TypeScript types.
- **CLI:** `npx @plantagoai/yoursim-engine validate|run|optimize|record model.json` — JSON in, JSON out; read from stdin with `-` (pipe a generator's output for large topologies).

## 5. Determinism & validation

Determinism is a design goal: identical `(model, seed)` ⇒ byte-identical results, so studies are reproducible and auditable. The engine is validated against analytical queueing theory wherever closed forms exist — within simulation CI of theory: **M/M/1** at ρ≈0.79 (utilization 0.794, mean queue wait ≈ 30.8, Lq ≈ 3.07), **M/M/c** Erlang-C waits, **M/M/1 preemptive-resume** per-class sojourn, and resource **availability** = U/(U+R). The 140+ test suite asserts these analytical targets, not merely that the code runs.

## 6. Integration

The engine is the simulation core of **YourSim Studio** (a free visual app) but stands alone: import it as a library in a Node service or data pipeline, run the CLI in CI, or call it from a Web Worker in the browser. Zero runtime dependencies keeps the supply chain trivial; MIT licensing keeps usage unrestricted.

## 7. Limitations

The engine models **queueing-network DES** — not agent-based, continuous, or system-dynamics modelling. The optimizer searches integer capacities against cost + service constraints, not arbitrary structural redesign. Group replication is single-entry/single-exit per group (v1), with approximate deep nesting. Percentile constraints trigger detailed (heavier) runs. These bounds are deliberate: they keep the engine small, fast, and trustworthy.

## 8. License & links

MIT · zero dependencies · `@plantagoai/yoursim-engine` on public npm.

- Docs: [yoursim-engine.plantagoai.com](https://yoursim-engine.plantagoai.com) · GitHub: [yoursimulation-core](https://github.com/dagangilat/yoursimulation-core)
- See the [one-pager](/one-pager), [API & CLI](/api), [blocks](/blocks), [Cross-Entropy theory](/theory/04-cross-entropy), and the visual [Studio](https://yoursim.plantagoai.com).
