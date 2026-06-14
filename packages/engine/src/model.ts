import type { Distribution } from './distributions.js';

export type NodeType = 'source' | 'queue' | 'resource' | 'branch' | 'sink';

export interface SourceParams {
  interarrival: Distribution;
  priority?: number;
  maxArrivals?: number;
}

export interface QueueParams {
  discipline?: 'fifo' | 'lifo' | 'priority';
  capacity?: number;
}

export interface ResourceParams {
  servers: number;
  service: Distribution;
}

export type BranchParams = Record<string, never>; // routing probabilities live on edges
export type SinkParams = Record<string, never>;

export type NodeParams = SourceParams | QueueParams | ResourceParams | BranchParams | SinkParams;

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

export interface SimModel {
  schemaVersion: 1;
  nodes: ModelNode[];
  edges: ModelEdge[];
}
