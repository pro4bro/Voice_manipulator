import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyLipSync } from "../../domain/lipsync";
import { api } from "../../api/client";
import { LipSyncWorkspace } from "./LipSyncWorkspace";
const resize = () => undefined;
describe("LipSync engine settings from shipped descriptors", () => {
  it("keeps engine settings independent and restores source defaults including realtime batch", async () => {
    const options = ["musetalk", "latentsync", "wav2lip"].map((name) => ({
      ...JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), `../../../../../services/api/app/resources/provider-catalog/${name}-lipsync.json`), "utf8")),
      installed: true, available: false, status: "Chưa có adapter", origin: "shipped",
    }));
    const document = vi.spyOn(api, "getLipSync").mockImplementation(async () => emptyLipSync());
    const catalog = vi.spyOn(api, "getEngineCatalog").mockResolvedValue(options);
    const runtime = vi.spyOn(api, "getLipSyncRuntime").mockResolvedValue({ analysis: { ready: false, blockers: [] }, render: { ready: false, blockers: [] } });
    const jobs = vi.spyOn(api, "listLipSyncJobs").mockResolvedValue([]);
    const speakers = vi.spyOn(api, "getTrainingCatalog").mockResolvedValue({ speakers: [] });
    try {
      render(<LipSyncWorkspace assets={[]} outputs={[]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
      await screen.findByLabelText("Batch inference");
      fireEvent.change(screen.getByLabelText("Batch inference"), { target: { value: "4" } });
      fireEvent.click(screen.getByRole("radio", { name: /LatentSync 1.6/ }));
      fireEvent.change(screen.getByLabelText("Seed (-1: ngẫu nhiên)"), { target: { value: "42" } });
      fireEvent.click(screen.getByRole("radio", { name: /MuseTalk 1.5/ }));
      expect(screen.getByLabelText("Batch inference")).toHaveValue("4");
      fireEvent.click(screen.getByText("Khôi phục mặc định"));
      fireEvent.change(screen.getByLabelText("Chế độ inference"), { target: { value: "realtime" } });
      expect(screen.getByLabelText("Batch inference")).toHaveValue("20");
      expect(screen.queryByLabelText("Dùng float16")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Không lưu frame trung gian")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("radio", { name: /LatentSync 1.6/ }));
      expect(screen.getByLabelText("Seed (-1: ngẫu nhiên)")).toHaveValue("42");
      fireEvent.change(screen.getByLabelText("Số bước inference"), { target: { value: "0" } });
      expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
      fireEvent.click(screen.getByText("Khôi phục mặc định"));
      expect(screen.getByLabelText("Seed (-1: ngẫu nhiên)")).toHaveValue("1247");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally { catalog.mockRestore(); document.mockRestore(); runtime.mockRestore(); jobs.mockRestore(); speakers.mockRestore(); }
  });
});
