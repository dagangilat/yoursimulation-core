import type { Distribution } from './distributions.js';

export type NodeType =
  | 'source'
  | 'queue'
  | 'resource'
  | 'branch'
  | 'sink'
  | 'delay'
  | 'seize'
  | 'release'
  | 'assign'
  | 'batch'
  | 'separate'
  | 'match';

export interface SourceParams {
  interarrival: Distribution;
  priority?: number;
  maxArrivals?: number;
}

export interface QueueParams {
  discipline?: 'fifo' | 'lifo' | 'priority';
  capacity?: number;
  /** Abandonment: an entity leaves the queue if not served within a patience time. */
  reneging?: { patience: Distribution };
}

export interface ResourceParams {
  servers: number;
  service: Distribution;
  /** Let a higher-priority arrival bump a lower one off a server when full.
   *  `resume` keeps the victim's remaining service; `restart` resamples it. */
  preemption?: 'resume' | 'restart';
  /** Breakdowns: the resource alternates up (for `uptime`) and down (for `repair`).
   *  While down it serves nothing; in-progress work is paused and resumed on repair.
   *  Steady-state availability = mean(uptime) / (mean(uptime) + mean(repair)). */
  failures?: { uptime: Distribution; repair: Distribution };
}

/** Pure time advance with no capacity contention (infinite-server). */
export interface DelayParams {
  delay: Distribution;
}

/** Acquire `units` of a shared ResourcePool, holding them until a later release. */
export interface SeizeParams {
  pool: string;
  units?: number; // default 1
  priority?: number; // default: the entity's own priority
}

/** Return pool units the entity holds (default: all it holds for that pool). */
export interface ReleaseParams {
  pool: string;
  units?: number;
}

/** Set an entity attribute (or its priority) to a sampled value. `to` is an
 *  attribute name, or the reserved word `priority`. */
export interface AssignParams {
  to: string;
  value: Distribution;
}

/**
 * Routing modes:
 * - `probability` (default): use each out-edge's `probability` (must sum to 1).
 * - `shortest-queue`: send to the least-congested downstream node (join-shortest-queue).
 * - `by-attribute`: send to the out-edge whose `value` equals `entity.attributes[key]`;
 *   an out-edge with no `value` is the default/else route.
 */
export interface BranchParams {
  mode?: 'probability' | 'shortest-queue' | 'by-attribute';
  key?: string; // attribute to match in by-attribute mode
}

/** Accumulate `size` entities into one. `temporary` keeps members for a later separate. */
export interface BatchParams {
  size: number;
  mode?: 'permanent' | 'temporary'; // default permanent
}

/** Split a temporary batch back into its members, or duplicate an entity into copies. */
export interface SeparateParams {
  mode?: 'split-batch' | 'duplicate'; // default split-batch
  copies?: number; // for duplicate; default 2
}

/** Assemble: wait for one entity of each `parts` value (read from `attributes[key]`),
 *  then emit one combined entity carrying them as members. Tag parts upstream with
 *  `assign`. Entities whose part value is not in `parts` are dropped. */
export interface MatchParams {
  key: string;
  parts: number[];
}

export type SinkParams = Record<string, never>;

export type NodeParams =
  | SourceParams
  | QueueParams
  | ResourceParams
  | DelayParams
  | SeizeParams
  | ReleaseParams
  | AssignParams
  | BranchParams
  | BatchParams
  | SeparateParams
  | MatchParams
  | SinkParams;

export interface ModelNode {
  id: string;
  type: NodeType;
  label?: string;
  params: NodeParams;
}

export interface ModelEdge {
  id: string;
  from: string;
  to: string;
  /** Required on probability-mode branch out-edges; ignored elsewhere. */
  probability?: number;
  /** by-attribute branch routing: the attribute value that selects this edge. */
  value?: number;
}

/** A named pool of interchangeable capacity, seized/released across steps. */
export interface ResourcePool {
  id: string;
  capacity: number;
}

export interface SimModel {
  schemaVersion: 1;
  nodes: ModelNode[];
  edges: ModelEdge[];
  resources?: ResourcePool[];
}
