import { useState, type FormEvent } from "react";

import type { SpeakerGender, SpeakerProfile } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface VoiceVaultProps {
  speakers: SpeakerProfile[];
  selectedVoice: string;
  onAddSpeaker: (speaker: SpeakerProfile) => void;
  onSelectVoice: (voiceId: string) => void;
}

const PROFILE_COLORS = ["#ff6745", "#a8d85d", "#eac75f", "#66a9d8", "#d87858"];

export function VoiceVault({ speakers, selectedVoice, onAddSpeaker, onSelectVoice }: VoiceVaultProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("Tiếng Việt");
  const [region, setRegion] = useState("Miền Nam");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<SpeakerGender>("unspecified");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const speaker: SpeakerProfile = {
      id: `speaker-${crypto.randomUUID().slice(0, 12)}`,
      name: name.trim(),
      language: language.trim() || null,
      region: region.trim() || null,
      age: age ? Number(age) : null,
      gender,
      color: PROFILE_COLORS[speakers.length % PROFILE_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    onAddSpeaker(speaker);
    onSelectVoice(speaker.id);
    setName("");
    setAge("");
    setShowForm(false);
  }

  return (
    <ModuleFrame
      action={<button aria-label="Add voice training" className="voice-vault-add" onClick={() => setShowForm((current) => !current)} type="button"><Icon name="plus" /> ADD VOICE</button>}
      className="voice-vault-module"
      eyebrow="VOICE VAULT"
      title="Speaker Profiles"
    >
      {showForm ? (
        <form className="speaker-profile-form" onSubmit={submit}>
          <label className="is-wide"><span>Tên người nói</span><input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Nguyễn Văn A" value={name} /></label>
          <label><span>Ngôn ngữ</span><input onChange={(event) => setLanguage(event.target.value)} value={language} /></label>
          <label><span>Miền</span><input onChange={(event) => setRegion(event.target.value)} value={region} /></label>
          <label><span>Tuổi</span><input max="120" min="0" onChange={(event) => setAge(event.target.value)} type="number" value={age} /></label>
          <label><span>Giới tính</span><select onChange={(event) => setGender(event.target.value as SpeakerGender)} value={gender}><option value="unspecified">Không xác định</option><option value="male">Nam</option><option value="female">Nữ</option><option value="nonbinary">Khác</option></select></label>
          <div className="speaker-profile-actions"><button className="button button--quiet" onClick={() => setShowForm(false)} type="button">Hủy</button><button className="button button--accent" disabled={!name.trim()} type="submit">Lưu profile</button></div>
        </form>
      ) : null}
      <div className="voice-vault__list">
        {speakers.map((speaker) => (
          <button className={`voice-card ${selectedVoice === speaker.id ? "is-active" : ""}`} key={speaker.id} onClick={() => onSelectVoice(speaker.id)} type="button">
            <span className="voice-card__avatar" style={{ backgroundColor: speaker.color }}>{speaker.name.split(/\s+/u).slice(-2).map((part) => part[0]).join("").toUpperCase()}</span>
            <span className="voice-card__copy">
              <strong>{speaker.name}</strong>
              <span>{[speaker.language, speaker.region].filter(Boolean).join(" · ") || "Chưa bổ sung vùng giọng"}</span>
              <small>{speaker.age ? `${speaker.age} tuổi · ` : ""}{speaker.gender === "male" ? "Nam" : speaker.gender === "female" ? "Nữ" : speaker.gender === "nonbinary" ? "Khác" : "Chưa xác định"}</small>
            </span>
            <i aria-hidden="true" />
          </button>
        ))}
        {!speakers.length ? <div className="voice-vault-empty"><b>Chưa có Speaker Profile</b><span>Thêm người nói trước khi phân vai footage hoặc bắt đầu training.</span></div> : null}
      </div>
    </ModuleFrame>
  );
}
