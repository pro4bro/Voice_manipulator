import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { deleteScriptWordText } from "./script-text-reconciliation";
import { useScriptWordDeletion } from "./use-script-word-deletion";

class DeletionWorker {
  static instances: DeletionWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  packet!: { text: string; indexes: number[]; wordTexts: string[] };
  constructor() { DeletionWorker.instances.push(this); }
  postMessage(packet: typeof this.packet) { this.packet = packet; }
  terminate() { this.terminated = true; }
  deliver(text = deleteScriptWordText(this.packet.text, this.packet.indexes, this.packet.wordTexts.map((word) => ({ text: word })))) {
    this.onmessage?.({ data: { text } } as MessageEvent);
  }
}
const words = Array.from({ length: 2000 }, (_, index) => ({ text: `word${index}`, start: index, end: index + .5, speakerId: "one" }));
const text = words.map((word) => word.text).join(" ");
afterEach(() => { vi.unstubAllGlobals(); DeletionWorker.instances = []; });

it("returns to the UI before processing a large deletion and commits surviving identities once", () => {
  vi.stubGlobal("Worker", DeletionWorker);
  const commit = vi.fn();
  const { result } = renderHook(() => useScriptWordDeletion("one", text, words, commit));
  act(() => { expect(result.current.remove([0, 2])).toBe(true); });
  expect(result.current.busy).toBe(true); expect(commit).not.toHaveBeenCalled();
  const worker = DeletionWorker.instances[0];
  expect(worker.packet.wordTexts[0]).toBe("word0");
  expect(worker.packet).not.toHaveProperty("words");
  act(() => { expect(result.current.remove([3])).toBe(false); worker.deliver(); });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].words[0]).toBe(words[1]);
  expect(commit.mock.calls[0][0].words[1]).toBe(words[3]);
  expect(result.current.busy).toBe(false); expect(worker.terminated).toBe(true);
});

it("cancels on navigation or newer text and ignores a delayed worker response", () => {
  vi.stubGlobal("Worker", DeletionWorker);
  const commit = vi.fn();
  const { result, rerender, unmount } = renderHook(({ id, value }) => useScriptWordDeletion(id, value, words, commit), { initialProps: { id: "one", value: text } });
  act(() => { result.current.remove([0]); });
  const first = DeletionWorker.instances[0];
  rerender({ id: "two", value: text });
  act(() => { first.deliver(); });
  expect(commit).not.toHaveBeenCalled(); expect(first.terminated).toBe(true);
  act(() => { result.current.remove([1]); });
  const second = DeletionWorker.instances[1];
  rerender({ id: "two", value: "newer text" });
  act(() => { second.deliver(); });
  expect(commit).not.toHaveBeenCalled(); expect(second.terminated).toBe(true);
  act(() => { result.current.remove([0]); });
  const third = DeletionWorker.instances[2]; unmount();
  act(() => { third.deliver(null); });
  expect(commit).not.toHaveBeenCalled(); expect(third.terminated).toBe(true);
});

it("retains Script and exposes a retryable error if the worker fails", () => {
  vi.stubGlobal("Worker", DeletionWorker);
  const commit = vi.fn();
  const { result } = renderHook(() => useScriptWordDeletion("one", text, words, commit));
  act(() => { result.current.remove([0]); DeletionWorker.instances[0].onerror?.(); });
  expect(commit).not.toHaveBeenCalled(); expect(result.current.busy).toBe(false);
  expect(result.current.error).toContain("Script vẫn được giữ nguyên");
  act(() => { expect(result.current.remove([0])).toBe(true); DeletionWorker.instances[1].deliver(null); });
  expect(commit).not.toHaveBeenCalled(); expect(result.current.error).toContain("không khớp");
});
