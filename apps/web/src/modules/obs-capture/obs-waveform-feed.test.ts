import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { ObsLiveLinkStatus, ObsLiveLinkWaveform } from "../../domain/types";
import { subscribeObsLiveLinkWaveforms } from "./obs-waveform-feed";

vi.mock("../../api/client", () => ({ api: {
  getObsLiveLinkStatus: vi.fn(), getObsLiveLinkWaveform: vi.fn(),
} }));

class FakeEventSource {
  static instance: FakeEventSource;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { FakeEventSource.instance = this; }
  emit(status: ObsLiveLinkStatus) { this.onmessage?.({ data: JSON.stringify(status) }); }
}

const status = (sequence: number): ObsLiveLinkStatus => ({
  appRecording: { recordingId: "rec", projectId: "project", status: "recording" },
  channels: [{ channelId: "channel", capture: {
    recordingId: "rec", projectId: "project", lastDurableSequence: sequence,
  } }],
} as ObsLiveLinkStatus);

const waveform = (sequence: number): ObsLiveLinkWaveform => ({
  recordingId: "rec", projectId: "project", channelId: "channel",
  source: "pcm", sampleAxis: "channel", sampleRate: 48000,
  startSeconds: 0, endSeconds: 1, lastDurableSequence: sequence,
  lastIncludedSequence: sequence, hasMore: false, points: [],
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

it("fetches only new durable channel sequences from status SSE", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(api.getObsLiveLinkStatus).mockResolvedValue(status(0));
  vi.mocked(api.getObsLiveLinkWaveform).mockImplementation(async (...args) => waveform(args[6] === 0 ? 1 : 0));
  const snapshots: ObsLiveLinkWaveform[] = [];
  const unsubscribe = subscribeObsLiveLinkWaveforms("project", () => ({ startSeconds: 0, endSeconds: 1 }),
    (next) => snapshots.push(next));
  await vi.waitFor(() => expect(snapshots).toHaveLength(1));
  FakeEventSource.instance.emit(status(0));
  expect(api.getObsLiveLinkWaveform).toHaveBeenCalledTimes(1);
  FakeEventSource.instance.emit(status(1));
  await vi.waitFor(() => expect(snapshots).toHaveLength(2));
  expect(vi.mocked(api.getObsLiveLinkWaveform).mock.calls[1]?.[6]).toBe(0);
  unsubscribe();
  expect(FakeEventSource.instance.close).toHaveBeenCalled();
});

it("polls status after SSE disconnect and stops on unsubscribe", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(api.getObsLiveLinkStatus).mockResolvedValue(status(0));
  vi.mocked(api.getObsLiveLinkWaveform).mockResolvedValue(waveform(0));
  const unsubscribe = subscribeObsLiveLinkWaveforms("project", () => ({ startSeconds: 0, endSeconds: 1 }), vi.fn());
  await Promise.resolve();
  FakeEventSource.instance.onerror?.();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(api.getObsLiveLinkStatus).toHaveBeenCalledTimes(3);
  unsubscribe();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(api.getObsLiveLinkStatus).toHaveBeenCalledTimes(3);
});
