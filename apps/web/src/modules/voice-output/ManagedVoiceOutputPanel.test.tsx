import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpeakerProfile, VoiceOutput, VoiceScriptDocument } from "../../domain/types";
import type { VoiceOutputSessionBook, VoiceOutputVersionState, VoiceVersionsController } from "../../app/useVoiceVersions";
import { api } from "../../api/client";
import { ManagedVoiceOutputPanel, type ManagedVoiceOutputPanelProps } from "./ManagedVoiceOutputPanel";

const script = (text: string): VoiceScriptDocument => ({ version: 1, revision: 1, settings: {}, segments: [], rows: [{ id: "r1", speakerProfileId: null, voiceId: null, text }] });
const output: VoiceOutput = { id: "o1", name: "Greeting", text: "Hello from the generated voice.", voiceId: "voice-1", voiceName: "Sample Voice", speakerProfileId: "speaker-1", engine: "engine", generatorId: "generator", parameters: {}, duration: 2.5, sampleRate: 24000, audioPath: "assets/out.wav", audioAvailable: true, createdAt: "2026-10-24T10:00:00Z" };
const speaker: SpeakerProfile = { id: "speaker-1", name: "Speaker One", language: "en", languageId: "en", region: null, age: null, gender: "unknown", attributes: {}, color: "#557799", createdAt: "2026-10-24T10:00:00Z" };
const state = (overrides: Partial<VoiceOutputVersionState> = {}): VoiceOutputVersionState => ({ revision: 1, script: script("Current version text"), config: {}, generatedScript: null, generatedConfig: {}, composition: null, ownedOutputIds: ["o1"], history: [{ at: "2026-10-23T10:00:00Z", script: script("Earlier text") }], outputId: "o1", ...overrides });
const book = (): VoiceOutputSessionBook => ({ revision: 1, activeSessionId: "s1", activeVersionId: "v1", sessions: [
  { id: "s1", name: "Session One", versions: [{ id: "v1", name: "Version 1", outputId: "o1", state: state() }] },
  { id: "s2", name: "Session Two", versions: [{ id: "v2", name: "Version 2", outputId: null, state: state({ outputId: null, ownedOutputIds: [], history: [] }) }] },
] });

function setup(controllerOverrides: Partial<VoiceVersionsController> = {}, panelOverrides: Partial<Omit<ManagedVoiceOutputPanelProps, "controller">> = {}) {
  const controller: VoiceVersionsController = {
    book: book(), state: state(), activeVersion: book().sessions[0].versions[0], ready: true, busy: false, error: null,
    flush: vi.fn(async () => book()), reload: vi.fn(async () => book()), change: vi.fn(async () => book()), editLayer: vi.fn(async () => book()), adoptOutput: vi.fn(async () => book()), slotAction: vi.fn(async () => book()), refreshAfterGeneration: vi.fn(async () => undefined),
    ...controllerOverrides,
  };
  return { controller, render: () => render(<ManagedVoiceOutputPanel controller={controller} projectId="project" outputs={[output]} speakers={[speaker]} {...panelOverrides} />) };
}

afterEach(() => vi.restoreAllMocks());

describe("ManagedVoiceOutputPanel", () => {
  it("keeps versions nested under expandable session rows and opens the clicked session's version", async () => {
    const { controller, render: renderPanel } = setup();
    renderPanel();
    expect(screen.getByRole("button", { name: /Version 1ACTIVE.*Sample Voice.*Hello from the generated voice/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Version 2/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Session Two Versions" }));
    expect(screen.getByRole("button", { name: /Version 2/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Session Two" }));
    expect(controller.change).toHaveBeenCalledWith("select", "v2");
  });

  it("opens Text History with the active Script and before snapshots", () => {
    const { render: renderPanel } = setup();
    renderPanel();
    fireEvent.contextMenu(screen.getByRole("button", { name: /Version 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Text History" }));
    expect(screen.getByRole("dialog", { name: "Text History: Version 1" })).toBeInTheDocument();
    expect(screen.getByText("Current version text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Before change/ }));
    expect(screen.getByText("Earlier text")).toBeInTheDocument();
  });

  it("confirms removal and sends only compatible Voice Output to supported destinations", async () => {
    const onSendTo = vi.fn();
    const { controller, render: renderPanel } = setup({}, { onSendTo });
    renderPanel();
    const version = screen.getByRole("button", { name: /Version 1/ });
    fireEvent.contextMenu(version);
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to LipSync" }));
    expect(onSendTo).toHaveBeenCalledWith("lip-sync", [output]);

    fireEvent.contextMenu(version);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove…" }));
    expect(screen.getByRole("dialog", { name: "Remove Version 1" })).toBeInTheDocument();
    expect(screen.getByText(/This removes the slot.*Its audio is not deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove slot" }));
    await waitFor(() => expect(controller.slotAction).toHaveBeenCalledWith("v1", "remove"));
  });

  it("creates a version from the chosen slot and renames through the slot API", async () => {
    const { controller, render: renderPanel } = setup();
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Expand Session Two Versions" }));
    const version2 = screen.getByRole("button", { name: /Version 2/ });
    fireEvent.contextMenu(version2);
    fireEvent.click(screen.getByRole("menuitem", { name: "New Version" }));
    await waitFor(() => expect(controller.change).toHaveBeenNthCalledWith(1, "select", "v2"));
    await waitFor(() => expect(controller.change).toHaveBeenNthCalledWith(2, "version"));

    fireEvent.click(screen.getByRole("button", { name: "Expand Session One Versions" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: /Version 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
    fireEvent.change(screen.getByLabelText("Rename slot"), { target: { value: "Take Two" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(controller.slotAction).toHaveBeenCalledWith("v1", "rename", "Take Two"));
  });

  it("disables slot actions during generation", () => {
    const { render: renderPanel } = setup({}, { generationBusy: true });
    renderPanel();
    expect(screen.getByRole("button", { name: "New Session" })).toBeDisabled();
    fireEvent.contextMenu(screen.getByRole("button", { name: /Version 1/ }));
    expect(screen.getByRole("menuitem", { name: "Disable" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Remove…" })).toBeDisabled();
  });

  it("toggles a slot's disabled state through the version API", () => {
    const { controller, render: renderPanel } = setup();
    renderPanel();
    fireEvent.contextMenu(screen.getByRole("button", { name: /Version 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Disable" }));
    expect(controller.slotAction).toHaveBeenCalledWith("v1", "disable");
  });

  it("reveals through the project-owned output route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const revealProject = vi.spyOn(api, "revealProjectFolder").mockResolvedValue(undefined);
    const { render: renderPanel } = setup();
    renderPanel();
    fireEvent.contextMenu(screen.getByRole("button", { name: /Version 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Explorer" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/projects/project/voice-outputs/o1/reveal", { method: "POST" }));
    expect(revealProject).not.toHaveBeenCalled();
  });
});
