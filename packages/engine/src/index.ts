export const ENGINE_VERSION = '0.1.0';

export { EventCalendar } from './calendar.js';
export { Random, streamSeed } from './random.js';
export { sample, type Distribution } from './distributions.js';
export { Simulation } from './simulation.js';
export { Tally, TimeWeighted } from './stats.js';
export type { Entity } from './entity.js';
export type {
  SimModel,
  ModelNode,
  ModelEdge,
  NodeType,
  NodeParams,
  SourceParams,
  QueueParams,
  ResourceParams,
  DelayParams,
  BranchParams,
  SinkParams,
} from './model.js';
export { buildSimulation, type BuiltSimulation } from './build.js';
export {
  RuntimeNode,
  SourceNode,
  SinkNode,
  QueueNode,
  ResourceNode,
  BranchNode,
  type NodeContext,
} from './nodes.js';
export {
  runExperiment,
  type RunSettings,
  type MetricSummary,
  type ExperimentResult,
  type DetailStats,
  type ExperimentOptions,
} from './experiment.js';
export { recordRun } from './record.js';
export type { SimEvent, RunRecording } from './events.js';
export { quantile, histogram } from './detail.js';
export type { Histogram } from './detail.js';
export {
  optimize, applyVariables, scoreAndFeasible, costOf, metricValue, needsDetailed,
  type OptVariable, type OptConstraint, type OptProblem, type OptOptions,
  type Candidate, type OptimizationResult,
} from './optimize.js';
