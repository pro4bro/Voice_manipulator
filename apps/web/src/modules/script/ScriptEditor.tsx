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
import { useScriptShortcuts } from "./script-shortcuts";
import { mapScriptWordsToText, reconcileScriptTextEdit, replaceScriptTextRange, replaceScriptWord } from "./script-text-reconciliation";
import { useScriptWordDeletion } from "./use-script-word-deletion";
import { useScriptPlaybackFollow } from "./script-playback-follow";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { findScriptDocumentMatches, replaceScriptDocumentMatches, formatScriptDocumentPauses, type ScriptDocument, type ScriptDocumentChange, type ScriptDocumentMatch } from "./script-document-actions";

export type ScriptFormatKind = "font-size" | "bold" | "italic" | "underline";
export interface ScriptFormatIntent { kind: ScriptFormatKind; value: string | boolean; selection: { start: number; end: number; text: string }; }
interface ScriptEditorProps {
  onUndo?: () => void;
  onRedo?: () => void;
  value: string; onChange: (value: string) => void; workflow: WorkspacePage; onGenerate?: () => void; onDeferredAction?: (action: string, assetIds?: string[]) => void; onRunAiReview?: (assetIds?: string[]) => void; words?: StudioWord[]; wordTimingQuality?: WordTimingQuality; wordTimingNote?: string | null; activeWordIndex?: number; playbackAssetId?: string | null; footageName?: string | null; speakers?: SpeakerProfile[]; environments?: EnvironmentNoiseProfile[]; isLiveTranscript?: boolean; emotionStyle?: EmotionStylePreferences; liveTranscriptText?: string | null; aiReviewText?: string | null; aiReviewKey?: string | null; aiReviewBusy?: boolean; canRunAiReview?: boolean; readingCard?: ReadingPlanCard | null; readingCardNumber?: number; readingCardTotal?: number; readingHeard?: string[]; readingSpeaking?: boolean; readingFollowerReady?: boolean; onWordsChange?: (words: StudioWord[], text?: string) => void; onFormatIntent?: (intent: ScriptFormatIntent) => void; wordSelection?: WordSelection; onWordSelectionChange?: (selection: WordSelection) => void;
  trackName?: string;
  obsFeed?: ReactNode;
  sourceDocuments?: ScriptDocument[];
  renderSources?: (mode: "table" | "edit") => ReactNode;
  onSourceDocumentsChange?: (changes: ScriptDocumentChange[]) => void;
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

function scriptSegments(value: string, ranges: ScriptWordRange[]): ScriptSegment[] {
  if (!value || !ranges.length) return [{ text: value, wordIndex: null }];
  const segments: ScriptSegment[] = []; let cursor = 0;
  ranges.forEach((range) => { if (range.start < cursor) return; if (range.start > cursor) segments.push({ text: value.slice(cursor, range.start), wordIndex: null }); segments.push({ text: value.slice(range.start, range.end), wordIndex: range.index }); cursor = range.end; });
  if (cursor < value.length) segments.push({ text: value.slice(cursor), wordIndex: null }); return segments;
}
function reviewText(pieces: ReviewPiece[], resolutions: Record<string, ReviewResolution>) { return pieces.map((piece) => piece.kind === "same" ? piece.text : resolutions[piece.id]?.text ?? piece.stt).join(""); }

export function ScriptEditor({ onUndo, onRedo, value, onChange, workflow, onGenerate, onDeferredAction, onRunAiReview, words = [], wordTimingQuality = "unverified", wordTimingNote = null, activeWordIndex: explicitActiveWordIndex, playbackAssetId = null, footageName = null, speakers = [], environments = [], isLiveTranscript = false, emotionStyle = DEFAULT_EMOTION_STYLE, liveTranscriptText = null, aiReviewText = null, aiReviewKey = null, aiReviewBusy = false, canRunAiReview = false, readingCard = null, readingCardNumber = 0, readingCardTotal = 0, readingHeard, readingSpeaking = false, readingFollowerReady = false, onWordsChange, onFormatIntent, wordSelection = EMPTY_SELECTION, onWordSelectionChange, speakerProfileId = null, onSpeakerProfileChange, obsFeed, sourceDocuments, renderSources, onSourceDocumentsChange, trackName, feedMode = "obs" }: ScriptEditorProps) {
  const commandRef = useRef<HTMLElement>(null);
  const sourceMatchRef = useRef<ScriptDocumentMatch | null>(null);
  const readOnlyFeed = Boolean(obsFeed && !renderSources);
  const hasTimedWords = words.length > 0 || Boolean(sourceDocuments?.some((source) => source.words.length));
  const sourceIds = sourceDocuments?.map((source) => source.id);
  const playbackFollow = useScriptPlaybackFollow(commandRef, playbackAssetId);
  const wordDeletion = useScriptWordDeletion(playbackAssetId, value, words, (edit) => {
    onWordsChange?.(edit.words, edit.text);
    onWordSelectionChange?.(EMPTY_SELECTION);
  });
  const [selectedRowWordIndexes, setSelectedRowWordIndexes] = useState<number[]>([]);
  useScriptShortcuts(commandRef, {
    undo: onUndo ? () => { finishNativeTextEdit(); (document.activeElement as HTMLElement | null)?.blur(); onUndo(); } : undefined,
    redo: onRedo ? () => { finishNativeTextEdit(); (document.activeElement as HTMLElement | null)?.blur(); onRedo(); } : undefined,
  });
  const syncedActiveWordIndex = usePlaybackWord(playbackAssetId);
  const activeWordIndex = explicitActiveWordIndex ?? syncedActiveWordIndex;
  const playbackLayerRef = useRef<HTMLDivElement>(null); const reviewLayerRef = useRef<HTMLDivElement>(null); const textareaRef = useRef<HTMLTextAreaElement>(null); const activePlaybackWordRef = useRef<HTMLSpanElement>(null); const selectionMenuRef = useRef<HTMLDivElement>(null); const estimatedHoverTimerRef = useRef<number | null>(null); const pendingEstimatedHoverRef = useRef<EstimatedWordHover | null>(null); const [estimatedWordHover, setEstimatedWordHover] = useState<EstimatedWordHover | null>(null); const [tagMode, setTagMode] = useState(false); const [tagSpeakerId, setTagSpeakerId] = useState(""); const [tagEnvironmentId, setTagEnvironmentId] = useState(""); const [tagEmotion, setTagEmotion] = useState<EmotionLabel>("normal"); const [reviewPieces, setReviewPieces] = useState<ReviewPiece[]>([]); const [reviewResolutions, setReviewResolutions] = useState<Record<string, ReviewResolution>>({}); const [showReview, setShowReview] = useState(false); const [hoveredReviewId, setHoveredReviewId] = useState<string | null>(null); const [manualDraft, setManualDraft] = useState(""); const [selectionMenu, setSelectionMenu] = useState<ScriptSelectionMenu | null>(null); const reviewSignature = `${aiReviewKey ?? ""}:${aiReviewText ?? ""}`;
  const timingNoticeContentRef = useRef<HTMLDivElement>(null);
  const [timingNoticeHeight, setTimingNoticeHeight] = useState(0);
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
  const [scriptScrollTop, setScriptScrollTop] = useState(0);
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
  const resolvedReview = useMemo(() => reviewPieces.flatMap((piece) => { if (piece.kind !== "change") return []; const resolution = reviewResolutions[piece.id]; return resolution ? [{ piece, resolution }] : []; }), [reviewPieces, reviewResolutions]); const reviewActive = showReview && !tagMode && !isLiveTranscript && reviewPieces.length > 0; const liveComparisonActive = !reviewActive && !tagMode && !isLiveTranscript && dismissedLiveComparisonSignature !== liveComparisonSignature && liveSttPieces.some((piece) => piece.kind === "change"); const comparisonActive = reviewActive || liveComparisonActive; const hasEmotion = words.some((word) => Boolean(word.emotion && word.emotion !== "normal" && word.emotion !== "mix")); const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0; const duration = Math.round(wordCount / 2.65); const canGenerate = workflow === "voice-manipulator"; const tableVisible = scriptView === "table" && (words.length > 0 || Boolean(renderSources)) && !comparisonActive && !isLiveTranscript;
  const showTimingQualityNotice = wordTimingQuality !== "source" && (words.length > 0 || Boolean(wordTimingNote));
  const showEstimatedTimingNotice = words.some((word) => word.timingSource === "user-interpolated");
  const hasTimingNotices = showTimingQualityNotice || showEstimatedTimingNotice || wordDeletion.busy || Boolean(wordDeletion.error);
  const timingNoticeItems: ReactNode = <>
    {wordDeletion.busy ? <div role="status">Đang xóa từ đã chọn…</div> : null}
    {wordDeletion.error ? <div role="alert">{wordDeletion.error}</div> : null}
    {showTimingQualityNotice ? <div className="script-timing-warning" role="status">{wordTimingNote ?? "Word timing chưa có nguồn căn chỉnh đáng tin; app không tự kéo dài hay đoán thời lượng từng từ."}</div> : null}
    {showEstimatedTimingNotice ? <div className="script-timing-warning is-estimated" role="status">Có từ mới được ước lượng timestamp từ nội dung xung quanh; đây chưa phải thời gian đã được xác nhận bằng âm thanh.</div> : null}
  </>;
  const timingNotices: ReactNode = <div className="script-timing-notices">{timingNoticeItems}</div>;
  useLayoutEffect(() => {
    const element = timingNoticeContentRef.current;
    if (!element || !hasTimingNotices || tableVisible) {
      setTimingNoticeHeight((current) => current ? 0 : current);
      return undefined;
    }
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      setTimingNoticeHeight((current) => Math.abs(current - height) > 0.5 ? height : current);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasTimingNotices, tableVisible, wordTimingNote, words]);
  useLayoutEffect(() => {
    if (reviewActive || tagMode || !playbackFollow.shouldFollow(activeWordIndex)) return;
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
    if (nextTop !== null) {
      textarea.scrollTop = nextTop;
      syncScriptEditorScroll({ currentTarget: textarea } as UIEvent<HTMLTextAreaElement>);
    }
  }, [activeWordIndex, reviewActive, tagMode, useNativePlayback, value, wordRangesByIndex, playbackFollow.revision]);

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

  function applySelectionAnnotation(update: (word: StudioWord) => StudioWord, speakerOnly = false) {
    if (!selectionMenu) return;
    const indexes = selectedWordIndexes(selectionMenu.start, selectionMenu.end);
    if (speakerOnly) for (const index of indexes) if (!selectedRowWordIndexes.includes(index)) indexes.delete(index);
    if (indexes.size) onWordsChange?.(words.map((word, index) => indexes.has(index) ? update(word) : word));
    setSelectionMenu(null);
  }

  function updateScriptScroll(textarea: HTMLTextAreaElement) {
    const noticeLayer = textarea.parentElement?.querySelector<HTMLElement>(".script-timing-notice-layer");
    if (noticeLayer) noticeLayer.style.transform = `translateY(-${textarea.scrollTop}px)`;
    setScriptScrollTop(textarea.scrollTop);
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

  function tagWord(index: number) { onWordsChange?.(words.map((word, wordIndex) => wordIndex === index ? { ...word, speakerId: selectedRowWordIndexes.includes(index) ? tagSpeakerId || word.speakerId || null : word.speakerId, environmentProfileIds: tagEnvironmentId ? [...new Set([...(word.environmentProfileIds ?? []), tagEnvironmentId])] : word.environmentProfileIds ?? [], emotion: tagEmotion } : word)); }
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
    if (scriptView === "table") {
      setScriptView("edit");
      requestAnimationFrame(() => { textareaRef.current?.focus({ preventScroll: true }); textareaRef.current?.setSelectionRange(start, end); });
      return;
    }
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
  function focusSourceMatch(match: ScriptDocumentMatch) {
    sourceMatchRef.current = match;
    setScriptView("edit");
    requestAnimationFrame(() => {
      const textarea = Array.from(commandRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea[data-script-source-id]") ?? []).find((element) => element.dataset.scriptSourceId === match.assetId);
      textarea?.focus({ preventScroll: true });
      textarea?.setSelectionRange(match.start, match.end);
      textarea?.scrollIntoView?.({ block: "nearest" });
    });
  }
  function findNext(reverse = false) {
    if (!findQuery) return;
    if (sourceDocuments) {
      const matches = findScriptDocumentMatches(sourceDocuments, findQuery, findCaseSensitive);
      const previous = sourceMatchRef.current;
      const index = matches.findIndex((match) => match.assetId === previous?.assetId && match.start === previous.start && match.end === previous.end);
      const next = matches[index < 0 ? reverse ? matches.length - 1 : 0 : (index + (reverse ? -1 : 1) + matches.length) % matches.length];
      if (next) focusSourceMatch(next);
      return;
    }
    const query = comparable(findQuery); const source = comparable(value); const textarea = textareaRef.current;
    const pivot = reverse ? textarea?.selectionStart ?? value.length : textarea?.selectionEnd ?? 0;
    let index = reverse ? source.lastIndexOf(query, Math.max(0, pivot - 1)) : source.indexOf(query, pivot);
    if (index < 0) index = reverse ? source.lastIndexOf(query) : source.indexOf(query);
    if (index >= 0) focusRange(index, index + findQuery.length);
  }
  function replaceCurrent() {
    if (sourceDocuments) {
      const match = sourceMatchRef.current;
      const valid = findScriptDocumentMatches(sourceDocuments, findQuery, findCaseSensitive).find((item) => item.assetId === match?.assetId && item.start === match.start && item.end === match.end);
      if (!valid) { findNext(); return; }
      onSourceDocumentsChange?.(replaceScriptDocumentMatches(sourceDocuments, [valid], replaceQuery));
      focusSourceMatch({ ...valid, end: valid.start + replaceQuery.length });
      return;
    }
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
    if (sourceDocuments) {
      onSourceDocumentsChange?.(replaceScriptDocumentMatches(sourceDocuments, findScriptDocumentMatches(sourceDocuments, findQuery, findCaseSensitive), replaceQuery));
      return;
    }
    const escaped = findQuery.replaceAll("\\", "\\\\").replaceAll(".", "\\.").replaceAll("?", "\\?").replaceAll("*", "\\*").replaceAll("+", "\\+").replaceAll("^", "\\^").replaceAll("$", "\\$").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("|", "\\|");
    const expression = new RegExp(escaped, findCaseSensitive ? "gu" : "giu");
    commitScriptTextEdit(value.replace(expression, () => replaceQuery));
  }
  function autoFormatFromPauses() {
    if (sourceDocuments) {
      onSourceDocumentsChange?.(sourceDocuments.flatMap((source) => {
        const text = formatScriptDocumentPauses(source);
        return text === source.text ? [] : [{ assetId: source.id, text, words: reconcileScriptTextEdit(source.text, text, source.words).words }];
      }));
      return;
    }
    const text = formatScriptDocumentPauses({ text: value, words });
    if (text !== value) commitScriptTextEdit(text);
  }

  function clearScript() {
    if (sourceDocuments) {
      if (!window.confirm("Xóa transcript, word timing và nhãn theo từ của các track đang hiển thị?")) return;
      onSourceDocumentsChange?.(sourceDocuments.map((source) => ({ assetId: source.id, text: "", words: [] })));
      setScriptView("edit");
      return;
    }
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
    return wordDeletion.remove(indexes);
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

  return <ModuleFrame elementRef={commandRef} eyebrow={obsFeed && feedMode === "obs" ? "OBS LIVELINK · LIVE DRAFT" : footageName ? `FOOTAGE · ${footageName}` : "FOOTAGE · chưa chọn"} title="SCRIPT" className={`script-module${obsFeed ? " script-module--with-obs" : ""}`} action={<div className="script-module__duration"><span>{isLiveTranscript ? "LIVE SPEECH" : "EST. DURATION"}</span><strong>{isLiveTranscript ? "REC" : `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`}</strong></div>}>
    <div className="script-toolbars"><div className={`script-review-strip ${isLiveTranscript ? "is-live" : ""}`}><strong>TRANSCRIPT LAYERS</strong><span className="candidate candidate--realtime">Realtime</span><span className="candidate candidate--stt">STT kỹ</span><span className="candidate candidate--ai">AI fix</span><span className="review-status"><i />{isLiveTranscript ? " Live Speech Transcript" : liveComparisonActive ? " Live → STT · kiểm tra thay thế" : reviewActive ? " Chọn phương án nhận diện" : " Direct edit ready"}</span></div>
    <div className="script-edit-toolbar" aria-label="Công cụ văn bản">
      {onSpeakerProfileChange ? (
        // Script speaker choices are limited to checked rows; footage tagging
        // remains a separate Media Pool action.
        <label className="script-speaker-pick">NGƯỜI NÓI
          <select
            aria-label="Gán speaker cho rows đã chọn"
            disabled={!selectedRowWordIndexes.length || !onWordsChange} onChange={(event) => { if (selectedRowWordIndexes.length) onWordsChange?.(assignProfileToWords(words, selectedRowWordIndexes, event.target.value || null)); }}
            value=""
          >
            <option value="">Chọn speaker / bỏ gán</option>
            {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}
          </select>
        </label>
      ) : null}
      <button aria-expanded={findOpen} className={findOpen ? "is-active" : ""} onClick={() => setFindOpen((open) => !open)} type="button">FIND / REPLACE</button>
      <label>SIZE<select aria-label="Cỡ chữ Script" onChange={(event) => { const next = Number(event.target.value); setScriptFontScale(next); emitFormatIntent("font-size", String(next)); }} value={scriptFontScale}><option value="85">85%</option><option value="100">100%</option><option value="115">115%</option><option value="130">130%</option><option value="150">150%</option></select></label>
      <button aria-pressed={scriptBold} className={scriptBold ? "is-active" : ""} onClick={() => { const next = !scriptBold; setScriptBold(next); emitFormatIntent("bold", next); }} type="button"><b>B</b></button>
      <button aria-pressed={scriptItalic} className={scriptItalic ? "is-active" : ""} onClick={() => { const next = !scriptItalic; setScriptItalic(next); emitFormatIntent("italic", next); }} type="button"><i>I</i></button>
      <button aria-pressed={scriptUnderline} className={scriptUnderline ? "is-active" : ""} onClick={() => { const next = !scriptUnderline; setScriptUnderline(next); emitFormatIntent("underline", next); }} type="button"><u>U</u></button>
      <button disabled={!hasTimedWords || isLiveTranscript || readOnlyFeed} onClick={autoFormatFromPauses} type="button">AUTO NHỊP</button>
      {words.length || obsFeed ? <button disabled={readOnlyFeed || isLiveTranscript} aria-pressed={tableVisible || readOnlyFeed} onClick={() => { if (comparisonActive) { setShowReview(false); setDismissedLiveComparisonSignature(liveComparisonSignature); setScriptView("table"); } else setScriptView(tableVisible ? "edit" : "table"); }} title="Bật/tắt bảng Script để chuyển giữa bảng và text thường" type="button">DẠNG BẢNG</button> : null}
    </div>
    {findOpen ? <div className="script-find-replace" aria-label="Tìm và thay thế"><input aria-label="Tìm text" onChange={(event) => setFindQuery(event.target.value)} placeholder="Tìm" value={findQuery} /><input aria-label="Thay bằng text" onChange={(event) => setReplaceQuery(event.target.value)} placeholder="Thay bằng" value={replaceQuery} /><label><input checked={findCaseSensitive} onChange={(event) => setFindCaseSensitive(event.target.checked)} type="checkbox" /> Phân biệt hoa/thường</label><button onClick={() => findNext(true)} type="button">↑</button><button onClick={() => findNext()} type="button">↓</button><button onClick={replaceCurrent} type="button">REPLACE</button><button onClick={replaceAll} type="button">ALL</button></div> : null}    {resolvedReview.length ? <div className="script-review-history" aria-label="Các phương án đã chọn">{resolvedReview.map(({ piece, resolution }) => <span className={`is-${resolution.choice}`} key={piece.id}><b>{resolution.choice === "stt" ? "STT" : resolution.choice === "ai" ? "AI" : "Sửa tay"}</b><s>{piece.stt.trim() || "∅"}</s><i>→</i><em>{resolution.text.trim() || "∅"}</em></span>)}</div> : null}</div>
    <div className="script-document" style={{ "--script-format-scale": scriptFontScale / 100, "--script-font-adjust": scriptFontScale / 100, fontWeight: scriptBold ? 700 : undefined, fontStyle: scriptItalic ? "italic" : undefined, textDecoration: scriptUnderline ? "underline" : undefined } as CSSProperties}>
    {renderSources ? renderSources(scriptView) : obsFeed ? obsFeed : tableVisible ? <ScriptTable trackName={trackName} deleteBusy={wordDeletion.busy} leadingContent={hasTimingNotices ? timingNotices : undefined} onSelectedRowWordsChange={setSelectedRowWordIndexes} assetId={playbackAssetId} selection={wordSelection} onSelectionChange={(next) => onWordSelectionChange?.(next)} activeWordIndex={activeWordIndex} emotionStyle={emotionStyle} getEmotionStyle={emotionVisualStyle} onAssignWords={(indexes, profileId) => onWordsChange?.(assignProfileToWords(words, indexes, profileId))} onDeleteWords={onWordsChange ? deleteScriptWords : undefined} onMoveWords={(indexes, row) => onWordsChange?.(moveWordsToRow(words, indexes, row))} onUpdateWordText={(index, text) => { const result = replaceScriptWord(value, index, text, words); onWordsChange?.(result.words, result.text); }} defaultSpeakerId={speakerProfileId} speakers={speakers} storageKey={playbackAssetId ?? "draft"} words={words} /> : <div className={`script-editor-stack ${activeWordIndex >= 0 && !comparisonActive ? "is-tracking" : ""} ${tagMode ? "is-tagging" : ""} ${isLiveTranscript ? "is-live" : ""} ${comparisonActive ? "is-reviewing" : ""} ${hasEmotion ? "has-emotion" : ""}`} data-native-tracking={useNativePlayback ? "true" : undefined} style={{ "--script-format-scale": scriptFontScale / 100, "--script-timing-inset": `${timingNoticeHeight}px`, fontWeight: scriptBold ? 700 : undefined, fontStyle: scriptItalic ? "italic" : undefined, textDecoration: scriptUnderline ? "underline" : undefined } as CSSProperties}>
      {!tagMode && hasTimingNotices ? <div aria-label="Cảnh báo thời gian Script" className="script-timing-notice-layer" style={{ transform: `translateY(-${scriptScrollTop}px)` }}><div className="script-timing-notices" ref={timingNoticeContentRef}>{timingNoticeItems}</div></div> : null}
      {tagMode ? <div aria-label="Gán profile theo từ" className="script-tag-editor">{words.map((word, index) => { const speaker = speakers.find((profile) => profile.id === word.speakerId); const previousSpeakerId = index ? words[index - 1]?.speakerId : null; const wordStyle = { ...emotionVisualStyle(word.emotion, emotionStyle), ...(speaker ? { borderBottomColor: speaker.color } : {}) }; return <Fragment key={`${word.start}-${index}`}>{speaker && speaker.id !== previousSpeakerId ? <span className="script-speaker-cue" style={{ borderColor: speaker.color }}><i style={{ background: speaker.color }} />{speaker.name}</span> : null}<button aria-label={`Gán nhãn cho từ ${word.text}`} className={index === activeWordIndex ? "is-active" : ""} data-emotion={word.emotion ?? "normal"} onClick={() => tagWord(index)} style={wordStyle} title={`${speaker?.name ?? "Chưa gán speaker"} · ${emotionLabel(word.emotion ?? "normal")} · ${word.start.toFixed(2)}s`} type="button">{word.text}<small>{emotionLabel(word.emotion ?? "normal")}</small></button></Fragment>; })}</div> : <><>{comparisonActive ? renderComparisonLayer() : useNativePlayback ? null : <div aria-hidden="true" className="script-playback-layer" ref={playbackLayerRef}>{playbackSegments.map((segment, index) => { const word = segment.wordIndex === null ? undefined : words[segment.wordIndex]; const emotion = word?.emotion; return <span className={`${segment.wordIndex === activeWordIndex ? "is-active" : ""} ${word?.reviewState === "manual" ? "is-edited" : ""} ${word?.timingSource === "user-interpolated" ? "is-time-estimated" : ""}`} data-script-word-index={segment.wordIndex ?? undefined} data-time-estimated={word?.timingSource === "user-interpolated" ? "true" : undefined} key={`${segment.wordIndex ?? "text"}-${index}`} ref={segment.wordIndex === activeWordIndex ? activePlaybackWordRef : undefined} style={emotionVisualStyle(emotion, emotionStyle)}>{segment.text}</span>; })}</div>}</><textarea aria-label="Script transcript" className="script-editor" onBlur={() => { clearEstimatedWordHover(); finishNativeTextEdit(); }} onContextMenu={openSelectionMenu} onFocus={() => { textEditBaselineRef.current = { text: value, words: [...words] }; pendingTextRef.current = value; }} onKeyDown={handleScriptKeyDown} onPointerLeave={clearEstimatedWordHover} onPointerMove={trackEstimatedWordHover} ref={textareaRef} onChange={(event) => { clearEstimatedWordHover(); const nextText = event.target.value; pendingTextRef.current = nextText; if (comparisonActive) { setShowReview(false); setReviewResolutions({}); setDismissedLiveComparisonSignature(liveComparisonSignature); } onChange(nextText); }} onScroll={syncScriptEditorScroll} placeholder="Transcript realtime, STT kỹ và AI fix sẽ cùng xuất hiện ở đây..." readOnly={isLiveTranscript} spellCheck value={value} /><ScriptScrollbar viewportRef={textareaRef} label="Thanh cuộn Script" className="script-scrollbar" /></>}</div>}
    </div>
      {estimatedWordHover && words[estimatedWordHover.index] ? <div className="script-table__timing-status" role="status" style={{ left: Math.min(estimatedWordHover.left, Math.max(8, window.innerWidth - 270)), top: estimatedWordHover.top }}>Timestamp ước lượng · {words[estimatedWordHover.index].text} · cần kiểm tra trên waveform</div> : null}
    {selectionMenu ? <div aria-label="Thao tác đoạn Script" className="script-selection-menu" ref={selectionMenuRef} role="menu" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
      <div className="script-selection-menu__heading"><b>ĐOẠN ĐÃ CHỌN</b><span>{selectionMenu.text}</span></div>
      <section><strong>Text</strong><div><button onClick={() => { const range = { start: selectionMenu.start, end: selectionMenu.end }; setSelectionMenu(null); requestAnimationFrame(() => focusRange(range.start, range.end)); }} role="menuitem" type="button">Sửa text đã chọn</button><button onClick={() => void copySelectedScriptText()} role="menuitem" type="button">Copy</button><button onClick={() => void pasteOverScriptSelection()} role="menuitem" type="button">Paste thay đoạn chọn</button></div></section>
      <section><strong>Cảm xúc</strong><div>{EMOTION_OPTIONS.filter((option) => option.id !== "mix").map((option) => <button key={option.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, emotion: option.id }))} type="button">{option.label}</button>)}</div></section>
      {speakers.length ? <section><strong>Speaker</strong><div>{speakers.map((speaker) => <button key={speaker.id} disabled={!selectedRowWordIndexes.length} onClick={() => applySelectionAnnotation((word) => ({ ...word, speakerId: speaker.id }), true)} style={{ borderLeftColor: speaker.color }} type="button">{speaker.name}</button>)}</div></section> : null}
      {environments.length ? <section><strong>Environment</strong><div>{environments.map((profile) => <button key={profile.id} onClick={() => applySelectionAnnotation((word) => ({ ...word, environmentProfileIds: [...new Set([...(word.environmentProfileIds ?? []), profile.id])] }))} type="button">{profile.name}</button>)}</div></section> : null}
      <button className="script-selection-menu__clear" onClick={() => applySelectionAnnotation((word) => ({ ...word, environmentProfileIds: [], emotion: "normal" }))} type="button">Xóa nhãn emotion và môi trường</button>
    </div> : null}    <div className="script-module__footer"><div className="script-stats"><span><b>{wordCount}</b> từ</span><span><b>{value.length.toLocaleString("vi-VN")}</b> ký tự</span></div><div className="script-actions">{workflow === "speech-to-text" ? <>{words.length || obsFeed ? <span className="script-export"><button aria-expanded={srtExportOpen} className="button button--quiet" disabled={isLiveTranscript || readOnlyFeed} title="Xuất transcript của các nguồn đang hiển thị" onClick={() => setSrtExportOpen((open) => !open)} type="button">EXPORT ▾</button>{srtExportOpen ? <div className="script-export__menu" role="menu"><button onClick={() => { setSrtExportOpen(false); if (sourceIds) onDeferredAction?.("Export SRT theo câu", sourceIds); else onDeferredAction?.("Export SRT theo câu"); }} role="menuitem" type="button"><b>Theo câu</b><small>Dễ đọc · tối đa 2 dòng</small></button><button onClick={() => { setSrtExportOpen(false); if (sourceIds) onDeferredAction?.("Export SRT từng từ", sourceIds); else onDeferredAction?.("Export SRT từng từ"); }} role="menuitem" type="button"><b>Từng từ</b><small>Đồng bộ timestamp chính xác</small></button><button onClick={() => { setSrtExportOpen(false); if (sourceIds) onDeferredAction?.("Export bảng Script", sourceIds); else onDeferredAction?.("Export bảng Script"); }} role="menuitem" type="button"><b>Bảng Script CSV</b><small>Speaker · nội dung · start · end</small></button></div> : null}</span> : null}<button className="button button--quiet is-danger" disabled={isLiveTranscript || readOnlyFeed || (!value && !hasTimedWords)} onClick={clearScript} title="Xóa transcript và word timing của các nguồn đang hiển thị" type="button">Clear Text</button>{canRunAiReview || obsFeed ? <button className="button button--lime" disabled={isLiveTranscript || readOnlyFeed || !canRunAiReview || aiReviewBusy} onClick={() => { if (renderSources) setScriptView("edit"); if (sourceIds) onRunAiReview?.(sourceIds); else onRunAiReview?.(); }} type="button"><Icon name="spark" />{aiReviewBusy ? "AI đang check…" : "AI fix"}</button> : null}</> : null}{workflow === "voice-training" ? <button className="button button--lime" onClick={() => onDeferredAction?.("Dataset review")} type="button"><Icon name="spark" />Duyệt cho dataset</button> : null}{canGenerate ? <button aria-label="Tạo voice" className="button button--accent" onClick={onGenerate} type="button"><span><b>Tạo voice</b><small>OmniVoice · 32 steps</small></span><Icon name="arrow" /></button> : null}</div></div>
  </ModuleFrame>;
}
