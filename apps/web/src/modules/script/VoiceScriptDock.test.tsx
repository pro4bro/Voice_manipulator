import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { migrateScript } from "../../domain/voice-script-document";
import { VoiceScript } from "./VoiceScript";

describe("Script settings dock", () => {
  it("keeps editing the same document while settings render in the right column", () => {
    const changed = vi.fn();
    function Harness() {
      const [host, setHost] = useState<HTMLDivElement | null>(null);
      const [document, setDocument] = useState(() => migrateScript([{ id: "r1", text: "Xin chào", speakerProfileId: null, voiceId: null }]));
      return <><aside data-testid="right"><div ref={setHost} /></aside><VoiceScript settingsHost={host}
        document={document} onDocumentChange={(next) => { changed(next); setDocument(next); }}
        rows={document.rows} onRowsChange={vi.fn()} speakers={[]} voices={[]} category="clone"
        output={null} playbackId={null} onRead={vi.fn()} /></>;
    }
    render(<Harness />);
    const right = screen.getByTestId("right");
    const settings = screen.getByRole("region", { name: "Hướng dẫn giọng và timing" });
    expect(right).toContainElement(settings);
    expect(screen.getByRole("heading", { name: "SCRIPT" }).closest("section")).not.toContainElement(settings);
    fireEvent.click(within(right).getByText("Cấu trúc và hướng dẫn đọc · clip / đoạn / câu"));
    fireEvent.change(within(right).getByLabelText("Thời lượng mong muốn (giây)"), { target: { value: "3.5" } });
    expect(changed).toHaveBeenCalled();
    expect(changed.mock.lastCall![0].rows[0].settings.duration).toBe(3.5);
    expect(screen.getByDisplayValue("Xin chào")).toBeInTheDocument();
  });
});
