import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type UIEvent } from "react";

import type { EmotionLabel, EmotionStylePreferences, SpeakerProfile, StudioWord } from "../../domain/types";

export interface ScriptTableColumn {
  id: string;
  label: string;
  width: number;
  builtin?: "speaker" | "content" | "timestamp";
}

const DEFAULT_COLUMNS: readonly ScriptTableColumn[] = [
  { id: "speaker", label: "SPEAKER", width: 220, builtin: "speaker" },
  { id: "content", label: "NỘI DUNG", width: 620, builtin: "content" },
  { id: "timestamp", label: "TIMESTAMP", width: 164, builtin: "timestamp" },
];

export interface SpeakerScriptRow {
  id: string;
  speakerKey: string;
  diarizationLabel: string;
  profileId: string | null;
  profile: SpeakerProfile | null;
  words: Array<{ index: number; word: StudioWord }>;
}

function normalizedDiarizationId(word: StudioWord) {
  // Manual Profile assignment is the visible grouping; raw diarization remains provenance.
  const profile = word.speakerId?.trim();
  if (profile) return `profile:${profile}`;
  const manual = word.manualDiarizationSpeakerId?.trim();
  if (manual) return manual;
  return word.diarizationSpeakerId?.trim() || "speaker-1";
}
function labelForDiarization(id: string) {
  if (id.startsWith("profile:")) return "Speaker 1";
  const number = /(?:speaker|spk)[-_ ]?(\d+)$/iu.exec(id)?.[1];
  return number ? `Speaker ${number}` : id.replace(/[-_]+/gu, " ");
}

function timecode(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function parsedBuiltin(value: unknown): ScriptTableColumn["builtin"] {
  return value === "speaker" || value === "content" || value === "timestamp" ? value : undefined;
}
function copyDefaultColumns() {
  return DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

function loadColumns(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(`pro4bro:script-table:${storageKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || !parsed.length) return copyDefaultColumns();
    const columns = parsed
      .filter((column): column is Record<string, unknown> => Boolean(column && typeof column === "object"))
      .map((column) => ({
        id: String(column.id ?? ""),
        label: String(column.label ?? "").trim(),
        width: Math.max(24, Number(column.width) || 160),
        builtin: parsedBuiltin(column.builtin),
      }))
      .filter((column) => column.id && column.label);
    return columns.length ? columns : copyDefaultColumns();
  } catch {
    return copyDefaultColumns();
  }
}

export function buildSpeakerScriptRows(words: StudioWord[], speakers: SpeakerProfile[]): SpeakerScriptRow[] {
  const profileById = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const rows: SpeakerScriptRow[] = [];
  for (const [index, word] of words.entries()) {
    const diarizationId = normalizedDiarizationId(word);
    const profile = word.speakerId ? profileById.get(word.speakerId) ?? null : null;
    const previous = rows[rows.length - 1];
    if (previous && previous.speakerKey === diarizationId) {
      previous.words.push({ index, word });
      if (!previous.profileId && profile) {
        previous.profileId = profile.id;
        previous.profile = profile;
        previous.diarizationLabel = profile.name;
      }
      continue;
    }
    rows.push({
      id: `${diarizationId}-${index}`,
      speakerKey: diarizationId,
      diarizationLabel: profile?.name ?? labelForDiarization(diarizationId),
      profileId: profile?.id ?? null,
      profile,
      words: [{ index, word }],
    });
  }
  return rows;
}

export function assignProfileToTurn(words: StudioWord[], indexes: number[], profileId: string | null) {
  const selected = new Set(indexes);
  return words.map((word, index) => {
    if (!selected.has(index)) return word;
    const updated = { ...word, speakerId: profileId ?? undefined };
    delete updated.manualDiarizationSpeakerId;
    return updated;
  });
}

export function assignProfileToWord(words: StudioWord[], index: number, profileId: string | null) {
  return assignProfileToTurn(words, [index], profileId);
}
export const assignProfileToWords = assignProfileToTurn;

export function moveWordToRow(words: StudioWord[], index: number, row: Pick<SpeakerScriptRow, "speakerKey" | "profileId">) {
  if (index < 0 || index >= words.length) return words;
  return words.map((word, wordIndex) => {
    if (wordIndex !== index) return word;
    const updated = { ...word, speakerId: row.profileId ?? undefined };
    if (row.profileId) delete updated.manualDiarizationSpeakerId;
    else updated.manualDiarizationSpeakerId = row.speakerKey;
    return updated;
  });
}
export function moveWordsToRow(words: StudioWord[], indexes: number[], row: Pick<SpeakerScriptRow, "speakerKey" | "profileId">) {
  const selected = new Set(indexes.filter((index) => index >= 0 && index < words.length));
  if (!selected.size) return words;
  return words.map((word, index) => {
    if (!selected.has(index)) return word;
    const updated = { ...word, speakerId: row.profileId ?? undefined };
    if (row.profileId) delete updated.manualDiarizationSpeakerId;
    else updated.manualDiarizationSpeakerId = row.speakerKey;
    return updated;
  });
}

export function updateWordText(words: StudioWord[], index: number, text: string) {
  const nextText = text.trim();
  if (!nextText || index < 0 || index >= words.length) return words;
  return words.map((word, wordIndex) => wordIndex === index ? { ...word, text: nextText, reviewState: "manual" as const, selectedVariant: "manual" as const } : word);
}

interface ScriptTableProps {
  words: StudioWord[];
  speakers: SpeakerProfile[];
  activeWordIndex: number;
  emotionStyle: EmotionStylePreferences;
  getEmotionStyle: (emotion: EmotionLabel | null | undefined, preferences: EmotionStylePreferences) => CSSProperties | undefined;
  onAssignWords: (indexes: number[], profileId: string | null) => void;
  onMoveWords: (indexes: number[], row: SpeakerScriptRow) => void;
  onUpdateWordText: (index: number, text: string) => void;
  onOpenTextEditor: () => void;
  storageKey: string;
}
interface ScrollMetrics {
  top: number;
  clientHeight: number;
  scrollHeight: number;
  trackHeight: number;
}

interface ResizeState {
  id: string;
  startX: number;
  startWidth: number;
}

interface SpeakerTextProps {
  words: StudioWord[];
  speakers: SpeakerProfile[];
  activeWordIndex: number;
  onOpenTextEditor: () => void;
}

/* The non-table view keeps each diarized turn intact while giving the user a compact reading layout. */
export function ScriptSpeakerText({ words, speakers, activeWordIndex, onOpenTextEditor }: SpeakerTextProps) {
  const rows = useMemo(() => buildSpeakerScriptRows(words, speakers), [speakers, words]);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (activeWordIndex < 0) return;
    activeWordRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [activeWordIndex]);

  if (!rows.length) return null;
  return <div aria-label="Transcript theo người nói" className="script-speaker-text" onDoubleClick={onOpenTextEditor} title="Double-click để mở Text Edit">
    {rows.map((row) => {
      const color = row.profile?.color ?? "var(--text-muted)";
      return <article className={row.words.some(({ index }) => index === activeWordIndex) ? "is-active" : ""} key={row.id}>
        <header style={{ borderLeftColor: color }}><i style={{ background: color }} /><b style={{ color }}>{row.diarizationLabel}</b></header>
        <p>{row.words.map(({ index, word }) => <span className={index === activeWordIndex ? "is-active" : ""} key={`${word.start}-${word.end}-${index}`} ref={index === activeWordIndex ? activeWordRef : undefined}>{word.text}{" "}</span>)}</p>
      </article>;
    })}
  </div>;
}
export function ScriptTable({ words, speakers, activeWordIndex, emotionStyle, getEmotionStyle, onAssignWords, onMoveWords, onUpdateWordText, onOpenTextEditor, storageKey }: ScriptTableProps) {
  const rows = useMemo(() => buildSpeakerScriptRows(words, speakers), [speakers, words]);
  const [columns, setColumns] = useState<ScriptTableColumn[]>(() => loadColumns(storageKey));
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef(false);
  const resizeRef = useRef<ResizeState | null>(null);
  const [selectedWordIndexes, setSelectedWordIndexes] = useState<Set<number>>(() => new Set());
  const [wordEdit, setWordEdit] = useState<{ index: number; value: string } | null>(null);
  const [speakerMenu, setSpeakerMenu] = useState<{ indexes: number[]; x: number; y: number } | null>(null);
  const wordSelectionAnchorRef = useRef<number | null>(null);
  const wordSelectionDraggingRef = useRef(false);
  const wordSelectionExtendedRef = useRef(false);
  const [scroll, setScroll] = useState<ScrollMetrics>({ top: 0, clientHeight: 0, scrollHeight: 0, trackHeight: 0 });

  useEffect(() => { setColumns(loadColumns(storageKey)); }, [storageKey]);
  useEffect(() => { window.localStorage.setItem(`pro4bro:script-table:${storageKey}`, JSON.stringify(columns)); }, [columns, storageKey]);
  useEffect(() => {
    if (!speakerMenu) return undefined;
    const closeMenu = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".script-table__word-menu")) return;
      setSpeakerMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu, true);
    return () => window.removeEventListener("pointerdown", closeMenu, true);
  }, [speakerMenu]);
  useEffect(() => {
    const moveSelection = (event: globalThis.PointerEvent) => extendWordSelectionAtPoint(event.clientX, event.clientY);
    const endSelection = () => { wordSelectionDraggingRef.current = false; };
    window.addEventListener("pointermove", moveSelection, true);
    window.addEventListener("pointerup", endSelection, true);
    window.addEventListener("pointercancel", endSelection, true);
    return () => {
      window.removeEventListener("pointermove", moveSelection, true);
      window.removeEventListener("pointerup", endSelection, true);
      window.removeEventListener("pointercancel", endSelection, true);
    };
  }, []);

  const gridTemplateColumns = useMemo(() => [...columns.map((column) => `${column.width}px`), "30px"].join(" "), [columns]);
  const thumb = useMemo(() => {
    const visible = scroll.clientHeight;
    const total = Math.max(visible, scroll.scrollHeight);
    const cssMinimum = Math.min(100, (28 / Math.max(1, scroll.trackHeight)) * 100);
    const height = total > 0 ? Math.min(100, Math.max(cssMinimum, (visible / total) * 100)) : 100;
    const maxScroll = Math.max(0, total - visible);
    const top = maxScroll > 0 ? Math.max(0, Math.min(100 - height, (scroll.top / maxScroll) * (100 - height))) : 0;
    return { top, height, enabled: maxScroll > 0.5 };
  }, [scroll]);

  function updateScroll(element: HTMLDivElement) {
    const trackHeight = trackRef.current?.clientHeight ?? 0;
    setScroll((current) => current.top === element.scrollTop && current.clientHeight === element.clientHeight && current.scrollHeight === element.scrollHeight && current.trackHeight === trackHeight
      ? current
      : { top: element.scrollTop, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, trackHeight });
  }

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => updateScroll(element);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [rows.length, words]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const activeWord = activeWordRef.current;
    if (!element || !activeWord || activeWordIndex < 0) return;
    const wordTop = activeWord.offsetTop - element.offsetTop;
    const wordBottom = wordTop + activeWord.offsetHeight;
    const upperBoundary = element.scrollTop + element.clientHeight * 0.18;
    const lowerBoundary = element.scrollTop + element.clientHeight * 0.76;
    if (wordTop >= upperBoundary && wordBottom <= lowerBoundary) return;
    element.scrollTop = Math.max(0, wordTop - element.clientHeight * 0.38);
    updateScroll(element);
  }, [activeWordIndex, rows]);

  function syncScroll(event: UIEvent<HTMLDivElement>) {
    updateScroll(event.currentTarget);
  }

  function seekScrollbar(clientY: number) {
    const element = scrollRef.current;
    const track = trackRef.current;
    if (!element || !track || element.scrollHeight <= element.clientHeight) return;
    const bounds = track.getBoundingClientRect();
    const pointerRatio = Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(bounds.height, 1)));
    const thumbRatio = thumb.height / 100;
    const travel = Math.max(0.0001, 1 - thumbRatio);
    const targetRatio = Math.max(0, Math.min(1, (pointerRatio - thumbRatio / 2) / travel));
    element.scrollTop = targetRatio * (element.scrollHeight - element.clientHeight);
    updateScroll(element);
  }

  function beginScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!thumb.enabled) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekScrollbar(event.clientY);
  }

  function moveScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    event.preventDefault();
    seekScrollbar(event.clientY);
  }

  function endScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    seekScrollbar(event.clientY);
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function beginColumnResize(event: ReactPointerEvent<HTMLButtonElement>, column: ScriptTableColumn) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { id: column.id, startX: event.clientX, startWidth: column.width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function resizeColumn(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize) return;
    event.preventDefault();
    const width = Math.max(24, resize.startWidth + event.clientX - resize.startX);
    setColumns((current) => current.map((column) => column.id === resize.id ? { ...column, width } : column));
  }

  function endColumnResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!resizeRef.current) return;
    resizeColumn(event);
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function addColumn() {
    const label = window.prompt("Tên cột mới", "Thuộc tính")?.trim();
    if (!label) return;
    setColumns((current) => [...current, { id: `custom-${Date.now()}-${current.length}`, label: label.toUpperCase(), width: 180 }]);
  }

  function removeColumn(id: string) {
    setColumns((current) => current.length > 1 ? current.filter((column) => column.id !== id) : current);
  }

  function wordIndexRange(start: number, end: number) {
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
  }

  function beginWordSelection(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 && event.button !== -1) return;
    event.stopPropagation();
    wordSelectionDraggingRef.current = true;
    wordSelectionExtendedRef.current = false;
    const anchor = wordSelectionAnchorRef.current;
    if (event.shiftKey && anchor !== null) {
      setSelectedWordIndexes(new Set(wordIndexRange(anchor, index)));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedWordIndexes((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      wordSelectionAnchorRef.current = index;
      return;
    }
    wordSelectionAnchorRef.current = index;
    setSelectedWordIndexes(new Set([index]));
  }

  function extendWordSelectionAtPoint(clientX: number, clientY: number) {
    if (!wordSelectionDraggingRef.current) return;
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-script-word-index]");
    const index = Number(target?.dataset.scriptWordIndex);
    if (Number.isInteger(index)) extendWordSelection(index);
  }

  function extendWordSelection(index: number) {
    const anchor = wordSelectionAnchorRef.current;
    if (!wordSelectionDraggingRef.current || anchor === null || anchor === index) return;
    wordSelectionExtendedRef.current = true;
    setSelectedWordIndexes(new Set(wordIndexRange(anchor, index)));
  }

  function openSpeakerMenu(index: number, x: number, y: number) {
    const indexes = selectedWordIndexes.has(index) ? [...selectedWordIndexes] : [index];
    if (!selectedWordIndexes.has(index)) {
      wordSelectionAnchorRef.current = index;
      setSelectedWordIndexes(new Set(indexes));
    }
    setWordEdit(null);
    setSpeakerMenu({ indexes: indexes.sort((left, right) => left - right), x, y });
  }

  function assignProfileToSelectedWords(profileId: string | null) {
    if (!speakerMenu?.indexes.length) return;
    onAssignWords(speakerMenu.indexes, profileId);
    setSpeakerMenu(null);
  }

  function moveSelectedWordsToRow(row: SpeakerScriptRow) {
    if (!speakerMenu?.indexes.length) return;
    onMoveWords(speakerMenu.indexes, row);
    setSpeakerMenu(null);
  }

  function confirmWordEdit() {
    if (!wordEdit) return;
    onUpdateWordText(wordEdit.index, wordEdit.value);
    setWordEdit(null);
  }

  function renderWord(index: number, word: StudioWord) {
    const selected = selectedWordIndexes.has(index);
    const editing = wordEdit?.index === index;
    return <span className="script-table__word-wrap" key={`${word.start}-${word.end}-${index}`}>
      <button aria-label={`Chọn từ ${word.text}`} aria-pressed={selected} className={`script-table__word ${index === activeWordIndex ? "is-active" : ""} ${word.reviewState === "manual" ? "is-manual" : ""}`} data-script-word-index={index} onClick={(event) => {
        event.stopPropagation();
        if (wordSelectionExtendedRef.current) {
          wordSelectionExtendedRef.current = false;
          return;
        }
        if (event.shiftKey || event.ctrlKey || event.metaKey) return;
        wordSelectionAnchorRef.current = index;
        setSelectedWordIndexes(new Set([index]));
        setSpeakerMenu(null);
        setWordEdit({ index, value: word.text });
      }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openSpeakerMenu(index, event.clientX, event.clientY); }} onPointerDown={(event) => beginWordSelection(event, index)} onPointerEnter={() => extendWordSelection(index)} onPointerMove={(event) => extendWordSelectionAtPoint(event.clientX, event.clientY)} onPointerUp={() => { wordSelectionDraggingRef.current = false; }} ref={index === activeWordIndex ? activeWordRef : undefined} style={getEmotionStyle(word.emotion, emotionStyle)} title="Kéo quét nhiều từ, sau đó chuột phải để gán Speaker Profile hoặc chuyển row" type="button">{word.text}</button>{" "}
      {editing ? <form aria-label={`Sửa từ ${word.text}`} className="script-table__word-editor" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); confirmWordEdit(); }}>
        <input aria-label={`Sửa từ ${word.text}`} autoFocus onChange={(event) => setWordEdit({ index, value: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setWordEdit(null); } }} value={wordEdit.value} />
      </form> : null}
    </span>;
  }

  function renderCell(row: SpeakerScriptRow, column: ScriptTableColumn) {
    if (column.builtin === "speaker") {
      return <div className="script-table__speaker" role="gridcell">
        <i style={{ background: row.profile?.color ?? "var(--text-muted)" }} />
        <div>
          <b style={{ color: row.profile?.color }}>{row.diarizationLabel}</b>
          <small>{row.profile ? "Profile đã gán" : "Chuột phải trên từ để gán Profile"}</small>
        </div>
      </div>;
    }
    if (column.builtin === "content") {
      return <div className="script-table__content" onDoubleClick={onOpenTextEditor} role="gridcell" tabIndex={0} title="Kéo quét nhiều từ · chuột phải để gán Speaker Profile hoặc chuyển row">
        {row.words.map(({ index, word }) => renderWord(index, word))}
      </div>;
    }
    if (column.builtin === "timestamp") {
      const first = row.words[0]?.word;
      const last = row.words[row.words.length - 1]?.word;
      return <div className="script-table__timestamp" role="gridcell"><code>IN&nbsp;&nbsp;{timecode(first?.start ?? 0)}</code><code>OUT {timecode(last?.end ?? first?.end ?? 0)}</code></div>;
    }
    return <div className="script-table__custom" role="gridcell"><span>Chưa gán</span></div>;
  }

  if (!rows.length) return null;

  return <div className="script-table-shell">
    <div className="script-table-scroll" onScroll={syncScroll} ref={scrollRef}>
      <div aria-label="Bảng Script theo người nói" className="script-table" role="grid" style={{ gridTemplateColumns }}>
        <div className="script-table__header" role="row" style={{ gridTemplateColumns }}>
          {columns.map((column) => <div className="script-table__header-cell" key={column.id} role="columnheader"><b>{column.label}</b><button aria-label={`Kéo rộng cột ${column.label}`} className="script-table__resize" onPointerCancel={endColumnResize} onPointerDown={(event) => beginColumnResize(event, column)} onPointerMove={resizeColumn} onPointerUp={endColumnResize} type="button" />{columns.length > 1 ? <button aria-label={`Xóa cột ${column.label}`} className="script-table__remove" onClick={() => removeColumn(column.id)} type="button">×</button> : null}</div>)}
          <button aria-label="Thêm cột Script" className="script-table__add" onClick={addColumn} title="Thêm cột" type="button">+</button>
        </div>
        {rows.map((row) => <div className={`script-table__row ${row.words.some(({ index }) => index === activeWordIndex) ? "is-active" : ""}`} key={row.id} role="row" style={{ gridTemplateColumns }}>
          {columns.map((column) => <div className="script-table__cell" key={column.id}>{renderCell(row, column)}</div>)}
          <i aria-hidden="true" className="script-table__add-space" />
        </div>)}
      </div>
    </div>
    <div aria-label="Thanh cuộn bảng Script" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(thumb.top)} className={`script-table-scrollbar ${thumb.enabled ? "" : "is-static"}`} onPointerCancel={endScrollbar} onPointerDown={beginScrollbar} onPointerMove={moveScrollbar} onPointerUp={endScrollbar} ref={trackRef} role="scrollbar" tabIndex={0}>
      <i style={{ height: `${thumb.height}%`, top: `${thumb.top}%` }} />
    </div>
    {speakerMenu ? <div className="script-table__word-menu" role="menu" style={{ left: speakerMenu.x, top: speakerMenu.y }}>
      <strong>SPEAKER PROFILE · {speakerMenu.indexes.length} TỪ</strong>
      <button onClick={() => assignProfileToSelectedWords(null)} role="menuitem" type="button">Chưa gán Profile</button>
      {speakers.map((speaker) => <button key={speaker.id} onClick={() => assignProfileToSelectedWords(speaker.id)} role="menuitem" style={{ borderLeftColor: speaker.color }} type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>)}
      <small>CHUYỂN SANG ROW</small>
      {rows.map((row) => <button key={row.id} onClick={() => moveSelectedWordsToRow(row)} role="menuitem" type="button">→ {row.diarizationLabel} · {timecode(row.words[0]?.word.start ?? 0)}</button>)}
    </div> : null}
  </div>;
}
