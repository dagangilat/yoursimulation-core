import { buildSimulation } from './build.js';
import { streamSeed } from './random.js';
import type { SimModel } from './model.js';
import type { RunSettings } from './experiment.js';
import type { RunRecording, SimEvent } from './events.js';

/** Runs ONE replication recording every event. Matches experiment replication 0's seed. */
export function recordRun(model: SimModel, s: RunSettings): RunRecording {
  if (s.horizon <= 0) throw new Error('horizon must be positive');
  const events: SimEvent[] = [];
  const built = buildSimulation(model, streamSeed(s.seed, 'rep-0'), (e) => events.push(e));
  built.run(s.horizon);
  return { horizon: s.horizon, warmup: s.warmup, nodeIds: model.nodes.map((n) => n.id), events };
}
