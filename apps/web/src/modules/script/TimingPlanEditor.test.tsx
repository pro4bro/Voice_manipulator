import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { TimingPlanEditor } from "./TimingPlanEditor";
import { migrateScript } from "../../domain/voice-script-document";

it.each(["reference", "dub", "patch"] as const)("saves frozen %s source span/revision and requires saved Script", async (kind) => {
  vi.spyOn(api, "getTimingPlans").mockResolvedValue({ version: 1, revision: 7, plans: [] });
  const save = vi.spyOn(api, "saveTimingPlan").mockResolvedValue({ version: 1, revision: 8, plans: [] });
  const document = { ...migrateScript([{ id: "r", text: "Xin chào", voiceId: "voice-target", speakerProfileId: "speaker-target" }]), revision: 3 };
  const props = { projectId: "p", document, assets: [{ id: "a", name: "Sample.wav", duration: 5, referenceSelected: true, updatedAt: "source-revision" }] as never[], runs: [] };
  const view = render(<TimingPlanEditor {...props} saved={false} />);
  fireEvent.click(screen.getByText("Timing từ footage"));
  await waitFor(() => expect(api.getTimingPlans).toHaveBeenCalledWith("p"));
  fireEvent.change(screen.getByLabelText("Nguồn timing"), { target: { value: kind } });
  fireEvent.change(screen.getByLabelText("Footage timing"), { target: { value: "a" } });
  fireEvent.change(screen.getByLabelText("Đầu span timing"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Cuối span timing"), { target: { value: "3" } });
  expect(screen.getByRole("button", { name: "Lập timing plan" })).toBeDisabled();
  view.rerender(<TimingPlanEditor {...props} saved />);
  fireEvent.click(screen.getByRole("button", { name: "Lập timing plan" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("p", { rowId: "r", expectedRevision: 7, expectedScriptRevision: 3, reviewedMapping: false,
    source: { kind, assetId: "a", start: 1, end: 3, revision: "source-revision", trainingRunId: null } }));
  expect(document.rows[0].voiceId).toBe("voice-target");
});
