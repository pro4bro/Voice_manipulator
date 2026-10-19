import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioScrubber } from "./audio-scrubbing";

function audio() {
  const element = document.createElement("audio");
  Object.defineProperty(element, "duration", { value: 60 });
  Object.defineProperty(element, "play", { value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(element, "pause", { value: vi.fn() });
  return element;
}

describe("audio pointer previews", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("coalesces movement to the latest pointer, stops stationary audio and restores rate without changing volume", async () => {
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
