import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMediaAsset, StudioWord } from "../../domain/types";
import { requestPlaybackSeek, usePlaybackWord } from "../../domain/playback-sync";
import { mapScriptWordsToText, reconcileScriptTextEdit } from "./script-text-reconciliation";
import { buildReviewPieces } from "./review-diff";

/** Each source retains its own editable text and clock in the shared Script. */
export function ScriptSourceText({ source, onChange }: { source: ProjectMediaAsset; onChange?: (id: string, words: StudioWord[], text: string) => void }) {
  const [draft, setDraft] = useState(source.text);
  const editing = useRef(false);
  const baseline = useRef(source);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const activeIndex = usePlaybackWord(source.id);
  const [isEditing, setIsEditing] = useState(false);
  const ranges = useMemo(() => mapScriptWordsToText(draft, source.words ?? []), [draft, source.words]);
  const activeRange = ranges.find((range) => range.index === activeIndex);
  const tracking = Boolean(activeRange && !isEditing && draft === source.text);
  const candidate = [...(source.revisions ?? [])].reverse().find((revision) => revision.source === "ai");
  const [reviewBase, setReviewBase] = useState(source.text);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => { setReviewBase(source.text); setChoices({}); setManual(null); }, [candidate?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const review = useMemo(() => candidate?.text && candidate.text !== reviewBase ? buildReviewPieces(reviewBase, candidate.text) : [], [candidate?.text, reviewBase]);
  useEffect(() => { if (!editing.current) setDraft(source.text); }, [source.text]);
  useEffect(() => {
    const element = textarea.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.max(96, element.scrollHeight)}px`; }
  }, [draft]);
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
      onBlur={() => { editing.current = false; setIsEditing(false); if (draft !== baseline.current.text) commit(draft); }}
      onClick={(event) => {
        const range = ranges.find((word) => word.start <= event.currentTarget.selectionStart && word.end >= event.currentTarget.selectionStart);
        if (range) requestPlaybackSeek(source.id, source.words[range.index].start);
      }} />
    </div>
  </section>;
}
