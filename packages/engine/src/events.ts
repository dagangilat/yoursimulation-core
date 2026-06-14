export type SimEvent =
  | { kind: 'arrival'; t: number; entityId: number; nodeId: string }
  | { kind: 'move'; t: number; entityId: number; from: string; to: string }
  | { kind: 'depart'; t: number; entityId: number; nodeId: string }
  | { kind: 'server'; t: number; nodeId: string; busy: number; servers: number }
  | { kind: 'queue'; t: number; nodeId: string; length: number };

export interface RunRecording {
  horizon: number;
  warmup: number;
  nodeIds: string[];
  events: SimEvent[];
}
