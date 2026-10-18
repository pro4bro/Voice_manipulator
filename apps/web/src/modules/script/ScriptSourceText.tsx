import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ProjectMediaAsset, StudioWord } from "../../domain/types";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { requestPlaybackSeek, usePlaybackWord } from "../../domain/playback-sync";
import { WordContextMenu, WordNoteItem } from "../../ui/WordContextMenu";
import { deleteScriptWords, insertScriptTextAtWordBoundary, mapScriptWordsToText, reconcileScriptTextEdit, replaceScriptWord } from "./script-text-reconciliation";
import { buildReviewPieces } from "./review-diff";

/** Each source retains its own editable text and clock in the shared Script. */
export function ScriptSourceText({ source, onChange, wordSelection = EMPTY_SELECTION, onWordSelectionChange }: {
  source: ProjectMediaAsset;
  onChange?: (id: string, words: StudioWord[], text: string) => void;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
}) {
  const [draft, setDraft] = useState(source.text);
  const editing = useRef(false);
  const baseline = useRef(source);
  const textarea = useRef<HTMLTextAreaElement>(null);
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
    const element = textarea.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.max(96, element.scrollHeight)}px`; }
  }, [draft]);
  useEffect(() => {
    const element = textarea.current;
    if (!element || document.activeElement === element) return;
    const textRanges = scopedSelection.textRanges?.filter((range) => range.rowId === source.id) ?? [];
    let start: number;
    let end: number;
    if (textRanges.length === 1) {
      start = textRanges[0].start;
      end = textRanges[0].end;
    } else {
      if (textRanges.length > 1 || !scopedSelection.indexes.length) return;
      const selectedRanges = ranges.filter((range) => scopedSelection.indexes.includes(range.index));
      if (selectedRanges.length !== scopedSelection.indexes.length) return;
      const indexes = selectedRanges.map((range) => range.index);
      if (indexes.some((index, position) => position > 0 && index !== indexes[position - 1] + 1)) return;
      start = selectedRanges[0].start;
      end = selectedRanges[selectedRanges.length - 1].end;
    }
    start = Math.max(0, Math.min(draft.length, start));
    end = Math.max(start, Math.min(draft.length, end));
    if (element.selectionStart !== start || element.selectionEnd !== end) element.setSelectionRange(start, end);
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
  function publishTextSelection(element: HTMLTextAreaElement) {
    if (!onWordSelectionChange) return;
    const start = Math.min(element.selectionStart, element.selectionEnd);
    const end = Math.max(element.selectionStart, element.selectionEnd);
    const selectedRanges = ranges.filter((range) => end > start
      ? range.end > start && range.start < end
      : range.start <= start && range.end >= start);
    const indexes = selectedRanges.map((range) => range.index);
    onWordSelectionChange({ indexes, anchor: indexes.at(-1) ?? null,
      scope: { kind: "asset", id: source.id, revision: source.updatedAt },
      textRanges: indexes.length ? [{ rowId: source.id, start, end }] : [] });
  }
  function showWordMenu(event: MouseEvent<HTMLTextAreaElement>) {
    if (!onChange) return;
    event.preventDefault();
    const start = Math.min(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
    const end = Math.max(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
    const hit = ranges.find((range) => (end > start ? range.end > start && range.start < end : range.start <= start && range.end >= start));
    const target = hit?.index ?? Math.max(0, ranges.find((range) => range.start >= start)?.index ?? source.words.length - 1);
    const indexes = end > start ? ranges.filter((range) => range.end > start && range.start < end).map((range) => range.index) : hit ? [hit.index] : [];
    const boundary = hit?.index ?? ranges.find((range) => range.start >= start)?.index ?? source.words.length;
    setWordMenu({ indexes, target, boundary, revision: source.updatedAt ?? "", left: event.clientX, top: event.clientY });
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
  return <section className="script-source-text" aria-label={`Tài liệu ${source.name}`}>
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
    {tracking && activeRange ? <div aria-hidden="true" className="script-source-playback-layer">{draft.slice(0, activeRange.start)}<span className="is-active" data-script-word-index={activeIndex} data-script-source-id={source.id}>{draft.slice(activeRange.start, activeRange.end)}</span>{draft.slice(activeRange.end)}</div> : null}
    <textarea ref={textarea} aria-label={`Script transcript · ${source.name}`} data-script-source-id={source.id} value={draft}
      onFocus={() => { editing.current = true; setIsEditing(true); baseline.current = source; }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onSelect={(event) => publishTextSelection(event.currentTarget)}
      onContextMenu={showWordMenu}
      onBlur={() => { editing.current = false; setIsEditing(false); if (draft !== baseline.current.text) commit(draft); }}
      onClick={(event) => {
        const range = ranges.find((word) => word.start <= event.currentTarget.selectionStart && word.end >= event.currentTarget.selectionStart);
        if (range) requestPlaybackSeek(source.id, source.words[range.index].start);
      }} />
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
