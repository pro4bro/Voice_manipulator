import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface VoicePatchProps {
  hasTake: boolean;
}

export function VoicePatch({ hasTake }: VoicePatchProps) {
  return (
    <ModuleFrame eyebrow="VOICE PATCH" title="Vá đoạn hỏng" index="02" className="voice-patch-module" tone="warm">
      <div className="patch-range">
        <label><span>START</span><input defaultValue="00:00.000" /></label>
        <i>→</i>
        <label><span>END</span><input defaultValue="00:00.000" /></label>
      </div>
      <label className="patch-copy">
        <span>NỘI DUNG ĐỌC LẠI</span>
        <input placeholder="Nhập câu đúng cho vùng đã chọn..." />
      </label>
      <button className="button button--lime button--full" disabled={!hasTake} type="button">
        <Icon name="wrench" />Vá theo từ
      </button>
    </ModuleFrame>
  );
}

