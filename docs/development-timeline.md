# Development timeline

YourSimulation was built in phases, each one a usable layer on top of the last:
a rigorous engine first, then a visual editor, then experiments and storage, and
finally analytics, optimization, and an AI companion. This page is the build
story.

## The story

### Phase 1 — Engine

The foundation is a **zero-dependency** discrete-event simulation kernel: an
event calendar, seeded RNG streams, the distributions, and the five node types.
Correctness came first — the engine was validated against the closed-form
results of **M/M/1 and M/M/c** queues, so its numbers can be trusted before any
UI existed. See [discrete-event simulation](/theory/01-discrete-event-simulation)
and [queueing theory](/theory/02-queueing-theory).

### Phase 2 — Canvas editor

A React Flow **drag-and-drop** canvas for building models visually: drop
sources, queues, resources, branches, and sinks, wire them with edges, and edit
their parameters. See the [architecture](/architecture).

### Phase 3 — Experiment mode & persistence

The engine moved **into a Web Worker** so long runs never freeze the UI.
Run settings (`horizon`, `warmup`, `replications`, `seed`) became part of the
model schema, and a **KPI dashboard** reported each metric as a mean with a
**95% confidence interval**. Firebase **Auth + Firestore** added sign-in and
cloud model/experiment storage.

### Phase 3.5 — Branding & design system

A light/dark **token theme**, a branded login screen, and a gradient wordmark —
the visual identity layered over the working app.

### Phase 4 — Watch mode & domain storytelling

A deterministic **event recorder** (`recordRun`) replays a single replication
event-by-event, driving **skinned animated playback**. Domain themes
(generic / airport / hospital / logistics / network) plus templates let the same
generic engine tell a domain-specific story.

### Phase 5 — Analytics & experiment design

**Detailed statistics** — percentiles, histograms, and time series — rendered as
**SVG charts**, plus the ability to save experiments and **compare** them
side-by-side.

### Phase 6 — Cross-Entropy optimizer

`optimize()` and an **Optimize tab**: a Cross-Entropy search that finds the
cheapest configuration meeting your service targets, instead of guessing.
See [Cross-Entropy optimization](/theory/04-cross-entropy).

### Phase 7 — AI companion

A **provider-neutral**, tool-using agent (Anthropic + Gemini, bring-your-own
key) that can read and propose model edits; the user reviews and clicks
**Apply**.

### Add-on — JSON CLI + Claude Code skill

A JSON-in/JSON-out **CLI** (`validate` / `run` / `optimize` / `record`) over the
engine, and a **Claude Code skill** that drives it from natural language. See the
[tutorial](/tutorial).

### Add-on — Documentation & theory

This documentation site: theory pages, the tutorial, the glossary, this
timeline, and the architecture map.

## At a glance

| Phase | Theme | Highlights |
| --- | --- | --- |
| 1 | Engine | Zero-dep DES kernel; validated against M/M/1 & M/M/c |
| 2 | Canvas editor | React Flow drag-and-drop model building |
| 3 | Experiment & persistence | Engine in a Web Worker; run-settings schema; KPI dashboard (mean ± 95% CI); Firebase auth + Firestore |
| 3.5 | Branding & design system | Light/dark token theme; branded login; gradient wordmark |
| 4 | Watch mode & storytelling | `recordRun` recorder; animated playback; domain themes + templates |
| 5 | Analytics & experiment design | Percentiles, histograms, time series; SVG charts; saved-experiment comparison |
| 6 | Cross-Entropy optimizer | `optimize()` + Optimize tab |
| 7 | AI companion | Provider-neutral tool-using agent (Anthropic + Gemini), propose → Apply |
| Add-on | CLI + Claude Code skill | `validate`/`run`/`optimize`/`record` + the skill |
| Add-on | Documentation & theory | This site |
