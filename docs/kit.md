---
layout: page
title: YourSim Engine — Intro Kit
sidebar: false
aside: false
---

<div class="kit">

<div class="kit-brand">
  <div class="mark">▚</div>
  <div>
    <div class="name">YourSim Engine</div>
    <div class="tag">DES + design optimization · TypeScript · MIT</div>
  </div>
</div>

<div class="kit-card kit-hero">
  <span class="kit-pill">YourSim Engine</span>
  <h1>Simulate any queue or network system — and optimize its design — from one small library.</h1>
  <p class="sub">A fast, deterministic discrete-event simulation engine with a built-in Cross-Entropy optimizer. TypeScript, zero dependencies, MIT. Library, CLI, or Web Worker.</p>
  <div class="kit-callout"><code>npm i @plantagoai/yoursim-engine</code> · <code>npx @plantagoai/yoursim-engine run model.json --pretty</code></div>
</div>

<div class="kit-card">
  <h2>What is YourSim Engine?</h2>
  <p>A directed graph of 12 block types — sources, queues, resources, pools, routing, batching, assembly — flows entities through limited resources. The engine answers “how does it behave?” (waits, utilization, throughput, with confidence intervals) and “what’s the cheapest design that meets my target?” (a Cross-Entropy optimizer over server counts and buffers). It’s the open-source core that powers <a href="https://yoursim.plantagoai.com">YourSim Studio</a>.</p>
  <div class="kit-features">
    <div class="kit-feature"><div class="ico">🧱</div><h3>Model</h3><p>12 node types, 8 distributions, resource pools, priorities, reneging, preemption, failures, routing — and groups that replicate (×N) for scale.</p></div>
    <div class="kit-feature"><div class="ico">🎲</div><h3>Simulate (deterministic)</h3><p>Event-driven core; KPIs as mean ± 95% CI, percentiles, and over-time series. Seeded ⇒ reproducible, validated against M/M/1 · M/M/c theory.</p></div>
    <div class="kit-feature"><div class="ico">🎯</div><h3>Optimize</h3><p>The Cross-Entropy method finds the lowest-cost design that meets your service constraints, comparing candidates under common random numbers.</p></div>
  </div>
  <div class="kit-callout">Use it as a <strong>library</strong> (<code>runExperiment</code>, <code>optimize</code>, <code>recordRun</code>, <code>expandGroups</code>) or a <strong>CLI</strong> (<code>validate · run · optimize · record</code>) — JSON in, JSON out.</div>
</div>

<div class="kit-grid">
  <div class="kit-material" style="--accent:#4F46E5">
    <span class="chip">📄 1 page</span>
    <h3>One-pager</h3>
    <p>What the engine is, what it computes, and why you can trust it.</p>
    <a class="go" href="/one-pager">Read →</a>
  </div>
  <div class="kit-material" style="--accent:#7C3AED">
    <span class="chip">📘 whitepaper</span>
    <h3>Whitepaper</h3>
    <p>Model, methods (DES + Cross-Entropy), determinism, and validation.</p>
    <a class="go" href="/whitepaper">Read →</a>
  </div>
  <div class="kit-material" style="--accent:#0EA5A4">
    <span class="chip">📦 npm</span>
    <h3>Install</h3>
    <p><code>npm i @plantagoai/yoursim-engine</code> — ESM + types, zero deps.</p>
    <a class="go" href="https://www.npmjs.com/package/@plantagoai/yoursim-engine">npm →</a>
  </div>
  <div class="kit-material" style="--accent:#10B981">
    <span class="chip">⌨ API &amp; CLI</span>
    <h3>API &amp; CLI</h3>
    <p>Library functions and the JSON-in/JSON-out command line.</p>
    <a class="go" href="/api">Reference →</a>
  </div>
  <div class="kit-material" style="--accent:#F43F5E">
    <span class="chip">⌥ source</span>
    <h3>GitHub</h3>
    <p>MIT, open source — read the code, file issues, contribute.</p>
    <a class="go" href="https://github.com/dagangilat/yoursimulation-core">Repo →</a>
  </div>
  <div class="kit-material" style="--accent:#F59E0B">
    <span class="chip">🖥 visual</span>
    <h3>Try it in Studio</h3>
    <p>Prefer no code? Build and run models visually in the free app.</p>
    <a class="go" href="https://yoursim.plantagoai.com">Open Studio →</a>
  </div>
</div>

<div class="kit-card">
  <h2>📧 Email me these materials</h2>
  <div class="kit-email">
    <input type="email" placeholder="you@organization.org" aria-label="Your email" />
    <a class="btn" href="mailto:oss@plantagoai.com?subject=YourSim%20Engine%20materials&body=Please%20send%20me%20the%20YourSim%20Engine%20one-pager%20and%20whitepaper.">Send</a>
  </div>
  <p class="kit-note">This opens your mail app to request the materials from oss@plantagoai.com. (A self-serve send is on the roadmap.)</p>
</div>

</div>
