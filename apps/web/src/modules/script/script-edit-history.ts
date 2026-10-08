import type { EmotionLabel, StudioWord } from "../../domain/types";

export interface ScriptEditSnapshot {
  text: string;
  words: StudioWord[];
  speakerProfileIds?: string[];
  environmentProfileIds?: string[];
  emotion?: EmotionLabel;
}
interface Edit { assetId: string | null; before: ScriptEditSnapshot; after: ScriptEditSnapshot; }
interface RestoredEdit { assetId: string | null; snapshot: ScriptEditSnapshot; related?: RestoredEdit[]; }

/** Session-only immutable snapshots; processing results are never added here. */
export class ScriptEditHistory {
  private past: Edit[][] = [];
  private future: Edit[][] = [];
  private group: Edit[] | null = null;
  record(assetId: string | null, before: ScriptEditSnapshot, after: ScriptEditSnapshot) {
    if (before.text === after.text && before.words === after.words && before.emotion === after.emotion &&
      before.speakerProfileIds === after.speakerProfileIds && before.environmentProfileIds === after.environmentProfileIds) return;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const edit = { assetId, before, after };
    if (this.group) { this.group.push(edit); return; }
    this.commit([edit]);
  }
  private commit(edits: Edit[]) {
    this.past.push(edits);
    if (this.past.length > 30) this.past.shift();
    this.future = [];
  }
  batch(action: () => void) {
    const edits: Edit[] = [];
    this.group = edits;
    try { action(); }
    finally { this.group = null; if (edits.length) this.commit(edits); }
  }
  private restore(edits: Edit[], direction: "before" | "after"): RestoredEdit {
    const snapshots = edits.map((edit) => ({ assetId: edit.assetId, snapshot: edit[direction] }));
    return snapshots.length === 1 ? snapshots[0] : { ...snapshots[0], related: snapshots.slice(1) };
  }
  undo() { const edits = this.past.pop(); if (!edits) return null; this.future.push(edits); return this.restore(edits, "before"); }
  redo() { const edits = this.future.pop(); if (!edits) return null; this.past.push(edits); return this.restore(edits, "after"); }
}
