import type { ComponentProps } from "react";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { SubtitleAlignmentControl } from "./SubtitleAlignmentDialog";

export function SubtitleRefinementPanel(props: ComponentProps<typeof SubtitleAlignmentControl>) {
  return <ModuleFrame title="Tinh chỉnh subtitle" eyebrow="TIMING / VOICE / WAVEFORM" className="subtitle-refinement-module">
    <p>Kiểm tra lệch chữ / voice, thử từng cách bù offset hoặc căn biên từ.</p>
    <SubtitleAlignmentControl {...props} triggerLabel="Mở tinh chỉnh subtitle" />
    <small>Chọn footage hoặc track đã STT. Mốc chỉnh tay được khóa; mỗi đề xuất có thể nghe trước, áp dụng và khôi phục.</small>
  </ModuleFrame>;
}
