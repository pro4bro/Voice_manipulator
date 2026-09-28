import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ObsLiveLinkStatus } from "../../domain/types";
import { ObsLiveLinkMixer } from "./ObsLiveLinkMixer";

const apiMocks = vi.hoisted(() => ({ getObsLiveLinkStatus: vi.fn(), setObsLiveLinkForward: vi.fn() }));
vi.mock("../../api/client", () => ({ api: apiMocks }));

class MockEventSource {
  static instance: MockEventSource;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { MockEventSource.instance = this; }
  close() {}
  emit(status: ObsLiveLinkStatus) { this.onmessage?.({ data: JSON.stringify(status) } as MessageEvent); }
}

const initial: ObsLiveLinkStatus = {
  connectionState: "connected", connectionId: "one", connectionEpoch: "epoch",
  serverEpoch: "server", commandRevision: 0, statusRevision: 1, sceneCollection: "Main",
  obsRecording: "idle", activeProject: { id: "project", name: "Project" }, leaseExpiresInSeconds: 15,
  channels: [{ channelId: "channel", sourceUuid: "source", nativeName: "Mic", alias: "Channel 1",
    aliasRevision: 0, slot: 1, missing: false, meterPeak: 30, sampleRate: 48000,
    audioChannels: 2, muted: false, desiredForward: false,
    appliedForward: false, pendingCommandId: null }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("EventSource", MockEventSource);
  apiMocks.getObsLiveLinkStatus.mockResolvedValue(initial);
});

afterEach(() => vi.unstubAllGlobals());

it("shows pending until the matching applied snapshot arrives", async () => {
  const pending = { ...initial, statusRevision: 2, commandRevision: 1, channels: [{
    ...initial.channels[0], desiredForward: true, pendingCommandId: "command",
  }] };
  apiMocks.setObsLiveLinkForward.mockResolvedValue(pending);
  render(<ObsLiveLinkMixer projectId="project" />);
  expect(await screen.findByText("Mic · Channel 1 · 48 kHz · 2 ch")).toBeInTheDocument();
  expect(screen.getByText("Project: Project")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Forward Channel 1" }));
  await waitFor(() => expect(apiMocks.setObsLiveLinkForward).toHaveBeenCalledWith("channel", true));
  expect(await screen.findByText("Đang áp dụng…")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Forward Channel 1" })).toBeDisabled();
  MockEventSource.instance.emit({ ...pending, statusRevision: 3, channels: [{
    ...pending.channels[0], appliedForward: true, pendingCommandId: null,
  }] });
  expect(await screen.findByText("Đã bật")).toBeInTheDocument();
});
