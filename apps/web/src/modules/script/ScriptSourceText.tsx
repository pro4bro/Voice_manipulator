import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { usePlaybackWord } from "../../domain/playback-sync";
import { WordContextMenu, WordNoteItem } from "../../ui/WordContextMenu";
import { deleteScriptWords, insertScriptTextAtWordBoundary, mapScriptWordsToText, reconcileScriptTextEdit, replaceScriptWord } from "./script-text-reconciliation";
import { buildReviewPieces } from "./review-diff";
import { TranscriptTextView, type TranscriptTextHandle } from "./TranscriptTextView";

const EMPTY_SPEAKERS: SpeakerProfile[] = [];

/** Each source retains its own editable text and clock in the shared Script. */
export function ScriptSourceText({ source, onChange, speakers = EMPTY_SPEAKERS, followPlayback = true, wordSelection = EMPTY_SELECTION, onWordSelectionChange }: {
  source: ProjectMediaAsset;
  speakers?: SpeakerProfile[];
  followPlayback?: boolean;
  onChange?: (id: string, words: StudioWord[], text: string) => void;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
}) {
  const [draft, setDraft] = useState(source.text);
  const editing = useRef(false);
  const baseline = useRef(source);
  const textView = useRef<TranscriptTextHandle>(null);
  const activeIndex = usePlaybackWord(source.id);
  const [isEditing, setIsEditing] = useState(false);
  const ranges = useMemo(() => mapScriptWordsToText(draft, source.words ?? []), [draft, source.words]);
  const scopedSelection = wordSelection.scope?.kind === "asset" && wordSelection.scope.id === source.id && wordSelection.scope.revision === source.updatedAt
    ? wordSelection : EMPTY_SELECTION;
  const activeRange = ranges.find((range) => range.index === activeIndex);
  const tracking = Boolean(activeRange && !isEditing && draft === source.text);
  const candidate = [...(source.revisions ?? [])].reverse().find((revision) => revision.source === "ai");
  const [reviewBase, setReviewBase] = useState(source.text);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<{ id: string; text: string } | null>(null);
  const [wordMenu, setWordMenu] = useState<{ indexes: number[]; target: number; boundary: number; revision: string; left: number; top: number } | null>(null);
  const [wordEditor, setWordEditor] = useState<{ kind: "add" | "edit"; index: number; boundary: number; revision: string; text: string } | null>(null);
  const [wordEditError, setWordEditError] = useState<string | null>(null);
  useEffect(() => { setWordMenu(null); setWordEditor(null); setWordEditError(null); }, [source.id, source.updatedAt]);
  useEffect(() => { setReviewBase(source.text); setChoices({}); setManual(null); }, [candidate?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const review = useMemo(() => candidate?.text && candidate.text !== reviewBase ? buildReviewPieces(reviewBase, candidate.text) : [], [candidate?.text, reviewBase]);
  useEffect(() => { if (!editing.current) setDraft(source.text); }, [source.text]);
  useEffect(() => {
    if (editing.current || !textView.current) return;
    const textRanges = scopedSelection.textRanges?.filter((range) => range.rowId === source.id) ?? [];
    let start: number, end: number;
    if (textRanges.length === 1) { start = textRanges[0].start; end = textRanges[0].end; }
    else {
      if (textRanges.length > 1 || !scopedSelection.indexes.length) return;
      const chosen = ranges.filter((range) => scopedSelection.indexes.includes(range.index));
      if (chosen.length !== scopedSelection.indexes.length || chosen.some((range, index) => index > 0 && range.index !== chosen[index - 1].index + 1)) return;
      start = chosen[0].start; end = chosen[chosen.length - 1].end;
    }
    textView.current.select(Math.max(0, Math.min(draft.length, start)), Math.max(0, Math.min(draft.length, end)), false);
  }, [draft, ranges, scopedSelection, source.id]);
  function commit(text: string, base = baseline.current) {
    const result = reconcileScriptTextEdit(base.text, text, base.words ?? []);
    onChange?.(source.id, result.words, result.text);
  }
  function choose(id: string, value: string) {
    const next = { ...choices, [id]: value };
    setChoices(next);
    const text = review.map((piece) => piece.kind === "same" ? piece.text : next[piece.id] ?? piece.stt).join("");
    setDraft(text);
    if (text !== source.text) commit(text, source);
    setManual(null);
  }
  function commitWordMenu() {
    if (!wordEditor || wordEditor.revision !== (source.updatedAt ?? "")) { setWordEditor(null); return; }
    const words = source.words ?? [];
    if (wordEditor.kind === "edit") {
      const result = replaceScriptWord(draft, wordEditor.index, wordEditor.text, words);
      onChange?.(source.id, result.words, result.text);
      setWordEditor(null);
      return;
    }
    const before = words[wordEditor.boundary - 1], after = words[wordEditor.boundary];
    const time = before?.end ?? Math.max(0, (after?.start ?? 0) - 0.05);
    const sourceEnd = after?.start ?? source.duration;
    const result = insertScriptTextAtWordBoundary(draft, wordEditor.boundary, wordEditor.text, words, time, sourceEnd);
    if (wordEditor.text.trim() && !result.changedWordIndexes.length) { setWordEditError("Không còn khoảng thời gian an toàn để thêm text tại đây."); return; }
    onChange?.(source.id, result.words, result.text);
    setWordEditor(null); setWordEditError(null);
  }
  return <section data-script-source-id={source.id} className="script-source-text" aria-label={`Tài liệu ${source.name}`}>
    <strong>{source.name}</strong>
    {review.some((piece) => piece.kind === "change") ? <div className="script-source-review" aria-label={`So sánh STT và AI · ${source.name}`}>
      {review.map((piece) => piece.kind === "same" ? <span key={piece.id}>{piece.text}</span> : piece.id in choices ? <span className="script-review-choice" key={piece.id}>{choices[piece.id]}</span> : <span key={piece.id} className="script-review-change">
        <button className="is-stt" title="Giữ kết quả Speech to Text" type="button" onClick={() => choose(piece.id, piece.stt)}>{piece.stt || "∅"}</button>
        <button className="is-ai" title="Dùng phương án AI" type="button" onClick={() => choose(piece.id, piece.ai)}>{piece.ai || "∅"}</button>
        <button className="is-manual" aria-label="Sửa thủ công" type="button" onClick={() => setManual({ id: piece.id, text: piece.ai })}>SỬA</button>
        {manual?.id === piece.id ? <input autoFocus aria-label="Sửa thủ công" value={manual.text} onChange={(event) => setManual({ ...manual, text: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); choose(piece.id, manual.text); } if (event.key === "Escape") setManual(null); }} /> : null}
      </span>)}
    </div> : null}
    <div className={`script-source-editor-stack ${tracking ? "is-tracking" : ""}`}>
    <TranscriptTextView followPlayback={followPlayback} ref={textView} label={`Script transcript · ${source.name}`} value={draft} words={source.words ?? []} speakers={speakers} defaultSpeakerId={source.speakerProfileIds?.[0] ?? null} assetId={source.id} activeWordIndex={activeIndex}
      onChange={setDraft} onEditingChange={(active) => {
        if (active) { if (!editing.current) baseline.current = source; editing.current = true; setIsEditing(true); }
        else { editing.current = false; setIsEditing(false); if (draft !== baseline.current.text) commit(draft); }
      }} onRangeChange={(range) => {
        if (!range) return;
        const { start, end } = range;
        const indexes = ranges.filter((word) => end > start ? word.end > start && word.start < end : false).map((word) => word.index);
        onWordSelectionChange?.({ indexes, anchor: indexes.at(-1) ?? null, scope: { kind: "asset", id: source.id, revision: source.updatedAt }, textRanges: indexes.length ? [{ rowId: source.id, start, end }] : [] });
      }} onContextRange={onChange ? (range, x, y) => {
        if (!range) return;
        const { start, end } = range;
        const hit = ranges.find((word) => end > start ? word.end > start && word.start < end : word.start <= start && word.end >= start);
        const target = hit?.index ?? Math.max(0, ranges.find((word) => word.start >= start)?.index ?? source.words.length - 1);
        const indexes = end > start ? ranges.filter((word) => word.end > start && word.start < end).map((word) => word.index) : hit ? [hit.index] : [];
        setWordMenu({ indexes, target, boundary: hit?.index ?? ranges.find((word) => word.start >= start)?.index ?? source.words.length, revision: source.updatedAt ?? "", left: x, top: y });
      } : undefined} />
      {wordEditor ? <form aria-label={wordEditor.kind === "add" ? "Add text" : "Sửa text"} className="script-source-word-editor" style={{ position: "fixed", left: 12, top: 12, zIndex: 1000 }} onSubmit={(event) => { event.preventDefault(); commitWordMenu(); }}>
        {wordEditError ? <span role="alert">{wordEditError}</span> : null}
        <input autoFocus aria-label={wordEditor.kind === "add" ? "Add text" : "Sửa text"} value={wordEditor.text} onChange={(event) => { setWordEditor({ ...wordEditor, text: event.currentTarget.value }); setWordEditError(null); }} onKeyDown={(event) => { if (event.key === "Escape") { setWordEditor(null); setWordEditError(null); } }} />
        <button type="submit">Lưu</button>
      </form> : null}
    </div>
    {wordMenu ? <WordContextMenu x={wordMenu.left} y={wordMenu.top} className="script-source-word-menu" onClose={() => setWordMenu(null)}>
      <button role="menuitem" type="button" onClick={() => { setWordEditor({ kind: "add", index: -1, boundary: wordMenu.boundary, revision: wordMenu.revision, text: "" }); setWordMenu(null); }}>Add text</button>
      <button role="menuitem" type="button" disabled={!wordMenu.indexes.length} onClick={() => { setWordEditor({ kind: "edit", index: wordMenu.target, boundary: wordMenu.boundary, revision: wordMenu.revision, text: source.words?.[wordMenu.target]?.text ?? "" }); setWordMenu(null); }}>Sửa text</button>
      <button role="menuitem" type="button" disabled={!wordMenu.indexes.length} onClick={() => {
        if (wordMenu.revision === (source.updatedAt ?? "")) {
          const result = deleteScriptWords(draft, wordMenu.indexes, source.words ?? []);
          if (result) onChange?.(source.id, result.words, result.text);
        }
        setWordMenu(null);
      }}>Xóa text</button>
      <WordNoteItem module="script" />
    </WordContextMenu> : null}
  </section>;
}
