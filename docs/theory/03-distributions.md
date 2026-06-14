# Distributions

Every random quantity in a model — interarrival times on a [source](/glossary#source), service times on a [resource](/glossary#resource) — is drawn from a **distribution**. YourSimulation ships eight, defined in [`distributions.ts`](https://github.com/dagangilat/yoursimulation/blob/main/packages/engine/src/distributions.ts). Each is written as a small JSON object with a `dist` tag plus its parameters.

Picking the right shape matters: exponential interarrivals are the textbook default for "random independent arrivals", but real service times are usually *not* exponential, and using the wrong distribution skews waits and utilization.

> Service and interarrival times cannot be negative. `normal` draws are clamped at 0; the others are non-negative by construction.

## const

Fixed value — no randomness. Useful for deterministic timings or as a sanity baseline.

- **Params:** `value`
- **JSON:** `{ "dist": "const", "value": 5 }`

## exp — exponential

The **memoryless** distribution: the chance of the next event in the coming instant doesn't depend on how long you've already waited. This is the canonical model for **random, independent arrivals** (a Poisson process) and the "M" in M/M/1.

- **Use it for:** arrival processes; the baseline for theory comparisons.
- **Params:** `mean`
- **JSON:** `{ "dist": "exp", "mean": 2 }`

## uniform

Equally likely anywhere between `min` and `max`. A simple "I only know the range" choice.

- **Use it for:** rough bounds with no central tendency.
- **Params:** `min`, `max`
- **JSON:** `{ "dist": "uniform", "min": 1, "max": 4 }`

## triangular

A peaked distribution defined by three numbers: the smallest plausible value, the most likely, and the largest. It encodes an expert's **min / likely / max** estimate without needing data.

- **Use it for:** service times when you have a stakeholder estimate but no measurements.
- **Params:** `min`, `mode`, `max`
- **JSON:** `{ "dist": "triangular", "min": 1, "mode": 3, "max": 6 }`

## normal

The bell curve, symmetric around `mean` with spread `sd`. Draws are clamped at 0 so times stay non-negative.

- **Use it for:** quantities that cluster tightly around an average with symmetric variation.
- **Params:** `mean`, `sd`
- **JSON:** `{ "dist": "normal", "mean": 5, "sd": 1 }`

## lognormal

A **right-skewed** distribution: most values near a typical level, with an occasional long tail of large values. It's the realistic default for service durations, where most jobs are quick but a few drag on.

- **Use it for:** right-skewed service times. Note the params are the mean (`mu`) and sd (`sigma`) of the *underlying normal*, not of the lognormal itself.
- **Params:** `mu`, `sigma`
- **JSON:** `{ "dist": "lognormal", "mu": 1, "sigma": 0.5 }`

## erlang

The sum of `k` independent exponential stages, each averaging `mean / k`. It models a process made of several sequential exponential steps and is less variable than a single exponential of the same mean.

- **Use it for:** **multi-stage service** (e.g. form, then check, then stamp); a "smoother than exponential" service time.
- **Params:** `k` (integer ≥ 1), `mean`
- **JSON:** `{ "dist": "erlang", "k": 3, "mean": 6 }`

## empirical

Samples directly from a list of observed `values`, optionally weighted. The closest you get to "just replay my measured data".

- **Use it for:** measured/historical data — no distributional assumption needed.
- **Params:** `values` (array), optional `weights` (array; defaults to equal weights)
- **JSON:** `{ "dist": "empirical", "values": [2, 3, 5, 8], "weights": [4, 3, 2, 1] }`

## Choosing quickly

| Situation | Distribution |
|---|---|
| Random independent arrivals | `exp` |
| Expert min/likely/max guess | `triangular` |
| Realistic, right-skewed service | `lognormal` |
| Several sequential service steps | `erlang` |
| You have measured data | `empirical` |
| Fixed timing / baseline | `const` |

See the [glossary](/glossary) for related terms, and [queueing theory](/theory/02-queueing-theory) for how the choice of distribution moves the math out of closed-form and into simulation.
