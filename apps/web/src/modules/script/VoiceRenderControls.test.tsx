import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VoiceRenderControls } from "./VoiceRenderControls";
import type { VoiceRenderController } from "../../app/useVoiceRender";
it("downloads the same verified artifact shown in preview and reports limited gain", () => {
  const controller: VoiceRenderController = { busy: false, error: null, render: vi.fn(async () => undefined), packet: {
    output: { id: "o" } as never, audioUrl: "/api/projects/p/voice-outputs/o/render/hash/audio", scriptRevision: 3, editRevision: 1,
    report: { global: { requestedGainDb: 6, appliedGainDb: .6, headroomLimited: true }, output: { rmsDbfs: -12, peakDbfs: -1 } },
  } };
  const view = render(<VoiceRenderControls controller={controller} saved />);
  expect(screen.getByRole("link", { name: "Tải WAV đã render" })).toHaveAttribute("href", controller.packet!.audioUrl);
  expect(screen.getByText(/đã giới hạn headroom/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng âm lượng" }));
  expect(controller.render).toHaveBeenCalledOnce();
  view.rerender(<VoiceRenderControls controller={controller} saved={false} />);
  expect(screen.getByRole("button", { name: "Áp dụng âm lượng" })).toBeDisabled();
});
