import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DurationPlanPanel } from "./DurationPlanPanel";
import { api } from "../../api/client";
import { migrateScript } from "../../domain/voice-script-document";

it("previews canonical budgets and shows requested/actual without claiming listening or anchor success", async () => {
  const document = migrateScript([{ id: "r", text: "Xin chào", voiceId: "v", speakerProfileId: "s", settings: { duration: 2 } }]);
  document.revision = 5; document.settings.duration = 2;
  vi.spyOn(api, "getTimingPlans").mockResolvedValue({ version: 1, revision: 3, plans: [] });
  const preview = vi.spyOn(api, "previewScriptDuration").mockResolvedValue({ requestedClip: 2, gapSeconds: .35, segments: {}, rows: { r: { duration: 2, origin: "sentence" } }, scriptRevision: 5 });
  const output = { duration: 2, segments: [{ rowId: "r", start: 0, end: 2, requestedDuration: 2, durationReport: { durationError: 0 }, timingReport: { durationError: 0, anchorStatus: "unknown" } }] } as never;
  const view = render(<DurationPlanPanel projectId="p" document={document} saved output={output} refreshKey={0} />);
  fireEvent.click(screen.getByText("Phân bổ thời lượng · yêu cầu / thực tế"));
  fireEvent.click(screen.getByRole("button", { name: "Xem phân bổ trước khi tạo" }));
  await waitFor(() => expect(preview).toHaveBeenCalledWith("p", { scriptRevision: 5, timingRevision: 3, rows: [{ id: "r", voiceId: "v", text: "Xin chào" }] }));
  expect(screen.getByText(/sai số 0.000000s · cần nghe kiểm tra/)).toBeInTheDocument();
  expect(screen.getByText(/Mapping mốc từ: unknown/)).toBeInTheDocument();
  expect(screen.getByText("Độ lệch bắt đầu: Chưa đo")).toBeInTheDocument();
  view.rerender(<DurationPlanPanel projectId="p" document={{ ...document, revision: 6 }} saved={false} output={output} refreshKey={0} />);
  expect(screen.getByRole("button", { name: "Xem phân bổ trước khi tạo" })).toBeDisabled();
  expect(screen.queryByText(/Phân bổ đã kiểm tra budget/)).toBeNull();
});
