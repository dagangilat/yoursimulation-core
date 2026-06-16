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
      link: https://yoursim.plantagoai.com
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

## YourSimulation Studio

**[▶ Launch the Studio — free, in your browser →](https://yoursim.plantagoai.com)**

The open-source engine documented here also powers **YourSimulation Studio** — a free, browser-based visual model editor, experiment runner, and optimizer. No install, no account: open the page and start modeling.

- **Drag-and-drop editor** — build any service / queue / network system from 12 blocks on a themed canvas.
- **Answers with error bars** — seeded replications report waits, utilization, and throughput with 95% confidence intervals.
- **Watch mode** — deterministic animated playback skinned for airports, hospitals, logistics, and networks.
- **Optimize, don't guess** — a Cross-Entropy search finds the cheapest design that still meets your service target.
- **AI companion** — a bring-your-own-key agent that proposes model edits from plain language.

**Free to use** — the Studio is free, and this engine underneath is open-source (MIT). Try it on a worked example: airport security, hospital triage, a bank branch, a factory line with breakdowns, a saturated restaurant, or a 100k-client CDN network — all ready to run.

### Keep exploring

- 📘 **[Documentation](https://yoursim.plantagoai.com/docs)** — the Studio app guide & reference
- 🎓 **[Tutorial](/tutorial)** — model an airport step by step
- 🗂️ **[Examples](/examples)** — domain models with KPIs and 95% CIs
- 🧩 **[Blocks reference](/blocks)** — every building block, explained
- 🧰 **[Intro Kit](/kit)** — the fastest path from zero to a running model
