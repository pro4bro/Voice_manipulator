import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { VoiceOutput } from "../../domain/types";
import { VoicePatch } from "./VoicePatch";
afterEach(() => vi.unstubAllGlobals());
const output = { id: "o", segments: [{ rowId: "a", text: "Xin chào", start: 0, end: 1 }], words: [] } as unknown as VoiceOutput;
const draft = { outputId: "o", rowId: "a", scriptRevision: 2, editRevision: 0, startFrame: 0, endFrame: 24000, sampleRate: 24000, text: "Xin chào", replacementText: "Xin chào anh", voiceId: "v", speakerProfileId: "s", audioUrl: "/source/audio", status: "ready", processingAvailable: false };
const reply = (body: object) => ({ ok: true, json: async () => body });
it("transfers a whole chosen sentence with source revisions and shows the missing processor", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ revision: 0, draft: null })).mockResolvedValueOnce(reply({ revision: 1, draft }));
  vi.stubGlobal("fetch", fetcher);
  render(<VoicePatch projectId="p" output={output} scriptRevision={2} editRevision={0} saved selection={{ indexes: [], anchor: null, rowIds: ["a"] }} />);
  await waitFor(() => expect(screen.getByText("Chuyển cả câu sang Patch")).toBeEnabled());
  fireEvent.click(screen.getByText("Chuyển cả câu sang Patch"));
  await screen.findByDisplayValue("Xin chào anh");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expectedRevision: 0, outputId: "o", rowId: "a", expectedScriptRevision: 2, expectedEditRevision: 0 });
  expect(screen.getByText("Tạo bản vá nghe thử")).toBeDisabled();
});
it("ignores a transfer reply arriving after switching source", async () => {
  let finish!: (value: ReturnType<typeof reply>) => void;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ revision: 0, draft: null })).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<VoicePatch projectId="p" output={output} scriptRevision={2} saved selection={{ indexes: [], anchor: null, rowIds: ["a"] }} />);
  await waitFor(() => expect(screen.getByText("Chuyển cả câu sang Patch")).toBeEnabled());
  fireEvent.click(screen.getByText("Chuyển cả câu sang Patch"));
  view.rerender(<VoicePatch projectId="p" output={{ ...output, id: "other" }} scriptRevision={2} saved />);
  finish(reply({ revision: 1, draft }));
  await waitFor(() => expect(screen.queryByDisplayValue("Xin chào anh")).not.toBeInTheDocument());
});
