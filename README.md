# YourSimulation Core

The open-source heart of **YourSimulation** — a discrete-event queue simulator
with design optimization, plus the Claude Code skill/plugin that drives it.

> Describe a service/queue/network system in plain language → get a validated
> model → estimate waits, utilization, and throughput → find the cheapest design
> that meets a service target.

**License: [MIT](./LICENSE)** — free to use, fork, and commercialize, no strings
attached. Built for the public, education, researchers, and consultants.

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
