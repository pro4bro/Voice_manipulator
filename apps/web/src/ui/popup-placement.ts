export interface PopupViewport { left: number; top: number; width: number; height: number }
export interface PopupAnchor { left: number; right: number; top: number }

/** Client coordinates in the visible viewport, independent of module overflow. */
export function placePopup(point: { x: number; y: number }, size: { width: number; height: number }, viewport: PopupViewport, anchor?: PopupAnchor) {
  const margin = Math.min(8, viewport.width / 2, viewport.height / 2);
  const leftEdge = viewport.left + margin, topEdge = viewport.top + margin;
  const rightEdge = viewport.left + viewport.width - margin, bottomEdge = viewport.top + viewport.height - margin;
  const width = Math.min(size.width, Math.max(0, rightEdge - leftEdge));
  const height = Math.min(size.height, Math.max(0, bottomEdge - topEdge));
  let left = point.x + width > rightEdge ? point.x - width : point.x;
  let top = point.y + height > bottomEdge ? point.y - height : point.y;
  let side: "left" | "right" = "right";
  if (anchor) {
    const right = anchor.right + 4, before = anchor.left - width - 4;
    side = right + width <= rightEdge ? "right" : before >= leftEdge ? "left"
      : rightEdge - anchor.right >= anchor.left - leftEdge ? "right" : "left";
    left = side === "right" ? right : before;
    top = anchor.top;
  }
  return { left: Math.max(leftEdge, Math.min(left, rightEdge - width)), top: Math.max(topEdge, Math.min(top, bottomEdge - height)), side };
}

export function popupViewport(): PopupViewport {
  const view = window.visualViewport;
  return { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0,
    width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight };
}
