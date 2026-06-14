import type { Distribution } from './distributions.js';

export type NodeType =
  | 'source'
  | 'queue'
  | 'resource'
  | 'branch'
  | 'sink'
  | 'delay'
  | 'seize'
  | 'release';

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

export type BranchParams = Record<string, never>; // routing probabilities live on edges
export type SinkParams = Record<string, never>;

export type NodeParams =
  | SourceParams
  | QueueParams
  | ResourceParams
  | DelayParams
  | SeizeParams
  | ReleaseParams
  | BranchParams
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
  /** Required on branch out-edges; ignored elsewhere. */
  probability?: number;
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
