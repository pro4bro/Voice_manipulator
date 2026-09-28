import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { ReadingPack, ReadingPassage } from "../../domain/types";
import { TrainingScriptDialog } from "./TrainingScriptDialog";

describe("TrainingScriptDialog", () => {
  it("selects authored passages and removes them with one confirmation", async () => {
    const passages: ReadingPassage[] = ["Bài một", "Bài hai"].map((title, index) => ({
      id: `passage-${index}`, kind: "emotion", emotion: "normal", title, direction: "", regions: [], genders: [], ageRanges: [], source: "authored", cards: [{ id: `card-${index}`, text: title, tags: [], wordCount: 2, estimatedSeconds: 2 }], wordCount: 2, estimatedSeconds: 2,
    }));
    const pack = { packId: "vi-authored", language: "vi", languageName: "Tiếng Việt", title: "Tự soạn", version: 1, license: "local", passageCount: 2, cardCount: 2, wordCount: 4, estimatedSeconds: 4, emotions: ["normal"], passages } as ReadingPack;
    window.localStorage.setItem("pro4bro.authoring.passcode", "test-passcode");
    vi.spyOn(api, "getReadingAudience").mockResolvedValue({ genders: [], ageRanges: [], regionsByLanguage: {} });
    vi.spyOn(api, "getReadingPack").mockResolvedValue(pack);
    const deletePassage = vi.spyOn(api, "deleteReadingPassage").mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSaved = vi.fn();
    try {
      render(<TrainingScriptDialog onClose={vi.fn()} onSaved={onSaved} />);
      fireEvent.change(screen.getByRole("textbox", { name: /TÊN NGƯỜI SOẠN/ }), { target: { value: "Tester" } });
      fireEvent.change(screen.getByLabelText(/MẬT KHẨU/), { target: { value: "test-passcode" } });
      fireEvent.click(screen.getByRole("button", { name: "Mở trình soạn" }));
      expect(await screen.findByRole("list", { name: "Bài đọc tự soạn" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Chọn bài đọc Bài một" }));
      fireEvent.click(screen.getByRole("button", { name: "Chọn bài đọc Bài hai" }), { shiftKey: true });
      fireEvent.click(screen.getByRole("button", { name: "Xoá đã chọn" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Đã xoá 2/2 bài đọc tự soạn."));
      expect(confirm).toHaveBeenCalledOnce();
      expect(deletePassage).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
      window.localStorage.removeItem("pro4bro.authoring.passcode");
    }
  });
});
