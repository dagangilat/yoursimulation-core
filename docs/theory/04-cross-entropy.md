# Cross-Entropy optimization

Running a model answers "what happens if I staff it like *this*?". Optimization answers the more useful question: "what's the **cheapest** design that still meets my service target?". YourSimulation solves this with the **Cross-Entropy (CE) method**, implemented in [`optimize.ts`](https://github.com/dagangilat/yoursimulation/blob/main/packages/engine/src/optimize.ts).

## The problem

You declare two things:

- **`variables`** — the integer knobs to tune. Each targets a node's `servers` or `capacity`, with a `min`, `max`, and a `costPerUnit`.
- **`constraints`** — service targets on a node `metric` (e.g. a queue's `avgWait`). Each has an optional `soft` threshold and `hard` threshold, with penalty weights `wSoft` and `wHard`. Soft = "prefer not to exceed"; hard = "must not exceed".

The optimizer searches the integer grid of variable settings, evaluating each candidate by **simulating** it.

## The objective

Each candidate is scored: its dollar cost, plus a penalty for every threshold it overshoots.

$$\text{score} = \text{cost} + \sum_i \left[w^{\text{soft}}_i \max(0,\, m_i - s_i) + w^{\text{hard}}_i \max(0,\, m_i - h_i)\right]$$

where $m_i$ is the simulated metric, $s_i$ the soft threshold, $h_i$ the hard threshold. Lower is better. A candidate is **feasible** when no *hard* constraint is exceeded; the optimizer reports the best-scoring candidate and whether it's feasible.

## The Cross-Entropy method

CE is a population-based search that learns *where good solutions live*:

1. **Sample.** Each variable has a Gaussian (mean, std). Draw a population of `population` candidates from those Gaussians, then **round and clamp** each to its integer `[min, max]` range.
2. **Evaluate.** Simulate every candidate and score it.
3. **Select the elite.** Keep the top `eliteFraction` by score.
4. **Refit.** Recompute each variable's Gaussian from the elite's mean and std, blended with the old one by a smoothing factor $\alpha$ ($\text{new} = \alpha \cdot \text{elite} + (1-\alpha) \cdot \text{old}$). A **std floor** keeps the search from collapsing too early.
5. **Repeat** for `iterations`, or stop once every std has shrunk to the floor (converged).

Over iterations the Gaussians concentrate around low-cost, feasible designs. Defaults: `population` 40, `eliteFraction` 0.2, `iterations` 15, `replications` 10, `alpha` 0.7, `stdFloor` 0.5.

## Fair comparison: common random numbers

Every candidate is simulated with the **same** `settings.seed`. Because the engine derives [independent RNG streams](/theory/01-discrete-event-simulation#seeded-rng-streams) from that seed, two candidates see the *same* arrival pattern and service draws — so a score difference reflects the design change, not luck. This common-random-numbers setup sharply reduces comparison noise.

## Percentile constraints

Most metrics (like `avgWait`) come from the standard summary. But percentile metrics — `p95Wait` and `p95TimeInSystem` — require the engine's **detailed** mode (per-entity samples). If any constraint uses one, the optimizer automatically switches every evaluation to detailed runs.

## Try it

A `problem.json` declaring the knobs and targets — here, tune the number of desks (1–8 servers, $50 each) to keep mean queue wait under 5 minutes:

```json
{
  "variables": [
    { "nodeId": "desks", "param": "servers", "min": 1, "max": 8, "costPerUnit": 50 }
  ],
  "constraints": [
    { "nodeId": "checkin-q", "metric": "avgWait", "soft": 5, "hard": 10, "wSoft": 20, "wHard": 200 }
  ]
}
```

```bash
npx tsx packages/engine/src/cli.ts optimize docs/examples/airport-tutorial.json problem.json --pretty
# reports the cheapest server count whose avgWait stays under the target
```

See also: [queueing theory](/theory/02-queueing-theory) for what the metrics mean, and the [glossary](/glossary).
