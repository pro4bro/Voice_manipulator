import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TrainingCatalog } from "../../domain/types";
import { Train } from "./Train";

const catalog: TrainingCatalog = {
  speakers: [],
  environmentProfiles: [],
  settings: { targetSpeakerIds: [], maxSteps: 10000, checkpointEvery: 1000, batchSize: 4, learningRate: 0.00002, denoiseBeforeTraining: true, learnEnvironmentNoise: false, environmentProfileId: null },
  updatedAt: "2026-08-23T00:00:00Z",
};

describe("Train", () => {
  it("defaults checkpoint backups to every 1000 steps and persists changes", () => {
    const onCatalogChange = vi.fn();
    render(<Train assets={[]} catalog={catalog} onCatalogChange={onCatalogChange} />);

    expect(screen.getByLabelText("Checkpoint interval")).toHaveValue(1000);
    fireEvent.change(screen.getByLabelText("Checkpoint interval"), { target: { value: "2000" } });
    expect(onCatalogChange).toHaveBeenCalledWith({ ...catalog, settings: { ...catalog.settings, checkpointEvery: 2000 } });
  });

  it("does not claim training is runnable before its processor adapter exists", () => {
    render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Bắt đầu training/ })).toBeDisabled();
    expect(screen.getByText("ADAPTER PENDING")).toBeInTheDocument();
  });
});
