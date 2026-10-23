import { afterEach, describe, expect, it, vi } from "vitest";
import { api, queuedDownloadUrl } from "./client";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("queue download marker", () => {
  it("adds the marker while preserving query parameters and fragments", () => {
    expect(queuedDownloadUrl("/api/output.wav")).toBe("/api/output.wav?queue_export=1");
    expect(queuedDownloadUrl("/api/output.wav?variant=final#download")).toBe("/api/output.wav?variant=final&queue_export=1#download");
    expect(queuedDownloadUrl("/api/output.wav?queue_export=0&variant=final")).toBe("/api/output.wav?queue_export=1&variant=final");
  });
});

describe("Voice Output browser handoff", () => {
  it("returns omissions from the response and names the selected output file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("subtitle", { headers: {
      "Content-Disposition": 'attachment; filename="selected--word.srt"',
      "X-Pro4Bro-Skipped-Cues": "2",
    } })));
    const create = vi.fn().mockReturnValue("blob:export-gate");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    const result = await api.exportVoiceOutputSubtitles("project", "selected", "word");
    expect(fetch).toHaveBeenCalledWith("/api/projects/project/voice-outputs/selected/subtitles?mode=word", { headers: expect.any(Headers) });
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers;
    expect(headers.get("X-Queue-Export")).toBe("1");
    expect(filename).toBe("selected--word.srt");
    expect(result.skippedCues).toBe(2);
    expect(create).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("rejects a failed export before handing anything to the browser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Missing audio" }), { status: 404 })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await expect(api.downloadVoiceOutputAudio("project", "missing")).rejects.toThrow("Missing audio");
    expect(click).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
