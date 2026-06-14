---
layout: home
hero:
  name: YourSimulation Engine
  text: Open-source discrete-event simulation
  tagline: A zero-dependency TypeScript engine for service, queue, and network systems — estimate waits, utilization, and throughput, and find the cheapest design that meets a service target. MIT licensed.
  actions:
    - theme: brand
      text: API & CLI
      link: /api
    - theme: alt
      text: Blocks
      link: /blocks
    - theme: alt
      text: Examples
      link: /examples
    - theme: alt
      text: Try the app
      link: https://yoursimulation-app.web.app
features:
  - title: 12 building blocks
    details: source, queue, resource, delay, seize/release (+ resource pools), assign, batch, separate, match, branch, sink — compose any service or network system.
  - title: Models the real world
    details: Reneging and balking, join-shortest-queue and class-based routing, shared resources held across steps, preemptive priority, machine breakdowns, and assembly.
  - title: Rigorous & reproducible
    details: Seeded replications with 95% confidence intervals, validated against closed-form queueing theory — M/M/1, M/M/c, Erlang-A, M/M/1 preemptive priority, and breakdown availability.
  - title: Run & optimize headless
    details: A CLI and a clean library API — run experiments and a Cross-Entropy optimizer from the command line or your own code, with zero runtime dependencies.
---
