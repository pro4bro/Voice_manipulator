import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrainingJob } from "./TrainingJob";
import type { DatasetReadiness, SpeakerProfile } from "../../domain/types";

const SPEAKER: SpeakerProfile = {
  id: "speaker-1",
  name: "Nam Anh",
  language: "vi",
  languageId: "vi",
  region: null,
  age: null,
  gender: "male",
  attributes: {},
  color: "#888",
  createdAt: "2026-09-04T00:00:00Z",
};

function readiness(overrides: Partial<DatasetReadiness> = {}): DatasetReadiness {
  return {
    selectedAssets: 3,
    readyAssets: 2,
    segments: 42,
    totalSeconds: 605,
    speakerProfileIds: ["speaker-1"],
    segmentsByTier: { guided: 30, import: 12 },
    secondsByEmotion: { angry: 240, normal: 365 },
    rejections: [],
    scriptValidations: [],
    ...overrides,
  };
}

describe("TrainingJob", () => {
  it("reports segments, usable footage and speaker coverage", () => {
    render(<TrainingJob readiness={readiness()} speakers={[SPEAKER]} />);

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("2/3 footage dùng được")).toBeInTheDocument();
    expect(screen.getByText(/10m 05s · Nam Anh/)).toBeInTheDocument();
  });

  it("breaks the dataset down by where its audio came from", () => {
    render(<TrainingJob readiness={readiness()} speakers={[SPEAKER]} />);

    expect(screen.getByText("Đọc theo bài")).toBeInTheDocument();
    expect(screen.getByText("Nhập vào")).toBeInTheDocument();
  });

  it("names why footage was rejected instead of dropping it silently", () => {
    render(
      <TrainingJob
        readiness={readiness({
          rejections: [
            { assetId: "a1", assetName: "phong-van.mp4", reason: "unassigned-speaker", detail: "" },
            { assetId: "a2", assetName: "hop.mp4", reason: "mixed-speaker-unresolved", detail: "" },
          ],
        })}
        speakers={[SPEAKER]}
      />,
    );

    expect(screen.getByText(/BỊ LOẠI · 2/)).toBeInTheDocument();
    expect(screen.getByText("Chưa gán speaker")).toBeInTheDocument();
    expect(screen.getByText("Nhiều người, chưa gán hết")).toBeInTheDocument();
  });

  it("flags a take that drifted from its script rather than calling it ready", () => {
    render(
      <TrainingJob
        readiness={readiness({
          scriptValidations: [
            {
              assetId: "card-1",
              expectedWords: 10,
              heardWords: 9,
              matched: 8,
              omissions: ["ba"],
              insertions: [],
              substitutions: [["lần", "lan"]],
              matchRatio: 0.8,
            },
          ],
        })}
        speakers={[SPEAKER]}
      />,
    );

    expect(screen.getByText(/ĐỌC LỆCH SO VỚI BÀI · 1/)).toBeInTheDocument();
    expect(screen.getByText("80% khớp")).toBeInTheDocument();
  });

  it("stays quiet about a take that matched its script", () => {
    render(
      <TrainingJob
        readiness={readiness({
          scriptValidations: [
            { assetId: "card-1", expectedWords: 10, heardWords: 10, matched: 10, omissions: [], insertions: [], substitutions: [], matchRatio: 1 },
          ],
        })}
        speakers={[SPEAKER]}
      />,
    );

    expect(screen.queryByText(/ĐỌC LỆCH/)).not.toBeInTheDocument();
  });

  it("will not offer to compile a dataset with no segments", () => {
    const onCompile = vi.fn();
    render(
      <TrainingJob readiness={readiness({ segments: 0 })} speakers={[SPEAKER]} onCompile={onCompile} />,
    );
    const button = screen.getByRole("button", { name: /Chưa có đoạn nào/ });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCompile).not.toHaveBeenCalled();
  });

  it("compiles what is there when asked", () => {
    const onCompile = vi.fn();
    render(<TrainingJob readiness={readiness()} speakers={[SPEAKER]} onCompile={onCompile} />);
    fireEvent.click(screen.getByRole("button", { name: "Biên dịch 42 đoạn" }));

    expect(onCompile).toHaveBeenCalledOnce();
  });

  it("says plainly when readiness could not be read", () => {
    render(<TrainingJob readiness={null} speakers={[SPEAKER]} />);

    expect(screen.getByText("Chưa đọc được readiness")).toBeInTheDocument();
  });
});
