import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("project import queue API", () => {
  it("reserves a batch in the project queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [] }))));
    await api.reserveMediaImports("project / 1", [{ id: "import-1", label: "voice one.wav" }]);
    expect(fetch).toHaveBeenCalledWith("/api/projects/project%20%2F%201/queue/imports", expect.objectContaining({
      method: "POST", body: JSON.stringify({ tasks: [{ id: "import-1", label: "voice one.wav" }] }),
    }));
  });

  it("adds encoded queue headers to multipart and local imports when supplied", async () => {
    const asset = { id: "asset-1", name: "voice.wav" };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Response(JSON.stringify({ asset, trackAssetIds: [], item: null, elapsed: 0 }))));
    const file = new File(["audio"], "voice #1.wav");
    await api.importProjectMedia("project", file, "import", "", false, false, null, "import-1");
    let headers = new Headers((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers);
    expect(headers.get("X-Queue-Task-Id")).toBe("import-1");
    expect(headers.get("X-Queue-Label")).toBe("voice%20%231.wav");

    (fetch as ReturnType<typeof vi.fn>).mockClear();
    await api.importLocalProjectMedia("project", "C:/voice #1.wav", false, undefined, undefined, "import-2");
    headers = new Headers((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers);
    expect(headers.get("X-Queue-Task-Id")).toBe("import-2");
    expect(headers.get("X-Queue-Label")).toBe("voice%20%231.wav");
  });

  it("preserves legacy import calls without queue headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ asset: { id: "asset-1", name: "voice.wav" }, trackAssetIds: [], item: null, elapsed: 0 }))));
    await api.importProjectMedia("project", new File(["audio"], "voice.wav"), "import");
    const headers = new Headers((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers);
    expect(headers.has("X-Queue-Task-Id")).toBe(false);
    expect(headers.has("X-Queue-Label")).toBe(false);
  });
});
