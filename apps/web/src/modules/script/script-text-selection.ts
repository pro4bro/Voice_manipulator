import { editableText, scriptTextOffset } from "./script-text-dom";

const ROW_SELECTOR = "[data-script-text-row]";
const SPEAKER_SELECTOR = "[data-script-text-speaker]";
const DIALOGUE_SELECTOR = "[data-script-text-dialogue]";

function closestWithin(root: HTMLElement, node: Node | null, selector: string) {
  const element = node instanceof Element ? node : node?.parentElement;
  const match = element?.closest<HTMLElement>(selector) ?? null;
  return match && root.contains(match) ? match : null;
}

function selectedText(range: Range, element: HTMLElement) {
  const local = document.createRange();
  local.selectNodeContents(element);
  const intersect = local.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, local) > 0) intersect.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, local) < 0) intersect.setEnd(range.endContainer, range.endOffset);
  const text = editableText(element);
  return text.slice(scriptTextOffset(element, intersect.startContainer, intersect.startOffset), scriptTextOffset(element, intersect.endContainer, intersect.endOffset));
}

/** Serialize a browser Selection without copying speaker labels between dialogue endpoints. */
export function serializeScriptTextSelection(root: HTMLElement, selection: Selection | null) {
  if (!selection?.rangeCount || selection.isCollapsed) return "";
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return "";

  const startSpeaker = closestWithin(root, range.startContainer, SPEAKER_SELECTOR);
  const endSpeaker = closestWithin(root, range.endContainer, SPEAKER_SELECTOR);
  const startDialogue = closestWithin(root, range.startContainer, DIALOGUE_SELECTOR);
  const endDialogue = closestWithin(root, range.endContainer, DIALOGUE_SELECTOR);
  const includeSpeakers = !(startDialogue && endDialogue) || Boolean(startSpeaker || endSpeaker);
  const rowElements = [...root.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
  const startRow = closestWithin(root, range.startContainer, ROW_SELECTOR);
  const endRow = closestWithin(root, range.endContainer, ROW_SELECTOR);
  const startIndex = rowElements.indexOf(startRow!);
  const endIndex = rowElements.indexOf(endRow!);
  const firstIndex = startIndex < 0 || endIndex < 0 ? -1 : Math.min(startIndex, endIndex);
  const lastIndex = startIndex < 0 || endIndex < 0 ? -1 : Math.max(startIndex, endIndex);

  const fragments = rowElements.flatMap((row, index) => {
    if (!range.intersectsNode(row)) return [];
    const speaker = row.querySelector<HTMLElement>(SPEAKER_SELECTOR);
    const dialogue = row.querySelector<HTMLElement>(DIALOGUE_SELECTOR);
    if (!dialogue) return [];
    const text = range.intersectsNode(dialogue) ? selectedText(range, dialogue) : "";
    const speakerSelected = Boolean(speaker && range.intersectsNode(speaker));
    const intermediateRow = firstIndex >= 0 && index > firstIndex && index < lastIndex;
    if (!text && !(includeSpeakers && speakerSelected) && !intermediateRow) return [];
    return [includeSpeakers ? `${speaker?.dataset.scriptTextCopyLabel?.trim() ?? ""}: ${text}` : text];
  });
  return fragments.join("\n");
}
