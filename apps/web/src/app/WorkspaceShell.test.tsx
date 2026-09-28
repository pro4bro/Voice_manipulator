import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectMediaAsset } from "../domain/types";
import { WorkspaceShell } from "./WorkspaceShell";

const apiMocks = vi.hoisted(() => ({
  getOmniVoiceProfileSchema: vi.fn(),
  getPreferences: vi.fn(),
  getSystemStatus: vi.fn(),
  getTrainingCatalog: vi.fn(),
  listProjectMedia: vi.fn(),
  listProjectMediaTranscriptionStatus: vi.fn(),
  listReadingPacks: vi.fn(),
  getDatasetReadiness: vi.fn(),
  listTrainingRuns: vi.fn(),
  recycleProjectMedia: vi.fn(),
  restoreProjectMedia: vi.fn(),
  getTrainingRunProgress: vi.fn(),
  claimObsLiveLinkTarget: vi.fn(),
  releaseObsLiveLinkTarget: vi.fn(),
}));

vi.mock("../api/client", () => ({ api: apiMocks }));
vi.mock("../modules/registry/ModuleRegistry", () => ({
  ModuleRegistry: ({ id, context }: { id: string; context: { script: string; take: { name: string } | null; onOpenVoiceOutput: (output: unknown) => void; onBatchMediaAction: (action: unknown) => void } }) => {
    if (id === "library-panel") return <><button onClick={() => context.onBatchMediaAction({ kind: "recycle", assetIds: ["asset-1", "asset-2"] })} type="button">remove selected footage</button><button onClick={() => context.onBatchMediaAction({ kind: "restore", assetIds: ["asset-1", "asset-2"] })} type="button">restore selected footage</button></>;
    if (id === "script") return <output data-testid="script-value">{context.script}</output>;
    if (id === "timeline") return <output data-testid="timeline-take">{context.take?.name ?? "trống"}</output>;
    if (id === "manipulator-library") {
      return <button onClick={() => context.onOpenVoiceOutput(GENERATED)} type="button">mở voice output</button>;
    }
    return null;
  },
}));

const GENERATED = {
  id: "output-1", name: "Script · 35 đoạn", text: "xin chào", voiceId: "voice-1", voiceName: "Anh Vũ",
  speakerProfileId: "speaker-1", engine: "omnivoice", generatorId: "omnivoice-generate", parameters: {},
  duration: 208, audioPath: "assets/voice-output/output-1/audio.wav", words: [], segments: [],
  createdAt: "2026-09-17T00:00:00Z",
};
vi.mock("../modules/workspace-status/WorkspaceStatusBar", () => ({ WorkspaceStatusBar: () => null }));

const project: Project = {
  id: "project-stt-race",
  name: "STT race",
  projectPath: "data/projects/project-stt-race",
  location: null,
  language: "vi",
  accent: null,
  sampleRate: 24000,
  purpose: null,
  createdAt: "2026-08-30T00:00:00Z",
  updatedAt: "2026-08-30T00:00:00Z",
  lastPage: "speech-to-text",
};

function mediaAsset(status: ProjectMediaAsset["transcriptionStatus"], text: string, updatedAt: string): ProjectMediaAsset {
  return {
    id: "asset-1",
    name: "speech.wav",
    sourceExtension: ".wav",
    mediaKind: "audio",
    sourcePath: "assets/media/asset-1/source.wav",
    analysisPath: "assets/media/asset-1/analysis.wav",
    studioItemId: status === "complete" ? "stt-result" : null,
    url: "/api/projects/project-stt-race/media/asset-1/audio",
    duration: 12,
    sampleRate: 24000,
    text,
    words: [],
    origin: "import",
    status: "ready",
    transcriptionStatus: status,
    transcriptionSelected: true,
    transcriptionProgress: status === "complete" ? 100 : 42,
    transcriptionError: null,
    aiReviewStatus: "pending",
    trainingSelected: false,
    captureTier: "import",
    speakerProfileIds: [],
    environmentProfileIds: [],
    emotion: "normal",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt,
    revisions: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("WorkspaceShell STT synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiMocks.listReadingPacks.mockResolvedValue([]);
    apiMocks.getDatasetReadiness.mockResolvedValue(null);
    apiMocks.listTrainingRuns.mockResolvedValue([]);
    apiMocks.getTrainingRunProgress.mockResolvedValue([]);
    apiMocks.getTrainingCatalog.mockResolvedValue({
      speakers: [],
      environmentProfiles: [],
      settings: {
        targetSpeakerIds: [], maxSteps: 10000, checkpointEvery: 1000, batchSize: 4,
        learningRate: 0.00002, denoiseBeforeTraining: true, learnEnvironmentNoise: false,
        environmentProfileId: null,
      },
      updatedAt: "2026-08-30T00:00:00Z",
    });
    apiMocks.getOmniVoiceProfileSchema.mockResolvedValue(null);
    apiMocks.getPreferences.mockResolvedValue({
      aiReview: { enabled: false, baseUrl: "", model: "", apiKey: null, apiKeyConfigured: false },
      diarization: { enabled: true, model: "pyannote", huggingfaceToken: null, huggingfaceTokenConfigured: false },
      emotionStyle: {
        colorMode: "gradient", gradientStart: "#18d9ff", gradientEnd: "#ff4b52",
        emotionColors: {}, backgroundEnabled: false, backgroundColor: "#24384b", backgroundOpacity: 0.34,
      },
    });
    apiMocks.getSystemStatus.mockResolvedValue(null);
    apiMocks.claimObsLiveLinkTarget.mockResolvedValue(undefined);
    apiMocks.releaseObsLiveLinkTarget.mockResolvedValue(undefined);
  });

  it("claims the OBS target while a project is open and releases the same owner on leave", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    const view = render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);
    await waitFor(() => expect(apiMocks.claimObsLiveLinkTarget).toHaveBeenCalledWith(project.id, expect.any(String)));
    const owner = apiMocks.claimObsLiveLinkTarget.mock.calls[0][1];
    view.unmount();
    expect(apiMocks.releaseObsLiveLinkTarget).toHaveBeenCalledWith(owner);
  });

  it("opens Voice Training and Voice Changer directly onto their modules", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    const { container } = render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);
    expect(container.querySelector(".workspace-brand__logo")).toHaveAttribute("src", "/pro4bro-logo.png");
    fireEvent.click(screen.getByRole("button", { name: /Voice Training/ }));
    await waitFor(() => expect(container.querySelector(".workspace-stage")).toHaveClass("is-compact-heading"));
    expect(container.querySelector(".stage-heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Voice Changer/ }));
    await waitFor(() => expect(container.querySelector(".workspace-stage")).toHaveClass("is-compact-heading"));
    expect(container.querySelector(".stage-heading")).toBeNull();
  });

  it("recycles every selected Media Pool asset through the project API", async () => {
    const first = mediaAsset("complete", "one", "2026-08-30T00:00:01Z");
    const second = { ...mediaAsset("complete", "two", "2026-08-30T00:00:02Z"), id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.recycleProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => ({ ...(assetId === first.id ? first : second), deletedAt: "2026-09-29T00:00:00Z" }));
    render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));
    fireEvent.click(screen.getByRole("button", { name: "remove selected footage" }));
    await waitFor(() => expect(apiMocks.recycleProjectMedia).toHaveBeenCalledTimes(2));
    expect(apiMocks.recycleProjectMedia).toHaveBeenNthCalledWith(1, project.id, first.id);
    expect(apiMocks.recycleProjectMedia).toHaveBeenNthCalledWith(2, project.id, second.id);
    await waitFor(() => expect(screen.getByText("Đã chuyển vào Recycle Bin 2 footage.")).toBeInTheDocument());
  });

  it("restores selected Recycle Bin footage through the project API", async () => {
    const first = { ...mediaAsset("complete", "one", "2026-08-30T00:00:01Z"), deletedAt: "2026-09-29T00:00:00Z" };
    const second = { ...first, id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.restoreProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => ({ ...(assetId === first.id ? first : second), deletedAt: null }));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project} onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));
    fireEvent.click(await screen.findByRole("button", { name: "restore selected footage" }));
    await waitFor(() => expect(apiMocks.restoreProjectMedia).toHaveBeenCalledTimes(2));
    expect(apiMocks.restoreProjectMedia).toHaveBeenNthCalledWith(1, project.id, first.id);
    expect(apiMocks.restoreProjectMedia).toHaveBeenNthCalledWith(2, project.id, second.id);
    await waitFor(() => expect(screen.getByText("Đã restore 2 footage.")).toBeInTheDocument());
  });

it("keeps what each page has open: footage in Speech to Text, the generated voice in Voice Manipulator", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([mediaAsset("complete", "Transcript của footage", "2026-08-30T00:00:02Z")]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);

    render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);

    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));

    fireEvent.click(screen.getByRole("button", { name: /Voice Manipulator/ }));
    // Nothing generated is open yet: the Manipulator timeline does not borrow the footage.
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống"));
    fireEvent.click(screen.getByRole("button", { name: "mở voice output" }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("Script · 35 đoạn"));

    fireEvent.click(screen.getByRole("button", { name: /Input/ }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));
    expect(screen.getByTestId("script-value")).toHaveTextContent("Transcript của footage");

    fireEvent.click(screen.getByRole("button", { name: /Voice Manipulator/ }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("Script · 35 đoạn"));
  });

  it("waits for the authoritative asset before stopping terminal STT polling", async () => {
    const processing = mediaAsset("processing", "", "2026-08-30T00:00:01Z");
    const completed = mediaAsset("complete", "Transcript STT phải luôn xuất hiện", "2026-08-30T00:00:02Z");
    const fullRefresh = deferred<ProjectMediaAsset[]>();
    apiMocks.listProjectMedia
      .mockResolvedValueOnce([processing])
      .mockReturnValueOnce(fullRefresh.promise);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([{
      id: processing.id,
      transcriptionStatus: "complete",
      transcriptionProgress: 100,
      transcriptionError: null,
    }]);

    render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);

    await waitFor(() => expect(screen.getByTestId("script-value")).toHaveTextContent(""));
    await waitFor(() => expect(apiMocks.listProjectMediaTranscriptionStatus).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { fullRefresh.resolve([completed]); });

    await waitFor(() => expect(screen.getByTestId("script-value")).toHaveTextContent(completed.text));
  });
});
