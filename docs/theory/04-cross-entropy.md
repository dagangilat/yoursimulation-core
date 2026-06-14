# Cross-Entropy optimization

Running a model answers "what happens if I staff it like *this*?". Optimization answers the more useful question: "what's the **cheapest** design that still meets my service target?". YourSimulation solves this with the **Cross-Entropy (CE) method**, implemented in [`optimize.ts`](https://github.com/dagangilat/yoursimulation-core/blob/main/packages/engine/src/optimize.ts).

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

## The method's origin: Prof. Reuven Rubinstein

The Cross-Entropy method was created by **Prof. Reuven Y. Rubinstein** (1938–2012) of the Technion — Israel Institute of Technology, one of the most influential figures in Monte Carlo simulation and stochastic optimization. He first introduced CE in 1997 as an adaptive importance-sampling scheme for estimating the probability of **rare events** — situations so unlikely that naïve simulation would almost never observe them. He then made the leap that the same idea, iteratively minimizing the [Kullback–Leibler (cross-entropy) divergence](https://en.wikipedia.org/wiki/Cross-entropy_method) between a parametric sampling distribution and the (unknown) optimal one, could be turned into a general-purpose **optimization** method: treat "find the best design" as "estimate the rare event of sampling a near-optimal design," and let the distribution learn its way there. That is exactly the sample → evaluate → refit loop above.

Rubinstein's broader legacy runs through this whole project: beyond CE, he pioneered the **score-function (likelihood-ratio) method** for sensitivity analysis and gradient estimation in simulation, and authored the field-defining texts *Simulation and the Monte Carlo Method* and *The Cross-Entropy Method: A Unified Approach to Combinatorial Optimization, Monte-Carlo Simulation and Machine Learning* (with Dirk P. Kroese). When YourSimulation searches for the cheapest staffing that still meets your service target, it is standing directly on his work.

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
