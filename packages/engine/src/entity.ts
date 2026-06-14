export interface Entity {
  id: number;
  createdAt: number;
  priority: number;
  enqueuedAt: number;
  /** Pool id → units currently held (allocated lazily by seize). */
  held?: Map<string, number>;
}
