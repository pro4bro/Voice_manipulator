import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { loadResumePosition, saveResumePosition, type ResumeSource } from "../../domain/workspace-resume";

const source: ResumeSource = { kind: "asset", id: "resume-a" };
const take = { id: "resume-a", name: "a.wav", url: "/a.wav", duration: 100, text: "", words: [] };
const props = { gain: 0, onGainChange: vi.fn(), resumeProjectId: "cursor-test", resumeSource: source, take };

it("retains the paused playhead across Timeline remounts without overwriting the saved cursor with initial zero", () => {
  const view = render(<Timeline {...props} />);
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 37.125; fireEvent.timeUpdate(audio);
  expect(loadResumePosition("cursor-test", source)).toBe(37.125);
  view.unmount();
  const reopened = render(<Timeline {...props} />);
  expect(reopened.container.querySelector("audio")!.currentTime).toBe(37.125);
  expect(loadResumePosition("cursor-test", source)).toBe(37.125);
});

it("clamps and reapplies restored timing on metadata, keeping different sources and projects isolated", () => {
  saveResumePosition("cursor-meta", source, 77);
  const view = render(<Timeline {...props} resumeProjectId="cursor-meta" />);
  const audio = view.container.querySelector("audio")!;
  // An early seek may be lost until the real media metadata arrives.
  audio.currentTime = 0;
  Object.defineProperty(audio, "duration", { configurable: true, value: 20 });
  fireEvent.loadedMetadata(audio);
  expect(audio.currentTime).toBe(20);
  expect(loadResumePosition("cursor-meta", source)).toBe(20);
  const second: ResumeSource = { kind: "asset", id: "resume-b" };
  view.rerender(<Timeline {...props} resumeProjectId="cursor-meta" resumeSource={second} take={{ ...take, id: "resume-b", url: "/b.wav", duration: 10 }} />);
  expect(audio.currentTime).toBe(0);
  expect(loadResumePosition("cursor-meta", source)).toBe(20);
  expect(loadResumePosition("another-project", source)).toBeNull();
});

it("does not consume a new source resume target from the previous audio metadata", () => {
  const next: ResumeSource = { kind: "asset", id: "next" };
  saveResumePosition("stale-metadata", next, 70);
  const view = render(<Timeline {...props} resumeProjectId="stale-metadata" />);
  const audio = view.container.querySelector("audio")!;
  Object.defineProperty(audio, "duration", { configurable: true, value: 5 });
  Object.defineProperty(audio, "currentSrc", { configurable: true, value: new URL("/a.wav", document.baseURI).href });
  view.rerender(<Timeline {...props} resumeProjectId="stale-metadata" resumeSource={next} take={{ ...take, id: "next", url: "/next.wav" }} />);
  fireEvent.durationChange(audio);
  expect(loadResumePosition("stale-metadata", next)).toBe(70);
  expect(audio.currentTime).toBe(70);
  Object.defineProperty(audio, "duration", { configurable: true, value: 80 });
  Object.defineProperty(audio, "currentSrc", { configurable: true, value: new URL("/next.wav", document.baseURI).href });
  audio.currentTime = 0;
  fireEvent.loadedMetadata(audio);
  expect(audio.currentTime).toBe(70);
});
