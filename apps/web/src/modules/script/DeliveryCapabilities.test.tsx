import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeliveryCapabilities } from "./DeliveryCapabilities";
import type { VoiceScriptDocument } from "../../domain/types";
afterEach(() => vi.unstubAllGlobals());
it("shows requested delivery as unsupported instead of claiming that tags conditioned audio", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ rows: [{ rowId: "r", synthesisReady: false, blockers: ["delivery: Chưa có whisper giữ đúng nhân vật."], settings: {} }] }) })));
  const document: VoiceScriptDocument = { version: 1, revision: 1, settings: {}, segments: [], rows: [] };
  render(<DeliveryCapabilities document={document} />);
  fireEvent.click(screen.getByText("Kiểm tra cách diễn"));
  expect(await screen.findByText("delivery: Chưa có whisper giữ đúng nhân vật.")).toBeInTheDocument();
  expect(screen.getByText(/Chưa áp dụng được yêu cầu/)).toBeInTheDocument();
});
