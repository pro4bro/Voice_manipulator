import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReferenceBinding } from "../../domain/reference-bindings";
import { ReferenceScheduleEditor } from "./ReferenceScheduleEditor";

const binding: ReferenceBinding = {
  id: "binding-1",
  scope: { kind: "voice-output", id: "output-1", revision: "rev-1" },
  target: { id: "target-1", start: 1, end: 2, rowIds: ["row-1"], wordIndexes: [0], textRanges: [], text: "A line" },
  sources: [], status: "requested", warnings: [], createdAt: "now", updatedAt: "now",
};

const event = {
  id: "emotion-1", property: "emotion", targetStart: 1, targetEnd: 2,
  sourceAssetId: "reference-1", sourceStart: .5, sourceEnd: 1.5,
  strength: .8, priority: 2, capability: "unsupported", blocker: "No verified processor applies emotion.", applied: false,
} as const;

const plan = {
  key: "a".repeat(64), bindingId: binding.id, seed: 17, randomValues: true, randomTimes: false,
  events: [event], notices: [], applied: false, status: "ready", statusReason: null,
};

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function savedDocument(schedules: Array<typeof plan> = [], revision = 4) {
  return { version: 1 as const, revision, schedules };
}

afterEach(() => vi.unstubAllGlobals());

it("loads a frozen schedule without rerolling and requires a fresh preview before apply", async () => {
  const saved = { ...plan, seed: 99, randomValues: true, randomTimes: true };
  const fetchMock = vi.fn().mockResolvedValue(response(savedDocument([saved])));
  vi.stubGlobal("fetch", fetchMock);
  render(<ReferenceScheduleEditor projectId="project one" binding={binding} />);

  expect(await screen.findByLabelText("Lịch đã lưu")).toBeInTheDocument();
  expect(screen.getByLabelText("Seed")).toHaveValue(99);
  expect(screen.getByLabelText("Random giá trị")).toBeChecked();
  expect(screen.getByLabelText("Random thời điểm")).toBeChecked();
  expect(screen.getByRole("button", { name: "Apply lịch" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/projects/project%20one/reference-schedules");
  expect(screen.getByText(/Chưa áp dụng vào audio/)).toBeInTheDocument();
});

it("sends the exact preview and optimistic apply contracts and explains unsupported conditioning", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response(savedDocument([], 4)))
    .mockResolvedValueOnce(response(plan))
    .mockResolvedValueOnce(response(savedDocument([plan], 5)));
  vi.stubGlobal("fetch", fetchMock);
  render(<ReferenceScheduleEditor projectId="p1" binding={binding} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "17" } });
  fireEvent.click(screen.getByLabelText("Random giá trị"));
  fireEvent.click(screen.getByRole("button", { name: "Preview lịch" }));

  expect(await screen.findByLabelText("Preview lịch hiện tại")).toBeInTheDocument();
  expect(screen.getByRole("listitem")).toHaveTextContent("Cảm xúc: 1.000s–2.000s · reference-1");
  expect(screen.getByText(/No verified processor applies emotion/)).toBeInTheDocument();
  expect(fetchMock.mock.calls[1][0]).toBe("/api/projects/p1/reference-schedules/preview");
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
    bindingId: "binding-1", seed: 17, randomValues: true, randomTimes: false,
  });

  fireEvent.click(screen.getByRole("button", { name: "Apply lịch" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
    bindingId: "binding-1", seed: 17, randomValues: true, randomTimes: false,
    expectedRevision: 4, expectedKey: plan.key,
  });
});

it("ignores a preview response after the user changes its inputs", async () => {
  let resolvePreview!: (value: Response) => void;
  const pendingPreview = new Promise<Response>((resolve) => { resolvePreview = resolve; });
  const fetchMock = vi.fn().mockResolvedValueOnce(response(savedDocument([], 1))).mockReturnValueOnce(pendingPreview);
  vi.stubGlobal("fetch", fetchMock);
  render(<ReferenceScheduleEditor projectId="p1" binding={binding} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Preview lịch" }));
  fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "23" } });
  resolvePreview(response(plan));
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview lịch" })).toBeEnabled());
  expect(screen.queryByLabelText("Preview lịch hiện tại")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply lịch" })).toBeDisabled();
});

it("reports revision conflicts and does not guess timing for untimed bindings", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response(savedDocument([], 2)))
    .mockResolvedValueOnce(response({ detail: "Preview is stale; preview the current binding again." }, false, 409));
  vi.stubGlobal("fetch", fetchMock);
  render(<ReferenceScheduleEditor projectId="p1" binding={binding} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Preview lịch" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Preview is stale");

  const untimed = { ...binding, target: { ...binding.target, start: null, end: null } };
  const otherFetch = vi.fn().mockResolvedValue(response(savedDocument()));
  vi.stubGlobal("fetch", otherFetch);
  cleanup();
  const { unmount } = render(<ReferenceScheduleEditor projectId="p2" binding={untimed} />);
  expect(await screen.findByRole("status")).toHaveTextContent("timing thực");
  expect(screen.getByRole("button", { name: "Preview lịch" })).toBeDisabled();
  unmount();
});

it("rerolls only after explicit user action", async () => {
  const fetchMock = vi.fn().mockResolvedValue(response(savedDocument()));
  vi.stubGlobal("fetch", fetchMock);
  const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
    (array as Uint32Array)[0] = 123456;
    return array;
  });
  render(<ReferenceScheduleEditor projectId="p1" binding={binding} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Seed")).toHaveValue(1);
  expect(random).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tạo seed mới" }));
  expect(random).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Seed")).toHaveValue(123456);
});
