import type { WorkspacePage } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  workflow: WorkspacePage;
  onGenerate?: () => void;
  onDeferredAction?: (action: string) => void;
}

export function ScriptEditor({ value, onChange, workflow, onGenerate, onDeferredAction }: ScriptEditorProps) {
  const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0;
  const duration = Math.round(wordCount / 2.65);
  const canGenerate = workflow === "voice-manipulator";

  return (
    <ModuleFrame
      eyebrow="SCRIPT"
      title={workflow === "voice-training" ? "Training transcript" : "Nội dung & transcript"}
      className="script-module"
      action={
        <div className="script-module__duration">
          <span>EST. DURATION</span>
          <strong>
            {String(Math.floor(duration / 60)).padStart(2, "0")}:
            {String(duration % 60).padStart(2, "0")}
          </strong>
        </div>
      }
    >
      <div className="script-review-strip">
        <strong>TRANSCRIPT LAYERS</strong>
        <span className="candidate candidate--realtime">Realtime</span>
        <span className="candidate candidate--stt">STT kỹ</span>
        <span className="candidate candidate--ai">AI fix</span>
        <span className="review-status"><i /> Direct edit ready</span>
      </div>
      <textarea
        aria-label="Script transcript"
        className="script-editor"
        maxLength={12000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Transcript realtime, STT kỹ và AI fix sẽ cùng xuất hiện ở đây..."
        spellCheck
        value={value}
      />
      <div className="script-module__footer">
        <div className="script-stats">
          <span><b>{wordCount}</b> từ</span>
          <span><b>{value.length.toLocaleString("vi-VN")}</b> / 12.000</span>
        </div>
        <div className="script-actions">
          {workflow === "speech-to-text" ? (
            <>
              <button className="button button--quiet" onClick={() => onDeferredAction?.("STT kỹ")} type="button">Nhận diện kỹ</button>
              <button className="button button--lime" onClick={() => onDeferredAction?.("AI fix")} type="button"><Icon name="spark" />AI fix</button>
            </>
          ) : null}
          {workflow === "voice-training" ? (
            <button className="button button--lime" onClick={() => onDeferredAction?.("Dataset review")} type="button"><Icon name="spark" />Duyệt cho dataset</button>
          ) : null}
          {canGenerate ? (
            <button aria-label="Tạo voice" className="button button--accent" onClick={onGenerate} type="button">
              <span><b>Tạo voice</b><small>OmniVoice · 32 steps</small></span>
              <Icon name="arrow" />
            </button>
          ) : null}
        </div>
      </div>
    </ModuleFrame>
  );
}
