import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { VoiceCollections } from "./VoiceCollections";

export function CollectionDialog({ onClose, ...props }: ComponentProps<typeof VoiceCollections> & { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    const overlay = dialog.current?.parentElement;
    const siblings = [...document.body.children].filter((element) => element !== overlay && element instanceof HTMLElement) as HTMLElement[];
    const inertState = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { siblings.forEach((element, index) => { element.inert = inertState[index]; }); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="voice-collection-overlay"><div aria-label="Quản lý Voice Collection" aria-modal="true" className="voice-collection-dialog" ref={dialog} role="dialog" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); if (!busy) onClose(); }
    if (event.key !== "Tab") return;
    const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])];
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><button className="button button--quiet" disabled={busy} onClick={onClose} type="button">Đóng</button><VoiceCollections {...props} onBusyChange={setBusy} /></div></div>, document.body);
}
