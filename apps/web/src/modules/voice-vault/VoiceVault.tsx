import { ModuleFrame } from "../../ui/ModuleFrame";

interface VoiceVaultProps {
  selectedVoice: string;
  onSelectVoice: (voiceId: string) => void;
}

const voices = [
  {
    id: "mien_nam_trained",
    initials: "HV",
    name: "Hoàng Anh Vũ",
    subtitle: "Giọng miền Nam · fine-tune",
    badge: "5.000 steps",
    color: "#ff6b43",
  },
  {
    id: "quick-reference",
    initials: "QR",
    name: "Quick Reference",
    subtitle: "Prompt từ bản thu hiện tại",
    badge: "Ready",
    color: "#c7ed67",
  },
  {
    id: "omni-auto",
    initials: "OA",
    name: "Omni Auto",
    subtitle: "Model tự chọn chất giọng",
    badge: "600+ languages",
    color: "#e6bd48",
  },
];

export function VoiceVault({ selectedVoice, onSelectVoice }: VoiceVaultProps) {
  return (
    <ModuleFrame eyebrow="VOICE VAULT" title="Kho giọng" className="voice-vault-module">
      <div className="voice-vault__list">
        {voices.map((voice) => (
          <button
            className={`voice-card ${selectedVoice === voice.id ? "is-active" : ""}`}
            key={voice.id}
            onClick={() => onSelectVoice(voice.id)}
            type="button"
          >
            <span className="voice-card__avatar" style={{ backgroundColor: voice.color }}>
              {voice.initials}
            </span>
            <span className="voice-card__copy">
              <strong>{voice.name}</strong>
              <span>{voice.subtitle}</span>
              <small>{voice.badge}</small>
            </span>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="module-note">
        <b>ENGINE SEAM</b>
        <span>Voice UI chỉ dùng Voice Profile, không phụ thuộc class của OmniVoice.</span>
      </div>
    </ModuleFrame>
  );
}
