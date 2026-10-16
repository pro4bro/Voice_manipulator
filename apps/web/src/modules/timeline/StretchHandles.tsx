import { useEffect, useRef, type PointerEvent } from "react";
import { mapStretchTime, stretchFromDrag, type StretchOperation, type VoiceEditController } from "../../domain/voice-edits";
import type { WordSelection } from "../../domain/word-selection";
import type { SelectionRange } from "../../domain/production-selection";

interface Props {
  controller: VoiceEditController;
  ranges: SelectionRange[];
  selection: WordSelection;
  onSelectionChange?: (selection: WordSelection) => void;
  duration: number;
  canvasWidth: number;
  onSuspend: () => void;
  onPrepare?: (operation: StretchOperation) => void;
  onRevert?: () => void;
  onComplete?: (samePreview: boolean) => void;
}

export function StretchHandles({ controller, ranges, selection, onSelectionChange, duration, canvasWidth, onSuspend, onPrepare, onRevert, onComplete }: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  const current = useRef(controller); current.current = controller;
  const mounted = useRef(true), gestureId = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; gestureId.current += 1; cleanup.current?.(); current.current.cancel(); }; }, []);
  if (!controller.packet) return null;
  function begin(event: PointerEvent<HTMLButtonElement>, range: SelectionRange, edge: "left" | "right") {
    if (!event.ctrlKey || event.button !== 0 || current.current.busy) return;
    event.preventDefault(); event.stopPropagation(); onSuspend();
    const id = ++gestureId.current, ownerOutputId = controller.packet!.document.outputId;
    const ownsGesture = () => mounted.current && gestureId.current === id && current.current.packet?.document.outputId === ownerOutputId;
    const originX = event.clientX, baseline = selection, rate = controller.packet!.document.sampleRate;
    let operation: StretchOperation | null = null, timer = 0, inFlight = false, stopped = false;
    let lastPreview: StretchOperation | null = null;
    const publishSelection = (op: StretchOperation) => onSelectionChange?.({ ...baseline,
      ranges: ranges.map((r) => ({ ...r, start: mapStretchTime(r.start, op, rate), end: mapStretchTime(r.end, op, rate) })) });
    async function preview() {
      if (stopped || inFlight || !operation) return;
      const request = operation; inFlight = true;
      onPrepare?.(request);
      const accepted = await current.current.preview(request);
      inFlight = false;
      if (!stopped && ownsGesture() && request === operation && accepted) { lastPreview = request; publishSelection(request); }
      if (!stopped && ownsGesture() && request === operation && !accepted) onRevert?.();
      if (!stopped && ownsGesture() && request !== operation) { window.clearTimeout(timer); timer = window.setTimeout(() => void preview(), 0); }
    }
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      operation = stretchFromDrag(range.start, range.end, (e.clientX - originX) * duration / Math.max(1, canvasWidth), edge, rate);
      window.clearTimeout(timer); timer = window.setTimeout(() => void preview(), 180);
    };
    const remove = () => {
      stopped = true; window.clearTimeout(timer);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", pointerCancel); window.removeEventListener("keydown", escape);
      cleanup.current = null;
    };
    const cancel = (notify = true) => { remove(); if (gestureId.current === id) gestureId.current += 1; if (notify) { onRevert?.(); onSelectionChange?.(baseline); } current.current.cancel(); };
    const pointerCancel = () => cancel();
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    const finish = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const final = operation; remove();
      if (!ownsGesture()) return;
      if (final) { if (final !== lastPreview) onPrepare?.(final); void current.current.commit(final).then((accepted) => { if (!ownsGesture()) return; if (accepted) { publishSelection(final); onComplete?.(final === lastPreview); } else { onRevert?.(); onSelectionChange?.(baseline); } }); }
      else { onRevert?.(); current.current.cancel(); }
    };
    cleanup.current = () => cancel(false);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", pointerCancel); window.addEventListener("keydown", escape);
  }
  return <>
    {ranges.map((range) => <div className="stretch-handles" key={range.id} style={{ left: `${range.start / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }}>
      {(["left", "right"] as const).map((edge) => <button key={edge} type="button" className={`stretch-handle is-${edge}`} aria-label={`Giãn vùng ${range.id} từ ${edge === "left" ? "đầu" : "cuối"}`} title="Ctrl + kéo để đổi thời lượng; đầu khối giữ vị trí, phần sau tự dịch" onPointerDown={(e) => begin(e, range, edge)}>↔</button>)}
    </div>)}
  </>;
}
