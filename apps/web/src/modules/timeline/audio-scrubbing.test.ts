import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioScrubber } from "./audio-scrubbing";

function audio(duration = 60) {
  const element = document.createElement("audio");
  Object.defineProperty(element, "duration", { value: duration });
  Object.defineProperty(element, "play", { value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(element, "pause", { value: vi.fn() });
  return element;
}

describe("audio pointer previews", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([["start", 10], ["center", 9.94], ["end", 9.88]] as const)("anchors the preview at %s and keeps repeating while held", async (position, start) => {
    const element = audio(); const scrubber = new AudioScrubber();
    scrubber.position = position;
    scrubber.begin([element]); scrubber.move(10);
    expect(element.currentTime).toBeCloseTo(start);
    expect(scrubber.range).toEqual({ start, end: start + .12 });
    await vi.advanceTimersByTimeAsync(370);
    expect(element.play).toHaveBeenCalledTimes(4);
    expect(element.currentTime).toBeCloseTo(start);
    scrubber.end();
    expect(element.currentTime).toBe(10);
    expect(scrubber.range).toBeNull();
    const count = vi.mocked(element.play).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(element.play).toHaveBeenCalledTimes(count);
  });

  it("clips a centered preview to both removed boundaries and never loops excluded audio", async () => {
    const element = audio(); const scrubber = new AudioScrubber(); scrubber.position = "center";
    scrubber.begin([element], (time) => time >= 5 && time < 10, () => 10, () => 5);
    scrubber.move(5.02);
    expect(scrubber.range?.start).toBe(5);
    expect(scrubber.range?.end).toBeCloseTo(5.08);
    expect(element.currentTime).toBe(5);
    await vi.advanceTimersByTimeAsync(250);
    expect(element.play).toHaveBeenCalledTimes(4);
    scrubber.move(10);
    expect(scrubber.range).toBeNull();
    const count = vi.mocked(element.play).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(element.play).toHaveBeenCalledTimes(count);
    scrubber.end();
  });

  it("bounds repeat work for a sub-millisecond fragment at the source end", async () => {
    const element = audio(); const scrubber = new AudioScrubber();
    scrubber.begin([element]); scrubber.move(59.9999);
    await vi.advanceTimersByTimeAsync(10);
    expect(vi.mocked(element.play).mock.calls.length).toBeLessThanOrEqual(11);
    scrubber.end();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not truncate an unloaded long track to another channel's shorter duration", () => {
    const short = audio(2), loading = audio(NaN);
    const scrubber = new AudioScrubber(); scrubber.position = "end";
    scrubber.begin([short, loading], () => true, () => 8); scrubber.move(5);
    expect(scrubber.range).toEqual({ start: 4.88, end: 5 });
    expect(short.play).not.toHaveBeenCalled();
    expect(loading.play).toHaveBeenCalledOnce();
    scrubber.end();
  });

  it("coalesces movement to the latest pointer, repeats held audio and restores rate without changing volume", async () => {
    const element = audio(); element.volume = .4; element.playbackRate = 1.5;
    const scrubber = new AudioScrubber(); scrubber.begin([element]);
    scrubber.move(1); scrubber.move(2); scrubber.move(3);
    expect(element.currentTime).toBe(1);
    await vi.advanceTimersByTimeAsync(40);
    expect(element.currentTime).toBe(3);
    expect(element.play).toHaveBeenCalledTimes(2);
    expect(element.playbackRate).toBe(1);
    expect(element.volume).toBe(.4);
    await vi.advanceTimersByTimeAsync(120);
    expect(element.pause).toHaveBeenCalledTimes(2);
    scrubber.end();
    expect(element.currentTime).toBe(3);
    expect(element.playbackRate).toBe(1.5);
  });

  it("waits for an in-flight seek, then plays only at the newest pointer position", () => {
    const element = audio();
    let seeking = true;
    Object.defineProperty(element, "seeking", { get: () => seeking });
    const scrubber = new AudioScrubber(); scrubber.begin([element]);
    scrubber.move(2); scrubber.move(8);
    expect(element.play).not.toHaveBeenCalled();
    seeking = false; element.dispatchEvent(new Event("seeked"));
    expect(element.currentTime).toBe(8);
    expect(element.play).toHaveBeenCalledTimes(1);
    scrubber.end();
  });

  it("previews all channels and keeps excluded ranges silent even with a pending movement", async () => {
    const first = audio(), second = audio(); second.volume = 0;
    const scrubber = new AudioScrubber(); scrubber.begin([first, second], (time) => time < 5 || time >= 10);
    scrubber.move(2); scrubber.move(3); scrubber.move(7);
    await vi.advanceTimersByTimeAsync(200);
    expect(first.play).toHaveBeenCalledTimes(1);
    expect(second.play).toHaveBeenCalledTimes(1);
    expect(second.volume).toBe(0);
    scrubber.end();
    expect(first.currentTime).toBe(7);
    expect(second.currentTime).toBe(7);
  });

  it("fences a delayed play after release and detaches seek callbacks", async () => {
    const element = audio(); let finish!: () => void;
    vi.mocked(element.play).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const scrubber = new AudioScrubber(); scrubber.begin([element]); scrubber.move(4); scrubber.end();
    finish(); await Promise.resolve();
    expect(element.pause).toHaveBeenCalledTimes(3);
    element.dispatchEvent(new Event("seeked"));
    await vi.advanceTimersByTimeAsync(200);
    expect(element.play).toHaveBeenCalledTimes(1);
    expect(scrubber.active).toBe(false);
  });

  it("ends a preview at the next excluded boundary instead of playing into removed audio", async () => {
    const element = audio(); const scrubber = new AudioScrubber();
    scrubber.begin([element], (time) => time < 5, () => 5);
    scrubber.move(4.95);
    await vi.advanceTimersByTimeAsync(51);
    expect(element.pause).toHaveBeenCalledTimes(2);
    scrubber.end();
  });

  it("does not restart media by playing an empty preview at the source endpoint", async () => {
    const element = audio();
    // Browsers restart an ended media element from zero when play() is called.
    vi.mocked(element.play).mockImplementation(async () => { if (element.currentTime >= element.duration) element.currentTime = 0; });
    const scrubber = new AudioScrubber(); scrubber.begin([element]);
    scrubber.move(60);
    element.dispatchEvent(new Event("seeked"));
    await vi.advanceTimersByTimeAsync(200);
    expect(element.play).not.toHaveBeenCalled();
    expect(element.currentTime).toBe(60);
    scrubber.end();
    expect(element.currentTime).toBe(60);
  });

  it("does not let a previous delayed play pause a newer drag of the same channel", async () => {
    const element = audio(); let finish!: () => void;
    vi.mocked(element.play).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const scrubber = new AudioScrubber(); scrubber.begin([element]); scrubber.move(1); scrubber.end();
    scrubber.begin([element]); scrubber.move(9);
    const pauses = vi.mocked(element.pause).mock.calls.length;
    finish(); await Promise.resolve();
    expect(element.pause).toHaveBeenCalledTimes(pauses);
    expect(element.currentTime).toBe(9);
    scrubber.end();
  });

  it("keeps a late play silent after the pointer enters excluded audio", async () => {
    const element = audio(); let finish!: () => void;
    vi.mocked(element.play).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const scrubber = new AudioScrubber(); scrubber.begin([element], (time) => time < 5);
    scrubber.move(2); scrubber.move(7);
    const pauses = vi.mocked(element.pause).mock.calls.length;
    finish(); await Promise.resolve();
    expect(element.pause).toHaveBeenCalledTimes(pauses + 1);
    scrubber.end();
  });
});
