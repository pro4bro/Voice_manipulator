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

it("reloads a shifted live window even when no new chunk arrives", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(api.getObsLiveLinkStatus).mockResolvedValue(status(4));
  vi.mocked(api.getObsLiveLinkWaveform).mockImplementation(async (...args) => ({
    ...waveform(4), startSeconds: args[3], endSeconds: args[4], lastIncludedSequence: -1,
  }));
  let start = 0;
  const snapshots: ObsLiveLinkWaveform[] = [];
  const unsubscribe = subscribeObsLiveLinkWaveforms("project", () => ({ startSeconds: start, endSeconds: start + 1 }),
    (next) => snapshots.push(next));
  await vi.waitFor(() => expect(snapshots).toHaveLength(1));
  start = 1;
  FakeEventSource.instance.emit(status(4));
  await vi.waitFor(() => expect(snapshots).toHaveLength(2));
  expect(vi.mocked(api.getObsLiveLinkWaveform).mock.calls[1]?.[6]).toBeUndefined();
  expect(snapshots[1].startSeconds).toBe(1);
  unsubscribe();
});

it("discards an old-window response before updating its cursor", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(api.getObsLiveLinkStatus).mockResolvedValue(status(4));
  let resolveFirst!: (value: ObsLiveLinkWaveform) => void;
  vi.mocked(api.getObsLiveLinkWaveform).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockImplementation(async (...args) => ({ ...waveform(4), startSeconds: args[3], endSeconds: args[4] }));
  let start = 0;
  const snapshots: ObsLiveLinkWaveform[] = [];
  const unsubscribe = subscribeObsLiveLinkWaveforms("project", () => ({ startSeconds: start, endSeconds: start + 1 }),
    (next) => snapshots.push(next));
  await vi.waitFor(() => expect(api.getObsLiveLinkWaveform).toHaveBeenCalledTimes(1));
  start = 1;
  FakeEventSource.instance.emit(status(4));
  resolveFirst(waveform(4));
  await vi.waitFor(() => expect(snapshots).toHaveLength(1));
  expect(snapshots[0].startSeconds).toBe(1);
  expect(vi.mocked(api.getObsLiveLinkWaveform).mock.calls[1]?.[6]).toBeUndefined();
  unsubscribe();
});
