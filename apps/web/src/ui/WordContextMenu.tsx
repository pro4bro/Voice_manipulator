import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { placePopup, popupViewport } from "./popup-placement";
import { readableColor } from "../domain/accessible-color";
import { useContrastPalette } from "./color-theme";
import "./word-context-menu.css";

const Owner = createContext({ id: "", layout: "" });
function owned(target: EventTarget | null, owner: string) {
  return target instanceof Element && target.closest("[data-word-menu-owner]")?.getAttribute("data-word-menu-owner") === owner;
}
function usePosition(ref: RefObject<HTMLDivElement | null>, x: number, y: number, trigger?: RefObject<HTMLButtonElement | null>, active = true, anchorLayout = "") {
  const [position, setPosition] = useState({ left: x, top: y, side: "right" as "left" | "right", maxWidth: 0, maxHeight: 0 });
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      const node = ref.current;
      if (!node) return;
      const viewport = popupViewport(), rect = node.getBoundingClientRect();
      const next = { ...placePopup({ x, y }, rect, viewport, trigger?.current?.getBoundingClientRect()),
        maxWidth: Math.max(1, viewport.width - 16), maxHeight: Math.max(1, viewport.height - 16) };
      setPosition((previous) => Object.keys(next).every((key) => next[key as keyof typeof next] === previous[key as keyof typeof previous]) ? previous : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (ref.current) observer?.observe(ref.current);
    if (trigger?.current) observer?.observe(trigger.current);
    window.addEventListener("resize", update);
    if (trigger) document.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update);
      if (trigger) document.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); };
  }, [ref, x, y, trigger, active, anchorLayout]);
  return { side: position.side, style: { left: position.left, top: position.top,
    maxWidth: position.maxWidth || "calc(100vw - 16px)", maxHeight: position.maxHeight || "calc(100dvh - 16px)" } };
}
function navigate(event: KeyboardEvent<HTMLDivElement>) {
  if (event.defaultPrevented || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled]), button:not([disabled])"))
    .filter((item) => item.closest("[role='menu']") === event.currentTarget);
  if (!items.length || (event.target instanceof Element && event.target.closest("input, textarea"))) return;
  event.preventDefault(); event.stopPropagation();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
    : (current + (event.key === "ArrowUp" ? items.length - 1 : 1)) % items.length;
  items[next]?.focus({ preventScroll: true });
}

type MenuProps = Omit<HTMLAttributes<HTMLDivElement>, "style" | "onKeyDown" | "role"> & { x: number; y: number; onClose: () => void };
export function WordContextMenu({ x, y, className = "", onClose, children, onPointerDown, ...attributes }: MenuProps) {
  const owner = useId(), ref = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  const { style: position } = usePosition(ref, x, y);
  const origin = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    // A pointer-opened native text menu must not commit the draft by blurring it.
    if (origin.current?.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) return;
    ref.current?.querySelector<HTMLElement>("button:not([disabled]), [role='menuitem']:not([disabled])")?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const pointer = (event: PointerEvent) => { if (!owned(event.target, owner)) close.current(); };
    const scroll = (event: Event) => { if (event.target instanceof Element && !owned(event.target, owner)) close.current(); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape") { event.preventDefault(); close.current(); origin.current?.focus({ preventScroll: true }); }
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("scroll", scroll, true); document.removeEventListener("keydown", escape); };
  }, [owner]);
  return createPortal(<Owner.Provider value={{ id: owner, layout: `${position.left}:${position.top}` }}><div {...attributes} className={`${className} word-context-menu`} data-word-menu-owner={owner}
    ref={ref} role="menu" style={{ position: "fixed", ...position }} onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(event); }}
    onKeyDown={(event) => { if (!event.defaultPrevented && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); origin.current?.focus({ preventScroll: true }); } else navigate(event); }}>
    {children}
  </div></Owner.Provider>, document.body);
}

const commonNotes = [
  ["selection", "Nền hồng", "Từ hoặc đoạn đang được chọn. Không thay đổi Speaker hay cảm xúc."],
  ["active", "Nền xanh nhạt", "Từ tại vị trí playhead, dùng để theo dõi lời nói."],
  ["warning", "Viền vàng/cam hoặc nét đứt", "Timing chưa được xác nhận; cần đối chiếu waveform."],
];
const notes = {
  subtitle: [
    ["speaker", "Vạch dưới màu Speaker", "Màu của Speaker Profile đã gán hoặc kế thừa từ footage. Không dùng màu Speaker để tô nền từ mới."],
    ["manual", "Chữ xanh", "Text do người dùng thêm hoặc sửa; giữ màu phân loại ngay cả khi chọn. Không có nghĩa timing đã khớp âm thanh."],
    ...commonNotes,
    ["collision", "Nền cam/đỏ", "Các khoảng timing đang lấn nhau; cần kiểm tra IN/OUT."],
    ["plain", "Ô hẹp không có chữ", "Timeline đang thu nhỏ; phóng to để đọc từng từ và chỉnh timing."],
  ],
  script: [
    ["speaker", "Màu Speaker", "Dấu màu và nhóm người nói cho biết Speaker Profile; khác với màu phân loại text."],
    ["manual", "Bản sửa thủ công", "Nền xanh lam/chữ trắng trong bảng và Review; Text Edit có thể dùng gạch chân để đánh dấu text đã sửa."],
    ["stt", "Nền vàng trong đối chiếu", "Phương án Speech to Text hoặc nội dung được cập nhật từ bản nhận diện kỹ."],
    ["ai", "Nền xanh lá trong đối chiếu", "Phương án AI đề xuất; người dùng chọn giữ STT, dùng AI hoặc sửa tay."],
    ...commonNotes,
    ["plain", "Gạch ngang · B / I / U", "Gạch ngang ở đối chiếu realtime là text đã thay. B/I/U là định dạng đậm, nghiêng, gạch chân do người dùng đặt."],
    ["plain", "Định dạng cảm xúc", "Màu/chữ/nền theo nhãn emotion và cấu hình hiển thị; không xác định người nói."],
  ],
};
export function WordNoteItem({ module }: { module: "script" | "subtitle" }) {
  const owner = useContext(Owner), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), id = useId();
  const contrast = useContrastPalette(), manualInk = readableColor("#1a5fa7", contrast.field);
  const [open, setOpen] = useState(false), [focusOnOpen, setFocusOnOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const leave = () => { clear(); timer.current = setTimeout(() => setOpen(false), 160); };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const { side, style: position } = usePosition(panel, 0, 0, trigger, open, owner.layout);
  useLayoutEffect(() => { if (open && focusOnOpen) { panel.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus({ preventScroll: true }); setFocusOnOpen(false); } }, [open, focusOnOpen]);
  return <><button type="button" role="menuitem" className="word-note-trigger" aria-label="Note" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
    ref={trigger} onPointerDown={(event) => event.preventDefault()} onPointerEnter={() => { clear(); setOpen(true); }} onPointerLeave={leave} onClick={() => { clear(); setOpen(true); }}
    onKeyDown={(event) => { if (["ArrowRight", "Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); clear(); setFocusOnOpen(true); setOpen(true); } }}>
    Note <span aria-hidden="true">›</span>
  </button>{open ? createPortal(<div id={id} role="menu" aria-label={`Note — ${module === "subtitle" ? "Subtitle" : "Script"}`} className="word-note-menu word-context-menu"
    data-word-menu-owner={owner.id} data-side={side} ref={panel} style={{ position: "fixed", ...position }}
    onPointerEnter={clear} onPointerLeave={leave} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={(event) => { if (["Escape", "ArrowLeft"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); clear(); setOpen(false); trigger.current?.focus({ preventScroll: true }); } else navigate(event); }}>
    <strong>CHÚ THÍCH · {module === "subtitle" ? "SUBTITLE" : "SCRIPT"}</strong>
    {notes[module].map(([kind, label, description]) => <div role="menuitem" aria-disabled="true" tabIndex={-1} className="word-note-row" key={label}>
      <i aria-hidden="true" className={`word-note-swatch word-note-swatch--${kind === "manual" && module === "subtitle" ? "manual-text" : kind}`}
        style={kind === "manual" && module === "subtitle" ? { color: manualInk, backgroundColor: contrast.field } : undefined}>{kind === "manual" && module === "subtitle" ? "A" : null}</i><div><b>{label}</b><p>{description}</p></div>
    </div>)}
    <small>Trạng thái chọn, playhead và cảnh báo có thể ưu tiên nền. Độ sáng chữ tự điều chỉnh theo theme để dễ đọc.</small>
  </div>, document.body) : null}</>;
}
