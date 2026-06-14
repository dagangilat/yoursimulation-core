# Glossary

A quick reference for the terms used across this site. For the full story behind
each, follow the links into the [theory](/theory/01-discrete-event-simulation)
pages.

## Arrival rate (λ)

The average number of entities arriving per unit time. If inter-arrival times
average $1/\lambda$, the arrival rate is $\lambda$. A `source` with exponential
inter-arrivals is a Poisson arrival process. See [queueing theory](/theory/02-queueing-theory).

## Balking

An arriving entity that leaves immediately because the queue is full (at its
`capacity`) rather than joining it. The engine reports balked counts on the
queue.

## Capacity

The maximum number of entities a `queue` can hold. Arrivals beyond capacity
balk. Omit it for an unbounded queue.

## Confidence interval

A range around an estimated mean that, with a stated probability, contains the
true value. The engine reports each KPI as a mean ± a **95%** CI half-width
across replications, so you can tell signal from noise.

## Cross-Entropy

The optimization method behind `optimize()`: it samples candidate designs from a
distribution, keeps the best ("elite") few, and re-fits the distribution toward
them, iterating until it converges on a cheap, feasible design. See
[Cross-Entropy optimization](/theory/04-cross-entropy).

## Discrete-event simulation

A simulation that advances time by jumping from one scheduled **event** to the
next (arrival, service completion, …) rather than ticking at fixed steps. See
[discrete-event simulation](/theory/01-discrete-event-simulation).

## Erlang-C

The classic formula for the probability that an arriving customer must wait in an
M/M/c queue; the basis for the closed-form results the engine is validated
against. See [queueing theory](/theory/02-queueing-theory).

## Kendall notation

The shorthand `A/S/c` describing a queue: arrival process / service
distribution / number of servers (e.g. M/M/1, M/M/c). "M" means Markovian
(exponential / memoryless).

## M/M/1

A single-server queue with exponential (Markovian) inter-arrival and service
times. Has simple closed-form results used to validate the engine. See
[queueing theory](/theory/02-queueing-theory).

## M/M/c

Like M/M/1 but with `c` parallel servers sharing one queue. Waiting depends on
the [Erlang-C](#erlang-c) formula. See [queueing theory](/theory/02-queueing-theory).

## Queue discipline

The rule for choosing which waiting entity is served next: FIFO (first in, first
out), LIFO, or priority. Set on a `queue`'s `discipline` parameter.

## Replication

One independent run of the model with its own random stream. Averaging KPIs over
many replications, and reporting a [confidence interval](#confidence-interval),
gives statistically meaningful results.

## Resource

A node modeling a pool of `servers`; each busy server holds one entity for a
sampled service time. A resource must be fed by a [queue](#queue-discipline) so
entities always have somewhere to wait. Reports [utilization](#utilization).

## Service rate (μ)

The average number of entities one server can complete per unit time; the inverse
of the mean service time. See [queueing theory](/theory/02-queueing-theory).

## Source

A node that creates entities, spacing arrivals by an inter-arrival distribution.
Model a stream of arrivals (passengers, packets, calls) as **one** source with a
rate — never one node per arriving entity.

## Throughput

The number of entities that completed (reached a `sink`) over the run — the
system's effective output rate.

## Time in system

The total time an entity spends from arrival to exit: waiting plus service across
all nodes it visits. Reported on the `sink`.

## Utilization

The fraction of a resource's server capacity that is busy,
$\rho = \lambda / (c\mu)$. The system is stable only when $\rho < 1$; wait grows
sharply as $\rho \to 1$. See [queueing theory](/theory/02-queueing-theory).

## Warm-up

An initial period whose statistics are discarded so transient startup behavior
(an empty system filling up) doesn't bias steady-state KPIs. Set via the
`warmup` run setting.

## Wait time

The time an entity spends waiting in a `queue` before a server is free (excludes
the service itself). Reported as `avgWait`, with percentiles in detailed mode.
