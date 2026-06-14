export interface Entity {
  id: number;
  createdAt: number;
  priority: number;
  enqueuedAt: number;
  /** Pool id → units currently held (allocated lazily by seize). */
  held?: Map<string, number>;
  /** User attributes (set by assign nodes), used for routing/class logic. */
  attributes?: Record<string, number>;
  /** Members of a temporary batch, restored by a later separate. */
  members?: Entity[];
  /** Service time left after a preempt-resume; consumed on the next service start. */
  remainingService?: number;
}
