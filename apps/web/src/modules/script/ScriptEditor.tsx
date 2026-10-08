import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from "react";
import { usePlaybackWord } from "../../domain/playback-sync";

import { DEFAULT_EMOTION_STYLE, emotionVisualStyle } from "../../domain/emotion-style";
import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import type { EmotionLabel, EmotionStylePreferences, EnvironmentNoiseProfile, SpeakerProfile, StudioWord, WordTimingQuality, WorkspacePage } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { buildReviewPieces, type ReviewPiece } from "./review-diff";
import { Teleprompter } from "./Teleprompter";
import type { ReadingPlanCard } from "../../domain/reading-plan";
import { ScriptTable, assignProfileToWords, keepWordInView, moveWordsToRow } from "./script-table";
import { mapScriptWordsToText, reconcileScriptTextEdit, replaceScriptTextRange, replaceScriptWord } from "./script-text-reconciliation";

export type ScriptFormatKind = "font-size" | "bold" | "italic" | "underline";
export interface ScriptFormatIntent { kind: ScriptFormatKind; value: string | boolean; selection: { start: number; end: number; text: string }; }
interface ScriptEditorProps {
  value: string; onChange: (value: string) => void; workflow: WorkspacePage; onGenerate?: () => void; onDeferredAction?: (action: string) => void; onRunAiReview?: () => void; words?: StudioWord[]; wordTimingQuality?: WordTimingQuality; wordTimingNote?: string | null; activeWordIndex?: number; playbackAssetId?: string | null; footageName?: string | null; speakers?: SpeakerProfile[]; environments?: EnvironmentNoiseProfile[]; isLiveTranscript?: boolean; emotionStyle?: EmotionStylePreferences; liveTranscriptText?: string | null; aiReviewText?: string | null; aiReviewKey?: string | null; aiReviewBusy?: boolean; canRunAiReview?: boolean; readingCard?: ReadingPlanCard | null; readingCardNumber?: number; readingCardTotal?: number; readingHeard?: string[]; readingSpeaking?: boolean; readingFollowerReady?: boolean; onWordsChange?: (words: StudioWord[], text?: string) => void; onFormatIntent?: (intent: ScriptFormatIntent) => void; wordSelection?: WordSelection; onWordSelectionChange?: (selection: WordSelection) => void;
  obsFeed?: ReactNode;
  feedMode?: "obs" | "channels";
  /** The Speaker Profile this whole take belongs to, when one is assigned. */
  speakerProfileId?: string | null;
  /** Assign the whole take to a profile. Only offered when a take is open. */
  onSpeakerProfileChange?: (speakerProfileId: string | null) => void;
}
interface ScriptSegment { text: string; wordIndex: number | null; }
type ReviewChoice = "stt" | "ai" | "manual";
interface ReviewResolution { choice: ReviewChoice; text: string; }
interface ScriptSelectionMenu { x: number; y: number; start: number; end: number; text: string; }
interface ScriptWordRange { index: number; start: number; end: number; }
interface EstimatedWordHover { index: number; left: number; top: number; }
const NATIVE_PLAYBACK_TEXT_LIMIT = 3800;
function isScriptWordCharacter(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function wordCursor(value: string, position: number, direction: "backward" | "forward") {
  let cursor = Math.max(0, Math.min(value.length, position));
  if (direction === "forward") {
    while (cursor < value.length && isScriptWordCharacter(value[cursor])) cursor += 1;
    while (cursor < value.length && !isScriptWordCharacter(value[cursor])) cursor += 1;
    return cursor;
  }
  while (cursor > 0 && !isScriptWordCharacter(value[cursor - 1])) cursor -= 1;
  while (cursor > 0 && isScriptWordCharacter(value[cursor - 1])) cursor -= 1;
  return cursor;
}

export function scriptWordRanges(value: string, words: StudioWord[]): ScriptWordRange[] {
  return mapScriptWordsToText(value, words);
}

function removeScriptWordRanges(value: string, indexes: number[], rangesByIndex: Map<number, ScriptWordRange>): string | null {
  const ranges = indexes.map((index) => rangesByIndex.get(index));
  if (ranges.some((range) => !range)) return null;
  const spans = ranges.filter((range): range is ScriptWordRange => Boolean(range)).map((range) => {
    let { start, end } = range;
    while (start > 0 && /[“"'‘([{]/u.test(value[start - 1])) start -= 1;
    while (end < value.length && /[.,!?;:…"'”’)}\]]/u.test(value[end])) end += 1;
    if (end < value.length && /\s/u.test(value[end])) end += 1;
    else while (start > 0 && /\s/u.test(value[start - 1])) start -= 1;
    return { start, end };
  }).sort((left, right) => left.start - right.start);
  const merged = spans.reduce<Array<{ start: number; end: number }>>((result, span) => {
    const previous = result[result.length - 1];
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else result.push({ ...span });
    return result;
  }, []);
  let next = value;
  for (const span of merged.reverse()) next = next.slice(0, span.start) + next.slice(span.end);
  return next.trim();
}

function scriptSegments(value: string, ranges: ScriptWordRange[]): ScriptSegment[] {
  if (!value || !ranges.length) return [{ text: value, wordIndex: null }];
  const segments: ScriptSegment[] = []; let cursor = 0;
  ranges.forEach((range) => { if (range.start < cursor) return; if (range.start > cursor) segments.push({ text: value.slice(cursor, range.start), wordIndex: null }); segments.push({ text: value.slice(range.start, range.end), wordIndex: range.index }); cursor = range.end; });
  if (cursor < value.length) segments.push({ text: value.slice(cursor), wordIndex: null }); return segments;
}
function reviewText(pieces: ReviewPiece[], resolutions: Record<string, ReviewResolution>) { return pieces.map((piece) => piece.kind === "same" ? piece.text : resolutions[piece.id]?.text ?? piece.stt).join(""); }

export function ScriptEditor({ value, onChange, workflow, onGenerate, onDeferredAction, onRunAiReview, words = [], wordTimingQuality = "unverified", wordTimingNote = null, activeWordIndex: explicitActiveWordIndex, playbackAssetId = null, footageName = null, speakers = [], environments = [], isLiveTranscript = false, emotionStyle = DEFAULT_EMOTION_STYLE, liveTranscriptText = null, aiReviewText = null, aiReviewKey = null, aiReviewBusy = false, canRunAiReview = false, readingCard = null, readingCardNumber = 0, readingCardTotal = 0, readingHeard, readingSpeaking = false, readingFollowerReady = false, onWordsChange, onFormatIntent, wordSelection = EMPTY_SELECTION, onWordSelectionChange, speakerProfileId = null, onSpeakerProfileChange, obsFeed, feedMode = "obs" }: ScriptEditorProps) {
  const syncedActiveWordIndex = usePlaybackWord(playbackAssetId);
  const activeWordIndex = explicitActiveWordIndex ?? syncedActiveWordIndex;
  const playbackLayerRef = useRef<HTMLDivElement>(null); const reviewLayerRef = useRef<HTMLDivElement>(null); const textareaRef = useRef<HTMLTextAreaElement>(null); const activePlaybackWordRef = useRef<HTMLSpanElement>(null); const selectionMenuRef = useRef<HTMLDivElement>(null); const scriptScrollbarDragRef = useRef(false); const estimatedHoverTimerRef = useRef<number | null>(null); const pendingEstimatedHoverRef = useRef<EstimatedWordHover | null>(null); const [estimatedWordHover, setEstimatedWordHover] = useState<EstimatedWordHover | null>(null); const [tagMode, setTagMode] = useState(false); const [tagSpeakerId, setTagSpeakerId] = useState(""); const [tagEnvironmentId, setTagEnvironmentId] = useState(""); const [tagEmotion, setTagEmotion] = useState<EmotionLabel>("normal"); const [reviewPieces, setReviewPieces] = useState<ReviewPiece[]>([]); const [reviewResolutions, setReviewResolutions] = useState<Record<string, ReviewResolution>>({}); const [showReview, setShowReview] = useState(false); const [hoveredReviewId, setHoveredReviewId] = useState<string | null>(null); const [manualDraft, setManualDraft] = useState(""); const [selectionMenu, setSelectionMenu] = useState<ScriptSelectionMenu | null>(null); const reviewSignature = `${aiReviewKey ?? ""}:${aiReviewText ?? ""}`;
  const textEditBaselineRef = useRef<{ text: string; words: StudioWord[] } | null>(null);
  const pendingTextRef = useRef(value);
  const [srtExportOpen, setSrtExportOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [scriptFontScale, setScriptFontScale] = useState(100);
  const [scriptBold, setScriptBold] = useState(false);
  const [scriptItalic, setScriptItalic] = useState(false);
  const [scriptUnderline, setScriptUnderline] = useState(false);
  const [scriptView, setScriptView] = useState<"table" | "edit">("table");
  const [scriptScroll, setScriptScroll] = useState({ top: 0, clientHeight: 0, scrollHeight: 0 });
  const [dismissedLiveComparisonSignature, setDismissedLiveComparisonSignature] = useState<string | null>(null);
  const wordRanges = useMemo(
    () => scriptView !== "table" || findOpen || showReview || liveTranscriptText || aiReviewText ? scriptWordRanges(value, words) : [],
    [value, words, scriptView, findOpen, showReview, liveTranscriptText, aiReviewText],
  );
  const wordRangesByIndex = useMemo(() => new Map(wordRanges.map((range) => [range.index, range])), [wordRanges]);
  // Built inline in JSX before, so thousands of spans were re-created whenever
  // activeWordIndex advanced during playback.
  const playbackSegments = useMemo(() => scriptSegments(value, wordRanges), [value, wordRanges]);
  const useNativePlayback = value.length > 42000 || wordRanges.length > NATIVE_PLAYBACK_TEXT_LIMIT;
  const liveComparisonSignature = [liveTranscriptText ?? "", value].join("\u0000");
  const liveSttPieces = useMemo(() => !liveTranscriptText || !value || liveTranscriptText.trim() === value.trim() ? [] : buildReviewPieces(liveTranscriptText, value), [liveTranscriptText, value]);
  useEffect(() => { if (!aiReviewText || !value || aiReviewText.trim() === value.trim()) { setReviewPieces([]); setReviewResolutions({}); setShowReview(false); return; } const nextPieces = buildReviewPieces(value, aiReviewText); if (!nextPieces.some((piece) => piece.kind === "change")) { setReviewPieces([]); setReviewResolutions({}); setShowReview(false); return; } setReviewPieces(nextPieces); setReviewResolutions({}); setShowReview(true); setDismissedLiveComparisonSignature(liveComparisonSignature); /* A persisted AI revision starts a comparison; normal typing must not reset choices. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewSignature]);
  const resolvedReview = useMemo(() => reviewPieces.flatMap((piece) => { if (piece.kind !== "change") return []; const resolution = reviewResolutions[piece.id]; return resolution ? [{ piece, resolution }] : []; }), [reviewPieces, reviewResolutions]); const reviewActive = showReview && !tagMode && !isLiveTranscript && reviewPieces.length > 0; const liveComparisonActive = !reviewActive && !tagMode && !isLiveTranscript && dismissedLiveComparisonSignature !== liveComparisonSignature && liveSttPieces.some((piece) => piece.kind === "change"); const comparisonActive = reviewActive || liveComparisonActive; const hasEmotion = words.some((word) => Boolean(word.emotion && word.emotion !== "normal" && word.emotion !== "mix")); const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0; const duration = Math.round(wordCount / 2.65); const canGenerate = workflow === "voice-manipulator"; const tableVisible = scriptView === "table" && words.length > 0 && !comparisonActive && !isLiveTranscript; const scriptScrollThumb = (() => { const visible = scriptScroll.clientHeight; const total = Math.max(visible, scriptScroll.scrollHeight); const height = total > 0 ? Math.min(100, (visible / total) * 100) : 100; const maxScroll = Math.max(0, total - visible); const top = maxScroll > 0 ? Math.max(0, Math.min(100 - height, (scriptScroll.top / maxScroll) * (100 - height))) : 0; return { top, height, enabled: maxScroll > 0.5 }; })();
  useLayoutEffect(() => {
    if (activeWordIndex < 0 || reviewActive || tagMode) return;
    const activeWord = activePlaybackWordRef.current;
    const playbackLayer = playbackLayerRef.current;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (useNativePlayback) {
      const range = wordRangesByIndex.get(activeWordIndex);
      if (!range) return;
      if (document.activeElement !== textarea) textarea.focus();
      textarea.setSelectionRange(range.start, range.end);
      return;
    }
    if (!activeWord || !playbackLayer) return;
    const nextTop = keepWordInView(playbackLayer, activeWord);
    // The textarea sits on top of the layer and must follow it exactly.
    if (nextTop !== null) textarea.scrollTop = nextTop;
  }, [activeWordIndex, reviewActive, tagMode, useNativePlayback, value, wordRangesByIndex]);

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

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const update = () => updateScriptScroll(textarea);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [scriptBold, scriptFontScale, scriptItalic, scriptUnderline, value]);

  function selectedWordIndexes(start: number, end: number) {
    return new Set(wordRanges.filter((range) => range.end > start && range.start < end).map((range) => range.index));
  }

  function openSelectionMenu(event: React.MouseEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    event.preventDefault();
    setSelectionMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 290)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 360)), start, end, text: value.slice(start, end) });
  }

  async function copySelectedScriptText() {
    if (!selectionMenu) return;
    try { await navigator.clipboard.writeText(selectionMenu.text); }
    catch {
      focusRange(selectionMenu.start, selectionMenu.end);
      document.execCommand("copy");
    }
    setSelectionMenu(null);
  }

  async function pasteOverScriptSelection() {
    if (!selectionMenu) return;
    try {
      const pasted = await navigator.clipboard.readText();
      const result = replaceScriptTextRange(value, selectionMenu, pasted, words);
      commitScriptTextEdit(result.text);
      setSelectionMenu(null);
      requestAnimationFrame(() => focusRange(selectionMenu.start, selectionMenu.start + pasted.length));
    } catch {
      setSelectionMenu(null);
      focusRange(selectionMenu.start, selectionMenu.end);
    }
  }

  function applySelectionAnnotation(update: (word: StudioWord) => StudioWord) {
    if (!selectionMenu) return;
    const indexes = selectedWordIndexes(selectionMenu.start, selectionMenu.end);
    if (indexes.size) onWordsChange?.(words.map((word, index) => indexes.has(index) ? update(word) : word));
    setSelectionMenu(null);
  }

  function updateScriptScroll(textarea: HTMLTextAreaElement) {
    setScriptScroll((current) => current.top === textarea.scrollTop && current.clientHeight === textarea.clientHeight && current.scrollHeight === textarea.scrollHeight ? current : { top: textarea.scrollTop, clientHeight: textarea.clientHeight, scrollHeight: textarea.scrollHeight });
  }

  function syncScriptEditorScroll(event: UIEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    if (playbackLayerRef.current) { playbackLayerRef.current.scrollTop = textarea.scrollTop; playbackLayerRef.current.scrollLeft = textarea.scrollLeft; }
    if (reviewLayerRef.current) { reviewLayerRef.current.scrollTop = textarea.scrollTop; reviewLayerRef.current.scrollLeft = textarea.scrollLeft; }
    updateScriptScroll(textarea);
  }
  function handleScriptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!event.ctrlKey || event.altKey || event.metaKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const editor = event.currentTarget;
    const backward = event.key === "ArrowLeft";
    if (event.shiftKey) {
      if (backward) editor.setSelectionRange(wordCursor(editor.value, editor.selectionStart, "backward"), editor.selectionEnd, "backward");
      else editor.setSelectionRange(editor.selectionStart, wordCursor(editor.value, editor.selectionEnd, "forward"), "forward");
      return;
    }
    const position = wordCursor(editor.value, backward ? editor.selectionStart : editor.selectionEnd, backward ? "backward" : "forward");
    editor.setSelectionRange(position, position);
  }

  function seekScriptScrollbar(clientY: number) {
    const textarea = textareaRef.current;
    const track = textarea?.parentElement?.querySelector<HTMLElement>(".script-scrollbar");
    if (!textarea || !track || textarea.scrollHeight <= textarea.clientHeight) return;
    const bounds = track.getBoundingClientRect();
    const visibleRatio = textarea.clientHeight / textarea.scrollHeight;
    const pointerRatio = Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(bounds.height, 1)));
    const travel = Math.max(0.0001, 1 - visibleRatio);
    const targetRatio = Math.max(0, Math.min(1, (pointerRatio - visibleRatio / 2) / travel));
    textarea.scrollTop = targetRatio * (textarea.scrollHeight - textarea.clientHeight);
    syncScriptEditorScroll({ currentTarget: textarea } as UIEvent<HTMLTextAreaElement>);
  }

  function beginScriptScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scriptScrollThumb.enabled) return;
    event.preventDefault();
    scriptScrollbarDragRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekScriptScrollbar(event.clientY);
  }

  function moveScriptScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scriptScrollbarDragRef.current) return;
    event.preventDefault();
    seekScriptScrollbar(event.clientY);
  }

  function endScriptScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scriptScrollbarDragRef.current) return;
    event.preventDefault();
    seekScriptScrollbar(event.clientY);
    scriptScrollbarDragRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  function tagWord(index: number) { onWordsChange?.(words.map((word, wordIndex) => wordIndex === index ? { ...word, speakerId: tagSpeakerId || word.speakerId || null, environmentProfileIds: tagEnvironmentId ? [...new Set([...(word.environmentProfileIds ?? []), tagEnvironmentId])] : word.environmentProfileIds ?? [], emotion: tagEmotion } : word)); }
  function chooseReview(piece: Extract<ReviewPiece, { kind: "change" }>, choice: ReviewChoice, text: string) { const next = { ...reviewResolutions, [piece.id]: { choice, text } }; setReviewResolutions(next); onChange(reviewText(reviewPieces, next)); setHoveredReviewId(null); }
  function startManualEdit(piece: Extract<ReviewPiece, { kind: "change" }>) { const existing = reviewResolutions[piece.id]; setManualDraft(existing?.text ?? piece.ai ?? piece.stt); setHoveredReviewId(piece.id); }
  function selectionSnapshot() {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? 0; const end = textarea?.selectionEnd ?? start;
    return { start, end, text: value.slice(start, end) };
  }
  function emitFormatIntent(kind: ScriptFormatKind, formatValue: string | boolean) {
    onFormatIntent?.({ kind, value: formatValue, selection: selectionSnapshot() });
  }
  function focusRange(start: number, end: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);
  }

  function clearEstimatedWordHover() {
    if (estimatedHoverTimerRef.current !== null) window.clearTimeout(estimatedHoverTimerRef.current);
    estimatedHoverTimerRef.current = null;
    pendingEstimatedHoverRef.current = null;
    setEstimatedWordHover(null);
  }

  function trackEstimatedWordHover(event: ReactPointerEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const layer = playbackLayerRef.current;
    if (!layer || useNativePlayback || comparisonActive || tagMode) { clearEstimatedWordHover(); return; }
    let nextIndex: number | null = null;
    for (const span of layer.querySelectorAll<HTMLElement>('[data-time-estimated="true"][data-script-word-index]')) {
      for (const rect of span.getClientRects()) {
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
          nextIndex = Number(span.dataset.scriptWordIndex);
          break;
        }
      }
      if (nextIndex !== null) break;
    }
    if (nextIndex === null) { clearEstimatedWordHover(); return; }
    const position = { index: nextIndex, left: event.clientX + 12, top: event.clientY + 14 };
    if (pendingEstimatedHoverRef.current?.index === nextIndex) {
      pendingEstimatedHoverRef.current = position;
      return;
    }
    clearEstimatedWordHover();
    pendingEstimatedHoverRef.current = position;
    estimatedHoverTimerRef.current = window.setTimeout(() => {
      estimatedHoverTimerRef.current = null;
      if (pendingEstimatedHoverRef.current?.index === nextIndex) setEstimatedWordHover(pendingEstimatedHoverRef.current);
    }, 2000);
  }

  useEffect(() => () => {
    if (estimatedHoverTimerRef.current !== null) window.clearTimeout(estimatedHoverTimerRef.current);
  }, []);
  function commitScriptTextEdit(nextText: string, baseText = value, baseWords = words) {
    pendingTextRef.current = nextText;
    if (baseWords.length && onWordsChange) {
      const reconciled = reconcileScriptTextEdit(baseText, nextText, baseWords);
      onWordsChange(reconciled.words, nextText);
    } else onChange(nextText);
  }
  function finishNativeTextEdit() {
    const baseline = textEditBaselineRef.current;
    const nextText = pendingTextRef.current;
    textEditBaselineRef.current = null;
    if (!baseline || baseline.text === nextText || !baseline.words.length || !onWordsChange) return;
    const reconciled = reconcileScriptTextEdit(baseline.text, nextText, baseline.words);
    onWordsChange(reconciled.words, nextText);
  }
  useEffect(() => {
    if (!textEditBaselineRef.current) pendingTextRef.current = value;
  }, [value]);
  function comparable(text: string) { return findCaseSensitive ? text : text.toLocaleLowerCase("vi"); }
  function findNext(reverse = false) {
    if (!findQuery) return;
    const query = comparable(findQuery); const source = comparable(value); const textarea = textareaRef.current;
    const pivot = reverse ? textarea?.selectionStart ?? value.length : textarea?.selectionEnd ?? 0;
    let index = reverse ? source.lastIndexOf(query, Math.max(0, pivot - 1)) : source.indexOf(query, pivot);
    if (index < 0) index = reverse ? source.lastIndexOf(query) : source.indexOf(query);
    if (index >= 0) focusRange(index, index + findQuery.length);
  }
  function replaceCurrent() {
    const selection = selectionSnapshot();
    if (selection.end > selection.start && comparable(selection.text) === comparable(findQuery)) {
      const next = value.slice(0, selection.start) + replaceQuery + value.slice(selection.end);
      commitScriptTextEdit(next);
      requestAnimationFrame(() => focusRange(selection.start, selection.start + replaceQuery.length));
      return;
    }
    findNext();
  }
  function replaceAll() {
    if (!findQuery) return;
    const escaped = findQuery.replaceAll("\\", "\\\\").replaceAll(".", "\\.").replaceAll("?", "\\?").replaceAll("*", "\\*").replaceAll("+", "\\+").replaceAll("^", "\\^").replaceAll("$", "\\$").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("|", "\\|");
    const expression = new RegExp(escaped, findCaseSensitive ? "gu" : "giu");
    commitScriptTextEdit(value.replace(expression, () => replaceQuery));
  }
  function autoFormatFromPauses() {
    const rangeByIndex = new Map(wordRanges.map((range) => [range.index, range]));
    const edits: { start: number; end: number; text: string }[] = [];
    for (let index = 0; index < words.length - 1; index += 1) {
      const current = rangeByIndex.get(index); const next = rangeByIndex.get(index + 1);
      if (!current || !next || next.start < current.end) continue;
      const pause = words[index + 1].start - words[index].end;
      if (pause < 0.28 || value.slice(current.end, next.start).trim()) continue;
      const tail = value.slice(0, current.end).trimEnd();
      const punctuation = /[.!?,;:…]$/u.test(tail) ? "" : pause >= 1.05 ? "." : pause >= 0.56 ? "," : "";
      const lineBreak = pause >= 1.05 ? "\n\n" : pause >= 0.36 ? "\n" : " ";
      edits.push({ start: current.end, end: next.start, text: punctuation + lineBreak });
    }
    if (!edits.length) return;
    const nextValue = edits.reverse().reduce((draft, edit) => draft.slice(0, edit.start) + edit.text + draft.slice(edit.end), value);
    commitScriptTextEdit(nextValue);
  }
  function clearScript() {
    if (!value && !words.length) return;
    const clearsTimedWords = workflow !== "voice-manipulator" && words.length > 0 && Boolean(onWordsChange);
    const warning = clearsTimedWords
      ? "Xóa toàn bộ nội dung Script? Transcript, word timing và các nhãn gắn theo từ của footage này sẽ bị xóa."
      : "Xóa toàn bộ nội dung Script? Phần text đang soạn sẽ bị làm trống.";
    if (!window.confirm(warning)) return;
    setSelectionMenu(null);
    setShowReview(false);
    setReviewPieces([]);
    setReviewResolutions({});
    setScriptView("edit");
    onWordSelectionChange?.(EMPTY_SELECTION);
    // Manipulator text is an independent prompt; its reference take may still
    // expose timed words, but clearing the prompt must not erase that footage.
    if (clearsTimedWords && onWordsChange) onWordsChange([], "");
    else onChange("");
  }

  function deleteScriptWords(indexes: number[]): boolean {
    if (!onWordsChange) return false;
    const ranges = wordRangesByIndex.size ? wordRangesByIndex : new Map(scriptWordRanges(value, words).map((range) => [range.index, range]));
    const nextText = removeScriptWordRanges(value, indexes, ranges);
    if (nextText === null) return false;
    const removed = new Set(indexes);
    onWordsChange(words.filter((_, index) => !removed.has(index)), nextText);
    return true;
  }
  function renderComparisonLayer() {
    if (reviewActive) return <div aria-label="So sánh STT và AI" className="script-review-layer" ref={reviewLayerRef}>
      {reviewPieces.map((piece) => {
        if (piece.kind === "same") return <span key={piece.id}>{piece.text}</span>;
        const resolution = reviewResolutions[piece.id];
        if (resolution) return <span className={"script-review-choice is-" + resolution.choice} key={piece.id}>{resolution.text}</span>;
        return <span className="script-review-change" key={piece.id}>
          <button className="is-stt" onClick={() => chooseReview(piece, "stt", piece.stt)} title="Giữ kết quả Speech to Text" type="button">{piece.stt || "∅"}</button>
          <button className="is-ai" onClick={() => chooseReview(piece, "ai", piece.ai)} title="Dùng phương án AI" type="button">{piece.ai || "∅"}</button>
          <button aria-label="Sửa thủ công" className="is-manual" onClick={() => startManualEdit(piece)} type="button">SỬA</button>
          {hoveredReviewId === piece.id ? <input aria-label="Sửa thủ công" autoFocus onChange={(event) => setManualDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); chooseReview(piece, "manual", manualDraft); } if (event.key === "Escape") setHoveredReviewId(null); }} placeholder="Sửa tay… ↵" value={manualDraft} /> : null}
        </span>;
      })}
    </div>;
    return <div aria-label="So sánh Live Transcript và STT" className="script-review-layer is-live-stt" ref={reviewLayerRef}>
      {liveSttPieces.map((piece) => piece.kind === "same" ? <span key={piece.id}>{piece.text}</span> : <span className="script-live-stt-change" key={piece.id}><s>{piece.stt || "∅"}</s><b>{piece.ai || "∅"}</b></span>)}
    </div>;
  }
  if (readingCard) {
    // A live reading session owns the centre column outright. Nothing else in
    // Script is safe to touch mid-take, and the reader needs the whole width.
    return <ModuleFrame eyebrow="SCRIPT · GUIDED READING" title="BÀI ĐỌC" className="script-module script-module--reading">
      <Teleprompter card={readingCard} cardNumber={readingCardNumber} cardTotal={readingCardTotal} followerReady={readingFollowerReady} heard={readingHeard} speaking={readingSpeaking} />
    </ModuleFrame>;
  }

  return <ModuleFrame eyebrow={obsFeed && feedMode === "obs" ? "OBS LIVELINK · LIVE DRAFT" : footageName ? `FOOTAGE · ${footageName}` : "FOOTAGE · chưa chọn"} title="SCRIPT" className={`script-module${obsFeed ? " script-module--with-obs" : ""}`} action={<div className="script-module__duration"><span>{isLiveTranscript ? "LIVE SPEECH" : "EST. DURATION"}</span><strong>{isLiveTranscript ? "REC" : `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`}</strong></div>}>
    <div className="script-toolbars"><div className={`script-review-strip ${isLiveTranscript ? "is-live" : ""}`}><strong>TRANSCRIPT LAYERS</strong><span className="candidate candidate--realtime">Realtime</span><span className="candidate candidate--stt">STT kỹ</span><span className="candidate candidate--ai">AI fix</span><span className="review-status"><i />{isLiveTranscript ? " Live Speech Transcript" : liveComparisonActive ? " Live → STT · kiểm tra thay thế" : reviewActive ? " Chọn phương án nhận diện" : " Direct edit ready"}</span></div>
    <div className="script-edit-toolbar" aria-label="Công cụ văn bản">
      {onSpeakerProfileChange ? (
        // One voice on the file is the common case, and Speaker Diarization is a
        // long GPU job to say what a person already knows. Assigning the profile
        // here is all the dataset needs to know whose voice this is.
        <label className="script-speaker-pick">NGƯỜI NÓI
          <select
            aria-label="Người nói của footage này"
            onChange={(event) => onSpeakerProfileChange(event.target.value || null)}
            value={speakerProfileId ?? ""}
          >
            <option value="">Chưa gán</option>
            {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}
          </select>
        </label>
      ) : null}
      <button aria-expanded={findOpen} className={findOpen ? "is-active" : ""} onClick={() => setFindOpen((open) => !open)} type="button">FIND / REPLACE</button>
      <label>SIZE<select aria-label="Cỡ chữ Script" onChange={(event) => { const next = Number(event.target.value); setScriptFontScale(next); emitFormatIntent("font-size", String(next)); }} value={scriptFontScale}><option value="85">85%</option><option value="100">100%</option><option value="115">115%</option><option value="130">130%</option><option value="150">150%</option></select></label>
      <button aria-pressed={scriptBold} className={scriptBold ? "is-active" : ""} onClick={() => { const next = !scriptBold; setScriptBold(next); emitFormatIntent("bold", next); }} type="button"><b>B</b></button>
      <button aria-pressed={scriptItalic} className={scriptItalic ? "is-active" : ""} onClick={() => { const next = !scriptItalic; setScriptItalic(next); emitFormatIntent("italic", next); }} type="button"><i>I</i></button>
      <button aria-pressed={scriptUnderline} className={scriptUnderline ? "is-active" : ""} onClick={() => { const next = !scriptUnderline; setScriptUnderline(next); emitFormatIntent("underline", next); }} type="button"><u>U</u></button>
      <button disabled={!words.length || isLiveTranscript} onClick={autoFormatFromPauses} type="button">AUTO NHỊP</button>
      {words.length ? <button aria-pressed={tableVisible} onClick={() => { if (comparisonActive) { setShowReview(false); setDismissedLiveComparisonSignature(liveComparisonSignature); setScriptView("table"); } else setScriptView(tableVisible ? "edit" : "table"); }} title="Bật/tắt bảng Script để chuyển giữa bảng và text thường" type="button">DẠNG BẢNG</button> : null}
    </div>
    {wordTimingQuality !== "source" && (words.length > 0 || wordTimingNote) ? <div className="script-timing-warning" role="status">{wordTimingNote ?? "Word timing chưa có nguồn căn chỉnh đáng tin; app không tự kéo dài hay đoán thời lượng từng từ."}</div> : null}{words.some((word) => word.timingSource === "user-interpolated") ? <div className="script-timing-warning is-estimated" role="status">Có từ mới được ước lượng timestamp từ nội dung xung quanh; đây chưa phải thời gian đã được xác nhận bằng âm thanh.</div> : null}{findOpen ? <div className="script-find-replace" aria-label="Tìm và thay thế"><input aria-label="Tìm text" onChange={(event) => setFindQuery(event.target.value)} placeholder="Tìm" value={findQuery} /><input aria-label="Thay bằng text" onChange={(event) => setReplaceQuery(event.target.value)} placeholder="Thay bằng" value={replaceQuery} /><label><input checked={findCaseSensitive} onChange={(event) => setFindCaseSensitive(event.target.checked)} type="checkbox" /> Phân biệt hoa/thường</label><button onClick={() => findNext(true)} type="button">↑</button><button onClick={() => findNext()} type="button">↓</button><button onClick={replaceCurrent} type="button">REPLACE</button><button onClick={replaceAll} type="button">ALL</button></div> : null}    {resolvedReview.length ? <div className="script-review-history" aria-label="Các phương án đã chọn">{resolvedReview.map(({ piece, resolution }) => <span className={`is-${resolution.choice}`} key={piece.id}><b>{resolution.choice === "stt" ? "STT" : resolution.choice === "ai" ? "AI" : "Sửa tay"}</b><s>{piece.stt.trim() || "∅"}</s><i>→</i><em>{resolution.text.trim() || "∅"}</em></span>)}</div> : null}</div>
    {obsFeed ? obsFeed : tableVisible ? <ScriptTable assetId={playbackAssetId} selection={wordSelection} onSelectionChange={(next) => onWordSelectionChange?.(next)} activeWordIndex={activeWordIndex} emotionStyle={emotionStyle} getEmotionStyle={emotionVisualStyle} onAssignWords={(indexes, profileId) => onWordsChange?.(assignProfileToWords(words, indexes, profileId))} onDeleteWords={onWordsChange ? deleteScriptWords : undefined} onMoveWords={(indexes, row) => onWordsChange?.(moveWordsToRow(words, indexes, row))} onUpdateWordText={(index, text) => { const result = replaceScriptWord(value, index, text, words); onWordsChange?.(result.words, result.text); }} defaultSpeakerId={speakerProfileId} speakers={speakers} storageKey={playbackAssetId ?? "draft"} words={words} /> : <div className={`script-editor-stack ${activeWordIndex >= 0 && !comparisonActive ? "is-tracking" : ""} ${tagMode ? "is-tagging" : ""} ${isLiveTranscript ? "is-live" : ""} ${comparisonActive ? "is-reviewing" : ""} ${hasEmotion ? "has-emotion" : ""}`} data-native-tracking={useNativePlayback ? "true" : undefined} style={{ "--script-format-scale": scriptFontScale / 100, fontWeight: scriptBold ? 700 : undefined, fontStyle: scriptItalic ? "italic" : undefined, textDecoration: scriptUnderline ? "underline" : undefined } as CSSProperties}>
      {tagMode ? <div aria-label="Gán profile theo từ" className="script-tag-editor">{words.map((word, index) => { const speaker = speakers.find((profile) => profile.id === word.speakerId); const previousSpeakerId = index ? words[index - 1]?.speakerId : null; const wordStyle = { ...emotionVisualStyle(word.emotion, emotionStyle), ...(speaker ? { borderBottomColor: speaker.color } : {}) }; return <Fragment key={`${word.start}-${index}`}>{speaker && speaker.id !== previousSpeakerId ? <span className="script-speaker-cue" style={{ borderColor: speaker.color }}><i style={{ background: speaker.color }} />{speaker.name}</span> : null}<button aria-label={`Gán nhãn cho từ ${word.text}`} className={index === activeWordIndex ? "is-active" : ""} data-emotion={word.emotion ?? "normal"} onClick={() => tagWord(index)} style={wordStyle} title={`${speaker?.name ?? "Chưa gán speaker"} · ${emotionLabel(word.emotion ?? "normal")} · ${word.start.toFixed(2)}s`} type="button">{word.text}<small>{emotionLabel(word.emotion ?? "normal")}</small></button></Fragment>; })}</div> : <><>{comparisonActive ? renderComparisonLayer() : useNativePlayback ? null : <div aria-hidden="true" className="script-playback-layer" ref={playbackLayerRef}>{playbackSegments.map((segment, index) => { const word = segment.wordIndex === null ? undefined : words[segment.wordIndex]; const emotion = word?.emotion; return <span className={`${segment.wordIndex === activeWordIndex ? "is-active" : ""} ${word?.reviewState === "manual" ? "is-edited" : ""} ${word?.timingSource === "user-interpolated" ? "is-time-estimated" : ""}`} data-script-word-index={segment.wordIndex ?? undefined} data-time-estimated={word?.timingSource === "user-interpolated" ? "true" : undefined} key={`${segment.wordIndex ?? "text"}-${index}`} ref={segment.wordIndex === activeWordIndex ? activePlaybackWordRef : undefined} style={emotionVisualStyle(emotion, emotionStyle)}>{segment.text}</span>; })}</div>}</><textarea aria-label="Script transcript" className="script-editor" onBlur={() => { clearEstimatedWordHover(); finishNativeTextEdit(); }} onContextMenu={openSelectionMenu} onFocus={() => { textEditBaselineRef.current = { text: value, words: [...words] }; pendingTextRef.current = value; }} onKeyDown={handleScriptKeyDown} onPointerLeave={clearEstimatedWordHover} onPointerMove={trackEstimatedWordHover} ref={textareaRef} onChange={(event) => { clearEstimatedWordHover(); const nextText = event.target.value; pendingTextRef.current = nextText; if (comparisonActive) { setShowReview(false); setReviewResolutions({}); setDismissedLiveComparisonSignature(liveComparisonSignature); } onChange(nextText); }} onScroll={syncScriptEditorScroll} placeholder="Transcript realtime, STT kỹ và AI fix sẽ cùng xuất hiện ở đây..." readOnly={isLiveTranscript} spellCheck value={value} /><div aria-label="Thanh cuộn Script" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(scriptScrollThumb.top)} className={`script-scrollbar ${scriptScrollThumb.enabled ? "" : "is-static"}`} onPointerCancel={endScriptScrollbar} onPointerDown={beginScriptScrollbar} onPointerMove={moveScriptScrollbar} onPointerUp={endScriptScrollbar} role="scrollbar" tabIndex={0}><i style={{ height: `${scriptScrollThumb.height}%`, top: `${scriptScrollThumb.top}%` }} /></div></>}</div>}
      {estimatedWordHover && words[estimatedWordHover.index] ? <div className="script-table__timing-status" role="status" style={{ left: Math.min(estimatedWordHover.left, Math.max(8, window.innerWidth - 270)), top: estimatedWordHover.top }}>Timestamp ước lượng · {words[estimatedWordHover.index].text} · cần kiểm tra trên waveform</div> : null}
    {selectionMenu ? <div aria-label="Thao tác đoạn Script" className="script-selection-menu" ref={selectionMenuRef} role="menu" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
      <div className="script-selection-menu__heading"><b>ĐOẠN ĐÃ CHỌN</b><span>{selectionMenu.text}</span></div>
      <section><strong>Text</strong><div><button onClick={() => { const range = { start: selectionMenu.start, end: selectionMenu.end }; setSelectionMenu(null); requestAnimationFrame(() => focusRange(range.start, range.end)); }} role="menuitem" type="button">Sửa text đã chọn</button><button onClick={() => void copySelectedScriptText()} role="menuitem" type="button">Copy</button><button onClick={() => void pasteOverScriptSelection()} role="menuitem" type="button">Paste thay đoạn chọn</button></div></section>
      <section><strong>Cảm xúc</strong><div>{EMOTION_OPTIONS.filter((option) => option.id !== "mix").map((option) => <button key={option.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, emotion: option.id }))} type="button">{option.label}</button>)}</div></section>
      {speakers.length ? <section><strong>Speaker</strong><div>{speakers.map((speaker) => <button key={speaker.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, speakerId: speaker.id }))} style={{ borderLeftColor: speaker.color }} type="button">{speaker.name}</button>)}</div></section> : null}
      {environments.length ? <section><strong>Environment</strong><div>{environments.map((profile) => <button key={profile.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, environmentProfileIds: [...new Set([...(word.environmentProfileIds ?? []), profile.id])] }))} type="button">{profile.name}</button>)}</div></section> : null}
      <button className="script-selection-menu__clear" onClick={() => applySelectionAnnotation((word) => ({ ...word, speakerId: null, environmentProfileIds: [], emotion: "normal" }))} type="button">Xóa nhãn đoạn chọn</button>
    </div> : null}    <div className="script-module__footer"><div className="script-stats"><span><b>{wordCount}</b> từ</span><span><b>{value.length.toLocaleString("vi-VN")}</b> ký tự</span></div><div className="script-actions">{workflow === "speech-to-text" && !obsFeed ? <>{words.length ? <span className="script-export"><button aria-expanded={srtExportOpen} className="button button--quiet" disabled={isLiveTranscript} onClick={() => setSrtExportOpen((open) => !open)} type="button">EXPORT ▾</button>{srtExportOpen ? <div className="script-export__menu" role="menu"><button onClick={() => { setSrtExportOpen(false); onDeferredAction?.("Export SRT theo câu"); }} role="menuitem" type="button"><b>Theo câu</b><small>Dễ đọc · tối đa 2 dòng</small></button><button onClick={() => { setSrtExportOpen(false); onDeferredAction?.("Export SRT từng từ"); }} role="menuitem" type="button"><b>Từng từ</b><small>Đồng bộ timestamp chính xác</small></button><button onClick={() => { setSrtExportOpen(false); onDeferredAction?.("Export bảng Script"); }} role="menuitem" type="button"><b>Bảng Script CSV</b><small>Speaker · nội dung · start · end</small></button></div> : null}</span> : null}<button className="button button--quiet is-danger" disabled={isLiveTranscript || (!value && !words.length)} onClick={clearScript} title="Xóa transcript và dữ liệu word timing của footage đang mở" type="button">Clear Text</button>{canRunAiReview ? <button className="button button--lime" disabled={isLiveTranscript || aiReviewBusy} onClick={onRunAiReview} type="button"><Icon name="spark" />{aiReviewBusy ? "AI đang check…" : "AI fix"}</button> : null}</> : null}{workflow === "voice-training" ? <button className="button button--lime" onClick={() => onDeferredAction?.("Dataset review")} type="button"><Icon name="spark" />Duyệt cho dataset</button> : null}{canGenerate ? <button aria-label="Tạo voice" className="button button--accent" onClick={onGenerate} type="button"><span><b>Tạo voice</b><small>OmniVoice · 32 steps</small></span><Icon name="arrow" /></button> : null}</div></div>
  </ModuleFrame>;
}
