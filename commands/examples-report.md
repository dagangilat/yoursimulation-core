---
description: Run all bundled YourSimulation example models through the engine and produce an HTML report (KPIs ± 95% CI).
---

Run every example model that ships with this plugin through the YourSimulation engine and produce one self-contained HTML report.

Do this:

1. Run the bundled report script, writing the report into the user's current working directory:

   ```bash
   npx -y tsx "${CLAUDE_PLUGIN_ROOT}/packages/engine/scripts/examples-report.ts" "$(pwd)/yoursim-examples-report.html"
   ```

   It validates → expands groups → runs each example under the skill's `references/examples/*.json`, collects per-node KPIs (mean ± 95% CI), and writes the HTML report. It prints a per-example `✓/✗` line, a summary (`Ran N examples (N ok, 0 error)`), and exits non-zero if any example fails. The engine is zero-dependency TypeScript run via `tsx`; the first run takes a few seconds while `npx` fetches `tsx` (cached afterward). No build or `npm install` is required.

2. Report back from the script's stdout: how many examples ran and passed, total time, any failures (with the error), and the absolute path to the generated `yoursim-examples-report.html`. Offer to open it.

Notes:
- To run a single model instead of all examples: `npx -y @plantagoai/yoursim-engine run <model.json> --pretty`.
- To optimize a model against a budget/target: `npx -y @plantagoai/yoursim-engine optimize <model.json>`.
