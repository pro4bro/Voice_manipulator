import { describe, expect, it } from "vitest";

import type { VoiceScriptRow } from "../../domain/types";
import { scriptHighlightTokens } from "./script-highlight-diff";

const row = (id: string, text: string): VoiceScriptRow => ({ id, text, voiceId: null, speakerProfileId: null });

describe("scriptHighlightTokens", () => {
  it("does not highlight until a successful generation snapshot exists", () => {
    expect(scriptHighlightTokens("A sửa", null, [row("r1", "A cũ")], "r1")).toEqual([]);
  });

  it("keeps fixed words faded while new edits stay strong and preserves whitespace", () => {
    const tokens = scriptHighlightTokens("Một   câu tối mai\nđây", [row("r1", "Một   câu sáng mai\nđây")], [row("r1", "Một   câu sáng sớm\nđây")], "r1");
    expect(tokens.map(({ text, whitespace, state }) => [text, whitespace, state])).toEqual([
      ["Một", "   ", null], ["câu", " ", null], ["tối", " ", "pending"], ["mai", "\n", "fixed"], ["đây", "", null],
    ]);
  });

  it("marks all text in a newly inserted post-generation row as pending", () => {
    expect(scriptHighlightTokens("Lời mới", [row("r1", "Trước đó")], [row("r1", "Trước đó")], "r2").map((token) => token.state)).toEqual(["pending", "pending"]);
  });

  it("marks a surviving word as the edit anchor for a deletion-only change", () => {
    const tokens = scriptHighlightTokens("Một câu mai", [row("r1", "Một câu sáng mai")], [row("r1", "Một câu sáng mai")], "r1");
    expect(tokens.find((token) => token.state === "pending")?.text).toBe("mai");
  });

  it("marks one surviving anchor for each deletion-only run", () => {
    const tokens = scriptHighlightTokens("A B C", [row("r1", "A x B y C")], [row("r1", "A x B y C")], "r1");
    expect(tokens.filter((token) => token.state === "pending").map((token) => token.text)).toEqual(["B", "C"]);
  });

  it("shows a visible pending marker when all generated text is deleted", () => {
    expect(scriptHighlightTokens("", [row("r1", "Đã tạo" )], [row("r1", "Đã tạo")], "r1")).toEqual([{ text: "", whitespace: "", state: "pending" }]);
  });

  it("does not mark a large row when its current and generated tokens are identical", () => {
    const text = Array.from({ length: 1001 }, (_, index) => `t${index}`).join(" ");
    expect(scriptHighlightTokens(text, [row("r1", text)], [row("r1", text)], "r1").some((token) => token.state !== null)).toBe(false);
  });
});
