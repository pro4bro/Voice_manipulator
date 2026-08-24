import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePlaybackWord } from "../../domain/playback-sync";

import { DEFAULT_EMOTION_STYLE, emotionVisualStyle } from "../../domain/emotion-style";
import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import type { EmotionLabel, EmotionStylePreferences, EnvironmentNoiseProfile, SpeakerProfile, StudioWord, WorkspacePage } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface ScriptEditorProps {
  value: string; onChange: (value: string) => void; workflow: WorkspacePage; onGenerate?: () => void; onDeferredAction?: (action: string) => void; onRunAiReview?: () => void; words?: StudioWord[]; activeWordIndex?: number; playbackAssetId?: string | null; speakers?: SpeakerProfile[]; environments?: EnvironmentNoiseProfile[]; isLiveTranscript?: boolean; emotionStyle?: EmotionStylePreferences; aiReviewText?: string | null; aiReviewKey?: string | null; aiReviewBusy?: boolean; canRunAiReview?: boolean; onWordsChange?: (words: StudioWord[]) => void;
}
interface ScriptSegment { text: string; wordIndex: number | null; }
type ReviewChoice = "stt" | "ai" | "manual";
type ReviewPiece = { id: string; kind: "same"; text: string } | { id: string; kind: "change"; stt: string; ai: string };
interface ReviewResolution { choice: ReviewChoice; text: string; }
interface ScriptSelectionMenu { x: number; y: number; start: number; end: number; text: string; }
interface ScriptWordRange { index: number; start: number; end: number; }

function scriptSegments(value: string, words: StudioWord[]): ScriptSegment[] {
  if (!value || !words.length) return [{ text: value, wordIndex: null }];
  const lowerValue = value.toLocaleLowerCase("vi"); const segments: ScriptSegment[] = []; let cursor = 0;
  words.forEach((word, wordIndex) => { const needle = word.text.trim(); if (!needle) return; const start = lowerValue.indexOf(needle.toLocaleLowerCase("vi"), cursor); if (start < 0) return; if (start > cursor) segments.push({ text: value.slice(cursor, start), wordIndex: null }); const end = start + needle.length; segments.push({ text: value.slice(start, end), wordIndex }); cursor = end; });
  if (cursor < value.length) segments.push({ text: value.slice(cursor), wordIndex: null }); return segments;
}
function reviewTokens(text: string) { return text.match(/\S+\s*|\s+/gu) ?? []; }
function sameReviewToken(left: string, right: string) { return left.trim().toLocaleLowerCase("vi") === right.trim().toLocaleLowerCase("vi"); }
function nextSharedToken(left: string[], right: string[], fromLeft: number, fromRight: number) {
  for (let distance = 1; distance <= 20; distance += 1) for (let leftOffset = 0; leftOffset <= distance; leftOffset += 1) { const rightOffset = distance - leftOffset; if (fromLeft + leftOffset < left.length && fromRight + rightOffset < right.length && sameReviewToken(left[fromLeft + leftOffset], right[fromRight + rightOffset])) return { leftOffset, rightOffset }; }
  return null;
}
function buildReviewPieces(sttText: string, aiText: string): ReviewPiece[] {
  const stt = reviewTokens(sttText); const ai = reviewTokens(aiText); const pieces: ReviewPiece[] = []; let sttIndex = 0; let aiIndex = 0; let changeIndex = 0;
  while (sttIndex < stt.length || aiIndex < ai.length) {
    if (sttIndex < stt.length && aiIndex < ai.length && sameReviewToken(stt[sttIndex], ai[aiIndex])) { pieces.push({ id: `same-${sttIndex}-${aiIndex}`, kind: "same", text: stt[sttIndex] }); sttIndex += 1; aiIndex += 1; continue; }
    const shared = nextSharedToken(stt, ai, sttIndex, aiIndex); const sttEnd = shared ? sttIndex + shared.leftOffset : stt.length; const aiEnd = shared ? aiIndex + shared.rightOffset : ai.length; const sttChange = stt.slice(sttIndex, sttEnd).join(""); const aiChange = ai.slice(aiIndex, aiEnd).join("");
    if (sttChange || aiChange) pieces.push({ id: `change-${changeIndex++}`, kind: "change", stt: sttChange, ai: aiChange }); sttIndex = sttEnd; aiIndex = aiEnd; if (!shared) break;
  }
  return pieces;
}
function reviewText(pieces: ReviewPiece[], resolutions: Record<string, ReviewResolution>) { return pieces.map((piece) => piece.kind === "same" ? piece.text : resolutions[piece.id]?.text ?? piece.stt).join(""); }

function scriptWordRanges(value: string, words: StudioWord[]): ScriptWordRange[] {
  const lowerValue = value.toLocaleLowerCase("vi");
  let cursor = 0;
  return words.flatMap((word, index) => {
    const needle = word.text.trim();
    if (!needle) return [];
    const start = lowerValue.indexOf(needle.toLocaleLowerCase("vi"), cursor);
    if (start < 0) return [];
    const end = start + needle.length;
    cursor = end;
    return [{ index, start, end }];
  });
}

export function ScriptEditor({ value, onChange, workflow, onGenerate, onDeferredAction, onRunAiReview, words = [], activeWordIndex: explicitActiveWordIndex, playbackAssetId = null, speakers = [], environments = [], isLiveTranscript = false, emotionStyle = DEFAULT_EMOTION_STYLE, aiReviewText = null, aiReviewKey = null, aiReviewBusy = false, canRunAiReview = false, onWordsChange }: ScriptEditorProps) {
  const syncedActiveWordIndex = usePlaybackWord(playbackAssetId);
  const activeWordIndex = explicitActiveWordIndex ?? syncedActiveWordIndex;
  const playbackLayerRef = useRef<HTMLDivElement>(null); const reviewLayerRef = useRef<HTMLDivElement>(null); const textareaRef = useRef<HTMLTextAreaElement>(null); const activePlaybackWordRef = useRef<HTMLSpanElement>(null); const selectionMenuRef = useRef<HTMLDivElement>(null); const [tagMode, setTagMode] = useState(false); const [tagSpeakerId, setTagSpeakerId] = useState(""); const [tagEnvironmentId, setTagEnvironmentId] = useState(""); const [tagEmotion, setTagEmotion] = useState<EmotionLabel>("normal"); const [reviewPieces, setReviewPieces] = useState<ReviewPiece[]>([]); const [reviewResolutions, setReviewResolutions] = useState<Record<string, ReviewResolution>>({}); const [showReview, setShowReview] = useState(false); const [hoveredReviewId, setHoveredReviewId] = useState<string | null>(null); const [manualDraft, setManualDraft] = useState(""); const [selectionMenu, setSelectionMenu] = useState<ScriptSelectionMenu | null>(null); const reviewSignature = `${aiReviewKey ?? ""}:${aiReviewText ?? ""}`;
  useEffect(() => { if (!aiReviewText || !value || aiReviewText.trim() === value.trim()) { setReviewPieces([]); setReviewResolutions({}); setShowReview(false); return; } const nextPieces = buildReviewPieces(value, aiReviewText); if (!nextPieces.some((piece) => piece.kind === "change")) { setReviewPieces([]); setReviewResolutions({}); setShowReview(false); return; } setReviewPieces(nextPieces); setReviewResolutions({}); setShowReview(true); /* A persisted AI revision starts a comparison; normal typing must not reset choices. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewSignature]);
  const resolvedReview = useMemo(() => reviewPieces.flatMap((piece) => { if (piece.kind !== "change") return []; const resolution = reviewResolutions[piece.id]; return resolution ? [{ piece, resolution }] : []; }), [reviewPieces, reviewResolutions]); const reviewActive = showReview && !tagMode && !isLiveTranscript && reviewPieces.length > 0; const hasEmotion = words.some((word) => Boolean(word.emotion && word.emotion !== "normal" && word.emotion !== "mix")); const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0; const duration = Math.round(wordCount / 2.65); const canGenerate = workflow === "voice-manipulator";
  useLayoutEffect(() => {
    if (activeWordIndex < 0 || reviewActive || tagMode) return;
    const activeWord = activePlaybackWordRef.current;
    const playbackLayer = playbackLayerRef.current;
    const textarea = textareaRef.current;
    if (!activeWord || !playbackLayer || !textarea) return;
    const wordTop = activeWord.offsetTop - playbackLayer.offsetTop;
    const wordBottom = wordTop + activeWord.offsetHeight;
    const upperBoundary = playbackLayer.scrollTop + playbackLayer.clientHeight * 0.18;
    const lowerBoundary = playbackLayer.scrollTop + playbackLayer.clientHeight * 0.76;
    if (wordTop >= upperBoundary && wordBottom <= lowerBoundary) return;
    const nextTop = Math.max(0, wordTop - playbackLayer.clientHeight * 0.38);
    playbackLayer.scrollTop = nextTop;
    textarea.scrollTop = nextTop;
  }, [activeWordIndex, reviewActive, tagMode, value]);

  useEffect(() => {
    if (!selectionMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!selectionMenuRef.current?.contains(event.target as Node)) setSelectionMenu(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectionMenu(null); };
    document.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("pointerdown", closeMenu); window.removeEventListener("keydown", closeWithEscape); };
  }, [selectionMenu]);

  function selectedWordIndexes(start: number, end: number) {
    return new Set(scriptWordRanges(value, words).filter((range) => range.end > start && range.start < end).map((range) => range.index));
  }

  function openSelectionMenu(event: React.MouseEvent<HTMLTextAreaElement>) {
    if (!words.length) return;
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const wordIndexes = selectedWordIndexes(start, end);
    if (!wordIndexes.size) return;
    event.preventDefault();
    setSelectionMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 290)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 360)), start, end, text: value.slice(start, end) });
  }

  function applySelectionAnnotation(update: (word: StudioWord) => StudioWord) {
    if (!selectionMenu) return;
    const indexes = selectedWordIndexes(selectionMenu.start, selectionMenu.end);
    if (indexes.size) onWordsChange?.(words.map((word, index) => indexes.has(index) ? update(word) : word));
    setSelectionMenu(null);
  }
  function tagWord(index: number) { onWordsChange?.(words.map((word, wordIndex) => wordIndex === index ? { ...word, speakerId: tagSpeakerId || word.speakerId || null, environmentProfileIds: tagEnvironmentId ? [...new Set([...(word.environmentProfileIds ?? []), tagEnvironmentId])] : word.environmentProfileIds ?? [], emotion: tagEmotion } : word)); }
  function chooseReview(piece: Extract<ReviewPiece, { kind: "change" }>, choice: ReviewChoice, text: string) { const next = { ...reviewResolutions, [piece.id]: { choice, text } }; setReviewResolutions(next); onChange(reviewText(reviewPieces, next)); setHoveredReviewId(null); }
  function startManualEdit(piece: Extract<ReviewPiece, { kind: "change" }>) { const existing = reviewResolutions[piece.id]; setManualDraft(existing?.text ?? piece.ai ?? piece.stt); setHoveredReviewId(piece.id); }
  return <ModuleFrame eyebrow="SCRIPT" className="script-module" action={<div className="script-module__duration"><span>{isLiveTranscript ? "LIVE SPEECH" : "EST. DURATION"}</span><strong>{isLiveTranscript ? "REC" : `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`}</strong></div>}>
    <div className="script-toolbars"><div className={`script-review-strip ${isLiveTranscript ? "is-live" : ""}`}><strong>TRANSCRIPT LAYERS</strong><span className="candidate candidate--realtime">Realtime</span><span className="candidate candidate--stt">STT kỹ</span><span className="candidate candidate--ai">AI fix</span><span className="review-status"><i />{isLiveTranscript ? " Live Speech Transcript" : reviewActive ? " Chọn phương án nhận diện" : " Direct edit ready"}</span></div>
    {resolvedReview.length ? <div className="script-review-history" aria-label="Các phương án đã chọn">{resolvedReview.map(({ piece, resolution }) => <span className={`is-${resolution.choice}`} key={piece.id}><b>{resolution.choice === "stt" ? "STT" : resolution.choice === "ai" ? "AI" : "Sửa tay"}</b><s>{piece.stt.trim() || "∅"}</s><i>→</i><em>{resolution.text.trim() || "∅"}</em></span>)}</div> : null}
    {words.length ? <div className="script-tag-toolbar"><button aria-pressed={tagMode} className={tagMode ? "is-active" : ""} onClick={() => setTagMode((current) => !current)} type="button">TAG WORDS</button><select aria-label="Người nói để gán cho từ" disabled={!tagMode} onChange={(event) => setTagSpeakerId(event.target.value)} value={tagSpeakerId}><option value="">Giữ speaker hiện tại</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select><select aria-label="Môi trường để gán cho từ" disabled={!tagMode} onChange={(event) => setTagEnvironmentId(event.target.value)} value={tagEnvironmentId}><option value="">Giữ environment hiện tại</option>{environments.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><select aria-label="Cảm xúc để gán cho từ" disabled={!tagMode} onChange={(event) => setTagEmotion(event.target.value as EmotionLabel)} value={tagEmotion}>{EMOTION_OPTIONS.filter((option) => option.id !== "mix").map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><span>Chọn từ trên transcript để gán</span></div> : null}</div>
    <div className={`script-editor-stack ${activeWordIndex >= 0 && !reviewActive ? "is-tracking" : ""} ${tagMode ? "is-tagging" : ""} ${isLiveTranscript ? "is-live" : ""} ${reviewActive ? "is-reviewing" : ""} ${hasEmotion ? "has-emotion" : ""}`}>
      {tagMode ? <div aria-label="Gán profile theo từ" className="script-tag-editor">{words.map((word, index) => { const speaker = speakers.find((profile) => profile.id === word.speakerId); const previousSpeakerId = index ? words[index - 1]?.speakerId : null; const wordStyle = { ...emotionVisualStyle(word.emotion, emotionStyle), ...(speaker ? { borderBottomColor: speaker.color } : {}) }; return <Fragment key={`${word.start}-${index}`}>{speaker && speaker.id !== previousSpeakerId ? <span className="script-speaker-cue" style={{ borderColor: speaker.color }}><i style={{ background: speaker.color }} />{speaker.name}</span> : null}<button aria-label={`Gán nhãn cho từ ${word.text}`} className={index === activeWordIndex ? "is-active" : ""} data-emotion={word.emotion ?? "normal"} onClick={() => tagWord(index)} style={wordStyle} title={`${speaker?.name ?? "Chưa gán speaker"} · ${emotionLabel(word.emotion ?? "normal")} · ${word.start.toFixed(2)}s`} type="button">{word.text}<small>{emotionLabel(word.emotion ?? "normal")}</small></button></Fragment>; })}</div> : <><>{reviewActive ? <div aria-label="So sánh STT và AI" className="script-review-layer" ref={reviewLayerRef}>{reviewPieces.map((piece) => { if (piece.kind === "same") return <span key={piece.id}>{piece.text}</span>; const resolution = reviewResolutions[piece.id]; if (resolution) return <span className={`script-review-choice is-${resolution.choice}`} key={piece.id}>{resolution.text}</span>; return <span className="script-review-change" key={piece.id} onMouseEnter={() => startManualEdit(piece)} onMouseLeave={() => setHoveredReviewId((id) => id === piece.id ? null : id)}><button className="is-stt" onClick={() => chooseReview(piece, "stt", piece.stt)} title="Giữ kết quả Speech to Text" type="button">{piece.stt || "∅"}</button><button className="is-ai" onClick={() => chooseReview(piece, "ai", piece.ai)} title="Dùng phương án AI" type="button">{piece.ai || "∅"}</button>{hoveredReviewId === piece.id ? <input aria-label="Sửa thủ công" autoFocus onChange={(event) => setManualDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); chooseReview(piece, "manual", manualDraft); } if (event.key === "Escape") setHoveredReviewId(null); }} placeholder="Sửa tay… ↵" value={manualDraft} /> : null}</span>; })}</div> : <div aria-hidden="true" className="script-playback-layer" ref={playbackLayerRef}>{scriptSegments(value, words).map((segment, index) => { const emotion = segment.wordIndex === null ? "normal" : words[segment.wordIndex]?.emotion; return <span className={segment.wordIndex === activeWordIndex ? "is-active" : ""} key={`${segment.wordIndex ?? "text"}-${index}`} ref={segment.wordIndex === activeWordIndex ? activePlaybackWordRef : undefined} style={emotionVisualStyle(emotion, emotionStyle)}>{segment.text}</span>; })}</div>}</><textarea aria-label="Script transcript" className="script-editor" onContextMenu={openSelectionMenu} ref={textareaRef} maxLength={12000} onChange={(event) => { if (reviewActive) { setShowReview(false); setReviewResolutions({}); } onChange(event.target.value); }} onScroll={(event) => { if (playbackLayerRef.current) { playbackLayerRef.current.scrollTop = event.currentTarget.scrollTop; playbackLayerRef.current.scrollLeft = event.currentTarget.scrollLeft; } if (reviewLayerRef.current) { reviewLayerRef.current.scrollTop = event.currentTarget.scrollTop; reviewLayerRef.current.scrollLeft = event.currentTarget.scrollLeft; } }} placeholder="Transcript realtime, STT kỹ và AI fix sẽ cùng xuất hiện ở đây..." readOnly={isLiveTranscript} spellCheck value={value} /></>}</div>
    {selectionMenu ? <div aria-label="Gán nhãn đoạn Script" className="script-selection-menu" ref={selectionMenuRef} role="menu" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
      <div className="script-selection-menu__heading"><b>ĐOẠN ĐÃ CHỌN</b><span>{selectionMenu.text}</span></div>
      <section><strong>Cảm xúc</strong><div>{EMOTION_OPTIONS.filter((option) => option.id !== "mix").map((option) => <button key={option.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, emotion: option.id }))} type="button">{option.label}</button>)}</div></section>
      {speakers.length ? <section><strong>Speaker</strong><div>{speakers.map((speaker) => <button key={speaker.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, speakerId: speaker.id }))} style={{ borderLeftColor: speaker.color }} type="button">{speaker.name}</button>)}</div></section> : null}
      {environments.length ? <section><strong>Environment</strong><div>{environments.map((profile) => <button key={profile.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, environmentProfileIds: [...new Set([...(word.environmentProfileIds ?? []), profile.id])] }))} type="button">{profile.name}</button>)}</div></section> : null}
      <button className="script-selection-menu__clear" onClick={() => applySelectionAnnotation((word) => ({ ...word, speakerId: null, environmentProfileIds: [], emotion: "normal" }))} type="button">Xóa nhãn đoạn chọn</button>
    </div> : null}    <div className="script-module__footer"><div className="script-stats"><span><b>{wordCount}</b> từ</span><span><b>{value.length.toLocaleString("vi-VN")}</b> / 12.000</span></div><div className="script-actions">{workflow === "speech-to-text" ? <><button className="button button--quiet" disabled={isLiveTranscript} onClick={() => onDeferredAction?.("STT kỹ")} type="button">Nhận diện kỹ</button>{canRunAiReview ? <button className="button button--lime" disabled={isLiveTranscript || aiReviewBusy} onClick={onRunAiReview} type="button"><Icon name="spark" />{aiReviewBusy ? "AI đang check…" : "AI fix"}</button> : null}</> : null}{workflow === "voice-training" ? <button className="button button--lime" onClick={() => onDeferredAction?.("Dataset review")} type="button"><Icon name="spark" />Duyệt cho dataset</button> : null}{canGenerate ? <button aria-label="Tạo voice" className="button button--accent" onClick={onGenerate} type="button"><span><b>Tạo voice</b><small>OmniVoice · 32 steps</small></span><Icon name="arrow" /></button> : null}</div></div>
  </ModuleFrame>;
}