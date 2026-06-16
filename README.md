<div align="center">

<a href="https://yoursim.plantagoai.com">
  <img src="docs/public/favicon.svg" alt="YourSimulation" width="84" height="84">
</a>

# YourSimulation Core

**The open-source heart of YourSimulation** — a zero-dependency discrete-event<br>
queue simulator with design optimization, plus the Claude Code skill/plugin that drives it.

[![Launch the Studio](https://img.shields.io/badge/Studio-Launch%20app-4F46E5?style=flat-square)](https://yoursim.plantagoai.com)
[![Engine docs](https://img.shields.io/badge/Docs-yoursim--engine.plantagoai.com-0E7490?style=flat-square)](https://yoursim-engine.plantagoai.com)
[![npm](https://img.shields.io/npm/v/@plantagoai/yoursim-engine?style=flat-square&color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@plantagoai/yoursim-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

</div>

> Describe a service/queue/network system in plain language → get a validated
> model → estimate waits, utilization, and throughput → find the cheapest design
> that meets a service target.

**License: [MIT](./LICENSE)** — free to use, fork, and commercialize, no strings
attached. Built for the public, education, researchers, and consultants.

## YourSimulation Studio

**[▶ Launch the Studio — free, in your browser](https://yoursim.plantagoai.com)**

The open core in this repo also powers **YourSimulation Studio** — a free,
browser-based visual model editor, experiment runner, and optimizer. No install,
no account: open the page and start modeling. Build any service / queue / network
system from 12 blocks, get waits, utilization, and throughput with 95% confidence
intervals, watch deterministic animated playback, and let a Cross-Entropy
optimizer find the cheapest design that meets your service target. **Free to
use.** Try it on a worked example — airport security, hospital triage, a bank
branch, a factory line with breakdowns, a saturated restaurant, or a 100k-client
CDN network.

**Explore:**
[Documentation](https://yoursim-engine.plantagoai.com) ·
[Tutorial](https://yoursim-engine.plantagoai.com/tutorial) ·
[Examples](https://yoursim-engine.plantagoai.com/examples) ·
[Intro Kit](https://yoursim-engine.plantagoai.com/kit)

## What's in here

| Path | What it is |
| --- | --- |
| `packages/engine` | The DES engine + CLI (`validate`, `run`, `optimize`, `record`) |
| `.claude/skills/yoursimulation` | The Claude Code skill — AI-native modeling interface |
| `.claude-plugin/` | Plugin manifest + marketplace so it installs as a Claude plugin |
| `docs/` | Theory, architecture, tutorial, glossary, and example models |

## Engine CLI

```bash
npm install
npx @plantagoai/yoursim-engine validate model.json
npx @plantagoai/yoursim-engine run model.json --pretty
npx @plantagoai/yoursim-engine optimize model.json problem.json --pretty
```

## Install as a Claude Code plugin

```
/plugin marketplace add dagangilat/yoursimulation-core
/plugin install yoursimulation@yoursimulation
```

## Tests

```bash
npm test
```

## Relationship to YourSimulation Studio

This repo is the **open core**. The visual **Studio** (drag-and-drop editor,
experiment runner, and optimization UI/UX) is a separate product — closed source,
free to use — built on top of this engine.
