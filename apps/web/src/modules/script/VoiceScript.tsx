import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

import { usePlaybackWord } from "../../domain/playback-sync";
import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptJob, VoiceScriptRow } from "../../domain/types";
import { EMPTY_SELECTION, selectWord, type WordSelection } from "../../domain/word-selection";
import { VOICE_KIND_LABELS, emptyRow, estimatedSeconds, normalizedRowText, resolveRowVoice, rowTimings, rowsToText, scriptReadiness, textToRows, type VoiceCategory } from "../../domain/voiceScript";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { keepWordInView } from "./script-table";

const CATEGORY_LABELS: Record<VoiceCategory, string> = { clone: "Nhái giọng", train: "Train giọng" };
const ENGINE_LABELS: Record<string, string> = { omnivoice: "OmniVoice", vibevoice: "VibeVoice" };
const GRID = "minmax(150px, 210px) minmax(260px, 1fr) 150px 64px";

interface VoiceScriptProps {
  rows: VoiceScriptRow[];
  onRowsChange: (rows: VoiceScriptRow[]) => void;
  speakers: SpeakerProfile[];
  /** Voices of the kind chosen in Voice Training, the only ones rows may use. */
  voices: ProjectVoice[];
  category: VoiceCategory;
  /** The Voice Output open on the Timeline, when it came from this Script. */
  output: VoiceOutput | null;
  playbackId: string | null;
  defaultSpeakerId?: string | null;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
  job?: VoiceScriptJob | null;
  busy?: boolean;
  onRead: () => void;
  onExport?: (mode: "sentence" | "word" | "table") => void;
  onOpenTraining?: () => void;
}

function timecode(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The Script of Voice Manipulator: typed by the user rather than transcribed,
 * one row per turn, each row read by the voice picked in its Speaker cell.
 * Once read, a row shows its words on the generated audio's timing - the same
 * table, selection and playback highlight footage gets in Speech to Text.
 */
export function VoiceScript({ rows, onRowsChange, speakers, voices, category, output, playbackId, defaultSpeakerId = null, wordSelection = EMPTY_SELECTION, onWordSelectionChange, job = null, busy = false, onRead, onExport, onOpenTraining }: VoiceScriptProps) {
  const activeWordIndex = usePlaybackWord(playbackId);
  const words = output?.words ?? [];
  const timings = useMemo(() => rowTimings(rows, output, voices), [output, rows, voices]);
  const readiness = scriptReadiness(rows, voices);
  const [view, setView] = useState<"table" | "text">("table");
  const [textDraft, setTextDraft] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [voiceMenu, setVoiceMenu] = useState<{ rowId: string; x: number; y: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [fontScale, setFontScale] = useState(100);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusRef = useRef<{ rowId: string; start: number; end: number } | null>(null);
  const [, setFocusTick] = useState(0);
  // The row shown while the Script is empty keeps one id, so typing into it
  // is not interrupted by a re-render handing it a new one.
  const placeholderRef = useRef<VoiceScriptRow>(emptyRow(null));
  const shownRows = rows.length ? rows : [placeholderRef.current];
  const held = useMemo(() => new Set(wordSelection.indexes), [wordSelection.indexes]);
  const speakerOf = (id: string | null | undefined) => speakers.find((speaker) => speaker.id === id) ?? null;
  const usedVoices = new Set(readiness.rows.map((row) => row.voiceId));
  const wordCount = rows.reduce((total, row) => total + (normalizedRowText(row.text) ? normalizedRowText(row.text).split(" ").length : 0), 0);
  const freshOutput = Boolean(output && rows.length && rows.every((row) => !normalizedRowText(row.text) || timings.get(row.id)?.fresh));
  const textStyle = { "--script-format-scale": fontScale / 100, "--script-font-adjust": fontScale / 100, fontWeight: bold ? 700 : undefined, fontStyle: italic ? "italic" : undefined, textDecoration: underline ? "underline" : undefined } as CSSProperties;

  // Editing always goes through the full row list; an empty Script still shows
  // one row to type into, and typing into it makes it real.
  function commit(next: VoiceScriptRow[]) {
    onRowsChange(next);
  }

  function withDefaults(row: VoiceScriptRow): VoiceScriptRow {
    if (row.speakerProfileId || !defaultSpeakerId) return row;
    return { ...row, speakerProfileId: defaultSpeakerId };
  }

  function updateRow(rowId: string, update: Partial<VoiceScriptRow>) {
    const base = rows.length ? rows : shownRows.map(withDefaults);
    commit(base.map((row) => row.id === rowId ? { ...row, ...update } : row));
  }

  function insertAfter(rowId: string | null, text = "", caret = 0) {
    const base = rows.length ? rows : shownRows.map(withDefaults);
    const index = rowId ? base.findIndex((row) => row.id === rowId) : base.length - 1;
    const previous = base[index] ?? base[base.length - 1] ?? null;
    const row = withDefaults(emptyRow(previous, text));
    focusRef.current = { rowId: row.id, start: caret, end: caret };
    setEditingRowId(row.id);
    commit([...base.slice(0, index + 1), row, ...base.slice(index + 1)]);
  }

  function removeRow(rowId: string) {
    const index = rows.findIndex((row) => row.id === rowId);
    if (index < 0) return;
    const previous = rows[index - 1];
    if (previous) focusRef.current = { rowId: previous.id, start: previous.text.length, end: previous.text.length };
    commit(rows.filter((row) => row.id !== rowId));
  }

  function moveRow(rowId: string, direction: -1 | 1) {
    const index = rows.findIndex((row) => row.id === rowId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function handleRowKey(event: ReactKeyboardEvent<HTMLTextAreaElement>, row: VoiceScriptRow) {
    const field = event.currentTarget;
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      // Enter starts the next turn, the way a line break does in a script.
      event.preventDefault();
      const before = row.text.slice(0, field.selectionStart);
      const after = row.text.slice(field.selectionEnd);
      const base = rows.length ? rows : shownRows.map(withDefaults);
      const index = base.findIndex((item) => item.id === row.id);
      const current = { ...(base[index] ?? withDefaults(row)), text: before };
      const created = emptyRow(current, after.trimStart());
      focusRef.current = { rowId: created.id, start: 0, end: 0 };
      setEditingRowId(created.id);
      commit([...base.slice(0, index), current, created, ...base.slice(index + 1)]);
      return;
    }
    if (event.key === "Backspace" && field.selectionStart === 0 && field.selectionEnd === 0) {
      const index = rows.findIndex((item) => item.id === row.id);
      if (index <= 0) return;
      event.preventDefault();
      const previous = rows[index - 1];
      const joined = previous.text && row.text ? `${previous.text} ${row.text}` : previous.text + row.text;
      focusRef.current = { rowId: previous.id, start: previous.text.length, end: previous.text.length };
      setEditingRowId(previous.id);
      commit(rows.flatMap((item, itemIndex) => itemIndex === index ? [] : itemIndex === index - 1 ? [{ ...item, text: joined }] : [item]));
    }
  }

  useLayoutEffect(() => {
    const request = focusRef.current;
    if (!request) return;
    const field = scrollRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-row-id="${request.rowId}"]`);
    if (!field) return;
    focusRef.current = null;
    field.focus();
    field.setSelectionRange(request.start, request.end);
  });

  // Rows grow with what is typed; a fixed height would hide the end of a long turn.
  useLayoutEffect(() => {
    scrollRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea.voice-script__input").forEach((field) => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    });
  });

  useLayoutEffect(() => {
    const view = scrollRef.current;
    if (!view || activeWordIndex < 0) return;
    const target = view.querySelector<HTMLElement>(`[data-script-word-index="${activeWordIndex}"]`);
    if (target) keepWordInView(view, target);
  }, [activeWordIndex]);

  useEffect(() => {
    if (!voiceMenu) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".voice-script__menu") || target?.closest(".voice-script__speaker")) return;
      setVoiceMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setVoiceMenu(null); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [voiceMenu]);

  function openVoiceMenu(event: ReactMouseEvent<HTMLButtonElement>, rowId: string) {
    if (voiceMenu?.rowId === rowId) {
      setVoiceMenu(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setVoiceMenu({ rowId, x: Math.max(8, Math.min(bounds.left, window.innerWidth - 290)), y: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 360)) });
  }

  function pickVoice(voice: ProjectVoice) {
    if (!voiceMenu) return;
    updateRow(voiceMenu.rowId, { voiceId: voice.id, speakerProfileId: voice.speakerProfileId });
    setVoiceMenu(null);
  }

  // ---------- find / replace, over rows in the table and over the text in Text Edit ----------

  const units = view === "table" ? shownRows.map((row) => row.text) : [textDraft];

  function indexIn(text: string, from: number, reverse: boolean) {
    const source = caseSensitive ? text : text.toLocaleLowerCase("vi");
    const query = caseSensitive ? findQuery : findQuery.toLocaleLowerCase("vi");
    return reverse ? source.lastIndexOf(query, from) : source.indexOf(query, from);
  }

  function findNext(reverse = false) {
    if (!findQuery) return;
    if (view === "text") {
      const field = textRef.current;
      if (!field) return;
      let index = indexIn(textDraft, reverse ? Math.max(0, field.selectionStart - 1) : field.selectionEnd, reverse);
      if (index < 0) index = indexIn(textDraft, reverse ? textDraft.length : 0, reverse);
      if (index >= 0) { field.focus(); field.setSelectionRange(index, index + findQuery.length); }
      return;
    }
    const focused = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    const startRow = Math.max(0, shownRows.findIndex((row) => row.id === focused?.dataset.rowId));
    const count = units.length;
    for (let step = 0; step <= count; step += 1) {
      const rowIndex = ((reverse ? startRow - step : startRow + step) % count + count) % count;
      const text = units[rowIndex];
      const from = step === 0 && focused ? (reverse ? Math.max(0, focused.selectionStart - 1) : focused.selectionEnd) : reverse ? text.length : 0;
      const index = indexIn(text, from, reverse);
      if (index >= 0 && !(step === 0 && !focused && reverse)) {
        const row = shownRows[rowIndex];
        focusRef.current = { rowId: row.id, start: index, end: index + findQuery.length };
        setEditingRowId(row.id);
        setFocusTick((tick) => tick + 1);
        return;
      }
    }
  }

  function replaceCurrent() {
    const field = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    if (field && findQuery) {
      const selected = field.value.slice(field.selectionStart, field.selectionEnd);
      const same = caseSensitive ? selected === findQuery : selected.toLocaleLowerCase("vi") === findQuery.toLocaleLowerCase("vi");
      if (same) {
        const next = field.value.slice(0, field.selectionStart) + replaceQuery + field.value.slice(field.selectionEnd);
        const caret = field.selectionStart + replaceQuery.length;
        if (view === "text") changeText(next);
        else if (field.dataset.rowId) {
          focusRef.current = { rowId: field.dataset.rowId, start: caret, end: caret };
          updateRow(field.dataset.rowId, { text: next });
        }
        return;
      }
    }
    findNext();
  }

  function replaceAll() {
    if (!findQuery) return;
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const expression = new RegExp(escaped, caseSensitive ? "gu" : "giu");
    if (view === "text") changeText(textDraft.replace(expression, () => replaceQuery));
    else commit(rows.map((row) => ({ ...row, text: row.text.replace(expression, () => replaceQuery) })));
  }

  function changeText(value: string) {
    setTextDraft(value);
    commit(textToRows(value, speakers, voices, rows));
  }

  function toggleView() {
    if (view === "table") {
      setTextDraft(rowsToText(rows, speakers));
      setView("text");
    } else {
      setView("table");
    }
  }

  // ---------- rendering ----------

  function renderSpeaker(row: VoiceScriptRow, number: number) {
    const voice = resolveRowVoice(row, voices);
    const speaker = speakerOf(voice?.speakerProfileId ?? row.speakerProfileId);
    const color = speaker?.color ?? "var(--text-muted)";
    const detail = voice
      ? `${VOICE_KIND_LABELS[voice.kind]} · ${ENGINE_LABELS[voice.engine] ?? voice.engine}`
      : speaker
        ? `Chưa có voice ${CATEGORY_LABELS[category].toLowerCase()}`
        : "Bấm để chọn voice";
    return <button aria-expanded={voiceMenu?.rowId === row.id} aria-haspopup="menu" aria-label={`Voice đọc đoạn ${number}`} className={`voice-script__speaker ${voice ? "" : "is-missing"}`} onClick={(event) => openVoiceMenu(event, row.id)} type="button">
      <i style={{ background: color }} />
      <span><b style={{ color: speaker ? color : undefined }}>{speaker?.name ?? "Chọn voice"}</b><small>{detail}</small></span>
      <em aria-hidden="true">▾</em>
    </button>;
  }

  function renderContent(row: VoiceScriptRow, number: number) {
    const timing = timings.get(row.id);
    const showWords = Boolean(timing?.fresh && timing.lastWord > timing.firstWord && editingRowId !== row.id);
    if (showWords && timing) {
      return <div className="script-table__content voice-script__words" onDoubleClick={() => { focusRef.current = { rowId: row.id, start: row.text.length, end: row.text.length }; setEditingRowId(row.id); }} role="gridcell" style={textStyle} title="Bấm để chọn từ · Ctrl/Shift để chọn nhiều · double-click để sửa lời thoại">
        {words.slice(timing.firstWord, timing.lastWord).map((word, offset) => {
          const index = timing.firstWord + offset;
          return <span className="script-table__word-wrap" key={`${index}-${word.start}`}>
            <button aria-label={`Chọn từ ${word.text}`} aria-pressed={held.has(index)} className={`script-table__word ${index === activeWordIndex ? "is-active" : ""} ${word.timingTrusted === false ? "is-estimated" : ""}`} data-script-word-index={index} onClick={(event) => onWordSelectionChange?.(selectWord(wordSelection, index, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey }))} type="button">{word.text}</button>{" "}
          </span>;
        })}
      </div>;
    }
    return <div className="script-table__content voice-script__edit" role="gridcell" style={textStyle}>
      <textarea aria-label={`Lời thoại đoạn ${number}`} className="voice-script__input" data-row-id={row.id} onBlur={() => setEditingRowId((current) => current === row.id ? null : current)} onChange={(event) => updateRow(row.id, { text: event.target.value })} onFocus={() => setEditingRowId(row.id)} onKeyDown={(event) => handleRowKey(event, row)} placeholder={number === 1 ? "Nhập lời thoại… Enter để sang đoạn mới" : "Nhập lời thoại…"} rows={1} spellCheck value={row.text} />
    </div>;
  }

  function renderTimestamp(row: VoiceScriptRow) {
    const timing = timings.get(row.id);
    if (job?.status === "running" && job.currentRowId === row.id) {
      return <div className="script-table__timestamp voice-script__timestamp is-reading" role="gridcell"><code>ĐANG ĐỌC…</code><code>{job.done}/{job.total}</code></div>;
    }
    if (timing?.fresh) {
      return <div className="script-table__timestamp" role="gridcell"><code>IN&nbsp;&nbsp;{timecode(timing.start)}</code><code>OUT {timecode(timing.end)}</code></div>;
    }
    return <div className="script-table__timestamp voice-script__timestamp" role="gridcell"><code>IN&nbsp;&nbsp;—</code><code>{timing ? "ĐÃ SỬA · ĐỌC LẠI" : normalizedRowText(row.text) ? "CHƯA ĐỌC" : "—"}</code></div>;
  }

  const menuRow = voiceMenu ? shownRows.find((row) => row.id === voiceMenu.rowId) ?? null : null;
  const menuVoice = menuRow ? resolveRowVoice(menuRow, voices) : null;
  const bySpeaker = speakers
    .map((speaker) => [speaker, voices.filter((voice) => voice.speakerProfileId === speaker.id)] as const)
    .filter(([, items]) => items.length);
  const orphanVoices = voices.filter((voice) => !speakers.some((speaker) => speaker.id === voice.speakerProfileId));
  const duration = freshOutput && output ? output.duration : estimatedSeconds(rows);
  const timingNote = output && freshOutput && output.wordTimingQuality && output.wordTimingQuality !== "source" ? output.wordTimingNote : null;
  const readLabel = busy
    ? job ? `Đang đọc ${Math.min(job.done + 1, job.total)}/${job.total}` : "Đang gửi…"
    : readiness.problem ?? (freshOutput ? "Đọc lại Script" : "Tạo voice");

  return <ModuleFrame action={<div className="script-module__duration"><span>{freshOutput ? "TTS DURATION" : "EST. DURATION"}</span><strong>{clock(duration)}</strong></div>} className="script-module voice-script-module" eyebrow={output ? `VOICE OUTPUT · ${output.name}` : "VOICE SCRIPT · nhập lời thoại"} title="SCRIPT">
    <div className="script-toolbars">
      <div className="script-review-strip">
        <strong>VOICE SCRIPT</strong>
        <span className={`voice-script__category is-${category}`} title="Theo lựa chọn ở Voice Training">{CATEGORY_LABELS[category]}</span>
        <span className="review-status"><i />{busy && job?.message ? ` ${job.message}` : freshOutput ? " Sub chạy theo giọng đã tạo" : " Mỗi dòng một lượt nói · chọn voice ở cột Speaker"}</span>
      </div>
      <div aria-label="Công cụ văn bản" className="script-edit-toolbar">
        <button aria-expanded={findOpen} className={findOpen ? "is-active" : ""} onClick={() => setFindOpen((open) => !open)} type="button">FIND / REPLACE</button>
        <label>SIZE<select aria-label="Cỡ chữ Script" onChange={(event) => setFontScale(Number(event.target.value))} value={fontScale}><option value="85">85%</option><option value="100">100%</option><option value="115">115%</option><option value="130">130%</option><option value="150">150%</option></select></label>
        <button aria-pressed={bold} onClick={() => setBold((value) => !value)} type="button"><b>B</b></button>
        <button aria-pressed={italic} onClick={() => setItalic((value) => !value)} type="button"><i>I</i></button>
        <button aria-pressed={underline} onClick={() => setUnderline((value) => !value)} type="button"><u>U</u></button>
        <button aria-pressed={view === "table"} onClick={toggleView} title="Bảng theo lượt nói, hoặc Text Edit dạng “Tên: lời thoại”" type="button">BẢNG SCRIPT</button>
      </div>
      {timingNote ? <div className="script-timing-warning" role="status">{timingNote}</div> : null}
      {findOpen ? <div aria-label="Tìm và thay thế" className="script-find-replace"><input aria-label="Tìm text" onChange={(event) => setFindQuery(event.target.value)} placeholder="Tìm" value={findQuery} /><input aria-label="Thay bằng text" onChange={(event) => setReplaceQuery(event.target.value)} placeholder="Thay bằng" value={replaceQuery} /><label><input checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} type="checkbox" /> Phân biệt hoa/thường</label><button onClick={() => findNext(true)} type="button">↑</button><button onClick={() => findNext()} type="button">↓</button><button onClick={replaceCurrent} type="button">REPLACE</button><button onClick={replaceAll} type="button">ALL</button></div> : null}
    </div>
    {view === "table" ? <div className="script-table-shell voice-script">
      <div className="script-table-scroll" onPointerDown={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if ((event.target as HTMLElement).closest("[data-script-word-index]")) return;
        if (wordSelection.indexes.length) onWordSelectionChange?.(EMPTY_SELECTION);
      }} ref={scrollRef}>
        <div aria-label="Bảng Script theo lượt nói" className="script-table voice-script__table" role="grid" style={{ gridTemplateColumns: GRID }}>
          <div className="script-table__header" role="row" style={{ gridTemplateColumns: GRID }}>
            <div className="script-table__header-cell" role="columnheader"><b>SPEAKER · VOICE</b></div>
            <div className="script-table__header-cell" role="columnheader"><b>NỘI DUNG</b></div>
            <div className="script-table__header-cell" role="columnheader"><b>TIMESTAMP</b></div>
            <div className="script-table__header-cell" role="columnheader"><b>&nbsp;</b></div>
          </div>
          {shownRows.map((row, index) => {
            const timing = timings.get(row.id);
            const active = Boolean(timing?.fresh && activeWordIndex >= timing.firstWord && activeWordIndex < timing.lastWord);
            return <div className={`script-table__row ${active ? "is-active" : ""} ${job?.status === "running" && job.currentRowId === row.id ? "is-reading" : ""}`} data-script-row-id={row.id} key={row.id} role="row" style={{ gridTemplateColumns: GRID }}>
              <div className="script-table__cell">{renderSpeaker(row, index + 1)}</div>
              <div className="script-table__cell">{renderContent(row, index + 1)}</div>
              <div className="script-table__cell">{renderTimestamp(row)}</div>
              <div className="script-table__cell voice-script__row-actions">
                <button aria-label={`Đưa đoạn ${index + 1} lên`} disabled={index === 0 || !rows.length} onClick={() => moveRow(row.id, -1)} type="button">↑</button>
                <button aria-label={`Đưa đoạn ${index + 1} xuống`} disabled={index >= rows.length - 1} onClick={() => moveRow(row.id, 1)} type="button">↓</button>
                <button aria-label={`Xoá đoạn ${index + 1}`} disabled={!rows.length} onClick={() => removeRow(row.id)} type="button">×</button>
              </div>
            </div>;
          })}
          <button className="voice-script__add" onClick={() => insertAfter(shownRows[shownRows.length - 1]?.id ?? null)} type="button"><Icon name="plus" />THÊM ĐOẠN</button>
        </div>
      </div>
    </div> : <div className="script-editor-stack voice-script__text" style={textStyle}>
      <textarea aria-label="Script dạng văn bản" className="script-editor" onChange={(event) => changeText(event.target.value)} placeholder={"Anh Vũ: Xin chào mọi người\nKhoa Trịnh: Chào anh"} ref={textRef} spellCheck value={textDraft} />
    </div>}

    {voiceMenu ? <div className="script-table__word-menu voice-script__menu" onPointerDown={(event) => event.stopPropagation()} role="menu" style={{ left: voiceMenu.x, top: voiceMenu.y }}>
      <strong>VOICE ĐỌC ĐOẠN {shownRows.findIndex((row) => row.id === voiceMenu.rowId) + 1} · {CATEGORY_LABELS[category].toUpperCase()}</strong>
      {[...bySpeaker, ...(orphanVoices.length ? [[null, orphanVoices] as const] : [])].map(([speaker, items]) => <div className="voice-script__menu-group" key={speaker?.id ?? "other"}>
        <small>{speaker?.name ?? "Khác"}</small>
        {items.map((voice) => <button aria-checked={menuVoice?.id === voice.id} key={voice.id} onClick={() => pickVoice(voice)} role="menuitemradio" style={{ borderLeftColor: speaker?.color }} type="button"><i style={{ background: speaker?.color ?? "var(--text-muted)" }} /><span><b>{VOICE_KIND_LABELS[voice.kind]} · {ENGINE_LABELS[voice.engine] ?? voice.engine}</b><em>{voice.referenceSeconds.toFixed(1)}s mẫu · {new Date(voice.createdAt).toLocaleDateString("vi-VN")}</em></span></button>)}
      </div>)}
      {!voices.length ? <div className="voice-script__menu-empty"><span>Chưa có voice dạng {CATEGORY_LABELS[category].toLowerCase()}. Tạo ở Voice Training: chọn dạng, tick Speaker Profile rồi bấm Bắt đầu.</span>{onOpenTraining ? <button onClick={() => { setVoiceMenu(null); onOpenTraining(); }} type="button">Mở Voice Training</button> : null}</div> : null}
      <button className="voice-script__menu-close" onClick={() => setVoiceMenu(null)} type="button">Đóng</button>
    </div> : null}

    <div className="script-module__footer">
      <div className="script-stats"><span><b>{rows.filter((row) => normalizedRowText(row.text)).length}</b> đoạn</span><span><b>{usedVoices.size}</b> voice</span><span><b>{wordCount}</b> từ</span></div>
      <div className="script-actions">
        {output && words.length && onExport ? <span className="script-export"><button aria-expanded={exportOpen} className="button button--quiet" onClick={() => setExportOpen((open) => !open)} type="button">EXPORT ▾</button>{exportOpen ? <div className="script-export__menu" role="menu"><button onClick={() => { setExportOpen(false); onExport("sentence"); }} role="menuitem" type="button"><b>Theo câu</b><small>Dễ đọc · tối đa 2 dòng</small></button><button onClick={() => { setExportOpen(false); onExport("word"); }} role="menuitem" type="button"><b>Từng từ</b><small>Timestamp theo giọng đã tạo</small></button><button onClick={() => { setExportOpen(false); onExport("table"); }} role="menuitem" type="button"><b>Bảng Script CSV</b><small>Speaker · nội dung · start · end</small></button></div> : null}</span> : null}
        <button aria-label="Tạo voice" className="button button--accent" disabled={busy || Boolean(readiness.problem)} onClick={onRead} type="button"><span><b>{readLabel}</b><small>{readiness.rows.length} đoạn · {usedVoices.size} voice · {CATEGORY_LABELS[category]}</small></span><Icon name="arrow" /></button>
      </div>
    </div>
  </ModuleFrame>;
}
