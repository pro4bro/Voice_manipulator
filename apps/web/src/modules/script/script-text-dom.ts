/** Read browser editing markup with the same newline coordinates as saved text. */
export function editableText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLBRElement) return "\n";
  let text = "";
  let previousBlock = false;
  for (const child of [...node.childNodes]) {
    const block = child instanceof HTMLElement && ["DIV", "P"].includes(child.tagName);
    if ((block || previousBlock) && text && !text.endsWith("\n")) text += "\n";
    text += editableText(child);
    previousBlock = block;
  }
  return text;
}

export function scriptTextOffset(cell: HTMLElement, node: Node, offset: number) {
  const prefix = document.createRange();
  prefix.selectNodeContents(cell);
  prefix.setEnd(node, offset);
  return editableText(prefix.cloneContents()).length;
}

export function scriptTextPosition(cell: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof HTMLBRElement) {
      const parent = node.parentNode!;
      const index = [...parent.childNodes].indexOf(node);
      const start = scriptTextOffset(cell, parent, index);
      if (offset <= start + 1) return [parent, offset <= start ? index : index + 1];
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const start = scriptTextOffset(cell, node, 0);
    const size = node.textContent?.length ?? 0;
    if (offset <= start + size) return [node, Math.max(0, offset - start)];
  }
  return [cell, cell.childNodes.length];
}
