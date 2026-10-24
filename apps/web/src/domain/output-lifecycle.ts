/** One lifecycle contract for finished-product slots across workspaces. */
export type OutputSlotKind = "session" | "version";
export type OutputRecycleAction = "remove" | "restore" | "purge" | "empty-bin";
export type OutputSlotAction = OutputRecycleAction | "rename" | "disable";

export interface OutputRecycleEntry {
  id: string;
  kind: OutputSlotKind;
  name: string;
  deletedAt: string;
  parentSessionId?: string | null;
  parentSessionName?: string | null;
}
