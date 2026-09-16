import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import type { EngineProfileSchema, EnvironmentNoiseProfile, ProjectMediaAsset, ProjectVoice, SpeakerProfile, TrainingCatalog } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface VoiceVaultProps {
  catalog: TrainingCatalog;
  assets: ProjectMediaAsset[];
  profileSchema: EngineProfileSchema | null;
  selectedVoice: string;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSelectVoice: (voiceId: string) => void;
  /** Voices Voice Training made, listed under the profile they speak for. */
  voices?: ProjectVoice[];
  onDeleteVoice?: (voice: ProjectVoice) => void;
  onDeleteSpeaker?: (speaker: SpeakerProfile) => void;
  onDeleteEnvironment?: (profile: EnvironmentNoiseProfile) => void;
}

const VOICE_KIND_LABELS: Record<string, string> = { clone: "nhái giọng", lora: "LoRA", full: "full fine-tune", vc: "đổi giọng" };

type ProfileType = "speaker" | "environment";
const PROFILE_COLORS = ["#ff6745", "#a8d85d", "#eac75f", "#66a9d8", "#d87858"];
const REGION_OPTIONS = ["Miền Bắc", "Miền Trung", "Miền Nam", "Đông", "Tây", "Nam", "Bắc", "Đông Bắc", "Đông Nam", "Tây Bắc", "Tây Nam"];

function freshSpeaker(index: number): SpeakerProfile {
  return {
    id: `speaker-${crypto.randomUUID().slice(0, 12)}`,
    name: "",
    language: null,
    languageId: null,
    region: null,
    age: null,
    gender: "unspecified",
    attributes: {},
    color: PROFILE_COLORS[index % PROFILE_COLORS.length],
    createdAt: new Date().toISOString(),
  };
}

function freshEnvironment(): EnvironmentNoiseProfile {
  return {
    id: `environment-${crypto.randomUUID().slice(0, 12)}`,
    name: "",
    assetIds: [],
    attributes: {},
    createdAt: new Date().toISOString(),
  };
}

function speakerSummary(speaker: SpeakerProfile) {
  return [speaker.language, speaker.region, speaker.age, speaker.gender === "male" ? "Male" : speaker.gender === "female" ? "Female" : null].filter(Boolean).join(" · ") || "Chưa bổ sung thuộc tính";
}

export function VoiceVault({ catalog, assets, profileSchema, selectedVoice, onCatalogChange, onSelectVoice, voices = [], onDeleteVoice, onDeleteSpeaker, onDeleteEnvironment }: VoiceVaultProps) {
  const [activeType, setActiveType] = useState<ProfileType>("speaker");
  const [profileMenu, setProfileMenu] = useState<{ type: ProfileType; id: string; left: number; top: number } | null>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<SpeakerProfile | null>(null);
  const [editingEnvironment, setEditingEnvironment] = useState<EnvironmentNoiseProfile | null>(null);
  const facets = profileSchema?.facets ?? [];
  const facetById = useMemo(() => new Map(facets.map((facet) => [facet.id, facet])), [facets]);
  const languageId = editingSpeaker?.languageId?.toLocaleLowerCase() ?? "";
  const languageLabel = editingSpeaker?.language?.toLocaleLowerCase() ?? "";
  const isEnglish = languageId === "en" || languageId.startsWith("en-") || languageLabel.includes("english") || languageLabel.includes("tiếng anh");
  const isChinese = languageId === "zh" || languageId.startsWith("zh-") || languageLabel.includes("chinese") || languageLabel.includes("tiếng trung");

  function editSpeaker(profile?: SpeakerProfile) {
    setActiveType("speaker");
    setEditingEnvironment(null);
    setEditingSpeaker(profile ? { ...profile, attributes: { ...profile.attributes } } : freshSpeaker(catalog.speakers.length));
  }

  function editEnvironment(profile?: EnvironmentNoiseProfile) {
    setActiveType("environment");
    setEditingSpeaker(null);
    setEditingEnvironment(profile ? { ...profile, assetIds: [...profile.assetIds], attributes: { ...profile.attributes } } : freshEnvironment());
  }

  function saveSpeaker(event: FormEvent) {
    event.preventDefault();
    if (!editingSpeaker?.name.trim()) return;
    const profile = { ...editingSpeaker, name: editingSpeaker.name.trim() };
    const exists = catalog.speakers.some((speaker) => speaker.id === profile.id);
    onCatalogChange({ ...catalog, speakers: exists ? catalog.speakers.map((speaker) => speaker.id === profile.id ? profile : speaker) : [...catalog.speakers, profile] });
    onSelectVoice(profile.id);
    setEditingSpeaker(null);
  }

  function saveEnvironment(event: FormEvent) {
    event.preventDefault();
    if (!editingEnvironment?.name.trim()) return;
    const profile = { ...editingEnvironment, name: editingEnvironment.name.trim() };
    const exists = catalog.environmentProfiles.some((environment) => environment.id === profile.id);
    onCatalogChange({ ...catalog, environmentProfiles: exists ? catalog.environmentProfiles.map((environment) => environment.id === profile.id ? profile : environment) : [...catalog.environmentProfiles, profile] });
    setEditingEnvironment(null);
  }

  function updateSpeakerAttribute(id: string, value: string) {
    setEditingSpeaker((current) => current ? { ...current, attributes: { ...current.attributes, [id]: value } } : current);
  }

  function updateEnvironmentAttribute(id: string, value: string) {
    setEditingEnvironment((current) => current ? { ...current, attributes: { ...current.attributes, [id]: value } } : current);
  }

  function speakerFacet(facetId: string, label?: string, hint?: string) {
    const facet = facetById.get(facetId);
    if (!facet || !editingSpeaker) return null;
    return (
      <label key={facet.id}>
        <span>{label ?? facet.label}</span>
        <select onChange={(event) => updateSpeakerAttribute(facet.id, event.target.value)} value={editingSpeaker.attributes[facet.id] ?? ""}>
          <option value="">Không gán</option>
          {facet.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        {hint ? <small className="profile-field-hint">{hint}</small> : null}
      </label>
    );
  }

  return (
    <ModuleFrame
      action={<button aria-label={activeType === "speaker" ? "Thêm Speaker Profile" : "Thêm Environment Profile"} className="voice-vault-add" onClick={() => activeType === "speaker" ? editSpeaker() : editEnvironment()} type="button"><Icon name="plus" /> ADD</button>}
      className="voice-vault-module"
      eyebrow="SOUND LIBRARY"
      title="Profiles"
    >
      <div className="sound-library-tabs" role="tablist" aria-label="Sound Library profile type">
        <button aria-selected={activeType === "speaker"} className={activeType === "speaker" ? "is-active" : ""} onClick={() => setActiveType("speaker")} role="tab" type="button"><Icon name="person" />Speaker Profiles <b>{catalog.speakers.length}</b></button>
        <button aria-selected={activeType === "environment"} className={activeType === "environment" ? "is-active" : ""} onClick={() => setActiveType("environment")} role="tab" type="button"><Icon name="landscape" />Environment Profiles <b>{catalog.environmentProfiles.length}</b></button>
      </div>
      {editingSpeaker ? (
        <form className="speaker-profile-form sound-profile-form" onSubmit={saveSpeaker}>
          <header><Icon name="person" /><b>{catalog.speakers.some((speaker) => speaker.id === editingSpeaker.id) ? "Speaker Profile Properties" : "New Speaker Profile"}</b></header>
          <label className="is-wide"><span>Tên người nói</span><input autoFocus onChange={(event) => setEditingSpeaker({ ...editingSpeaker, name: event.target.value })} placeholder="Nguyễn Văn A" value={editingSpeaker.name} /></label>
          <label><span>Màu đại diện</span><input aria-label="Màu đại diện Speaker" onChange={(event) => setEditingSpeaker({ ...editingSpeaker, color: event.target.value })} type="color" value={editingSpeaker.color || "#ff6745"} /></label>
          <label><span>Ngôn ngữ · OmniVoice</span><select onChange={(event) => { const choice = profileSchema?.languages.find((language) => language.id === event.target.value); setEditingSpeaker({ ...editingSpeaker, languageId: choice?.id ?? null, language: choice?.label ?? null }); }} value={editingSpeaker.languageId ?? ""}><option value="">Chưa chọn</option>{profileSchema?.languages.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}</select></label>
          <label><span>Region</span><select onChange={(event) => setEditingSpeaker({ ...editingSpeaker, region: event.target.value || null })} value={editingSpeaker.region ?? ""}><option value="">Chưa chọn</option>{REGION_OPTIONS.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
          {["age", "gender"].map((facetId) => {
            const facet = facetById.get(facetId);
            if (!facet) return null;
            const value = facetId === "age" ? editingSpeaker.age ?? "" : editingSpeaker.gender;
            return <label key={facetId}><span>{facet.label}</span><select onChange={(event) => facetId === "age" ? setEditingSpeaker({ ...editingSpeaker, age: event.target.value || null }) : setEditingSpeaker({ ...editingSpeaker, gender: event.target.value })} value={value}><option value="">Chưa chọn</option>{facet.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
          })}
          <details className="profile-advanced">
            <summary>Thuộc tính OmniVoice nâng cao</summary>
            <div className="profile-advanced__grid">
              {speakerFacet("pitch")}
              {speakerFacet("style")}
              {isEnglish ? speakerFacet("accent", "Giọng tiếng Anh", "Chỉ dùng khi profile nói tiếng Anh.") : null}
              {isChinese ? speakerFacet("dialect", "Phương ngữ tiếng Trung", "Chỉ dùng khi profile nói tiếng Trung.") : null}
            </div>
          </details>
          <fieldset className="profile-consent is-wide">
            <legend>Đồng ý dùng giọng</legend>
            <label className="profile-consent__check"><input checked={Boolean(editingSpeaker.voiceConsent)} onChange={(event) => setEditingSpeaker({ ...editingSpeaker, voiceConsent: event.target.checked ? { grantedBy: editingSpeaker.name.trim(), note: null, confirmedAt: new Date().toISOString() } : null })} type="checkbox" /><span>Chủ giọng đã đồng ý cho dùng giọng này để đổi giọng trong project</span></label>
            {editingSpeaker.voiceConsent ? <>
              <label><span>Người đồng ý</span><input aria-label="Người đồng ý" onChange={(event) => setEditingSpeaker({ ...editingSpeaker, voiceConsent: { ...editingSpeaker.voiceConsent!, grantedBy: event.target.value } })} value={editingSpeaker.voiceConsent.grantedBy} /></label>
              <label><span>Căn cứ</span><input aria-label="Căn cứ đồng ý" onChange={(event) => setEditingSpeaker({ ...editingSpeaker, voiceConsent: { ...editingSpeaker.voiceConsent!, note: event.target.value || null } })} placeholder="Ví dụ: hợp đồng, tin nhắn ngày…" value={editingSpeaker.voiceConsent.note ?? ""} /></label>
              <small>Ghi nhận lúc {new Date(editingSpeaker.voiceConsent.confirmedAt).toLocaleString("vi-VN")}. Voice Changer chỉ đổi sang giọng của profile có xác nhận này.</small>
            </> : <small>Chưa có xác nhận: profile vẫn dùng được cho STT và training, nhưng không làm giọng giả trong Voice Changer.</small>}
          </fieldset>
          <div className="speaker-profile-actions">{onDeleteSpeaker && catalog.speakers.some((speaker) => speaker.id === editingSpeaker.id) ? <button className="button button--quiet is-danger" onClick={() => { const target = catalog.speakers.find((speaker) => speaker.id === editingSpeaker.id); setEditingSpeaker(null); if (target) onDeleteSpeaker(target); }} type="button">Xoá profile</button> : null}<button className="button button--quiet" onClick={() => setEditingSpeaker(null)} type="button">Hủy</button><button className="button button--accent" disabled={!editingSpeaker.name.trim() || Boolean(editingSpeaker.voiceConsent && !editingSpeaker.voiceConsent.grantedBy.trim())} type="submit">Xác nhận & lưu profile</button></div>
        </form>
      ) : null}
      {editingEnvironment ? (
        <form className="speaker-profile-form sound-profile-form" onSubmit={saveEnvironment}>
          <header><Icon name="landscape" /><b>{catalog.environmentProfiles.some((profile) => profile.id === editingEnvironment.id) ? "Environment Profile Properties" : "New Environment Profile"}</b></header>
          <label className="is-wide"><span>Tên môi trường</span><input autoFocus onChange={(event) => setEditingEnvironment({ ...editingEnvironment, name: event.target.value })} placeholder="Phòng thu yên tĩnh" value={editingEnvironment.name} /></label>
          <label className="is-wide"><span>Loại / ghi chú</span><input onChange={(event) => updateEnvironmentAttribute("description", event.target.value)} placeholder="Indoor, street, rain..." value={editingEnvironment.attributes.description ?? ""} /></label>
          <fieldset className="sound-profile-assets"><legend>Footage tham chiếu</legend>{assets.map((asset) => <label key={asset.id}><input checked={editingEnvironment.assetIds.includes(asset.id)} onChange={(event) => setEditingEnvironment({ ...editingEnvironment, assetIds: event.target.checked ? [...editingEnvironment.assetIds, asset.id] : editingEnvironment.assetIds.filter((id) => id !== asset.id) })} type="checkbox" /><span>{asset.name}</span></label>)}{!assets.length ? <p>Chưa có footage để gán làm mẫu môi trường.</p> : null}</fieldset>
          <div className="speaker-profile-actions">{onDeleteEnvironment && catalog.environmentProfiles.some((profile) => profile.id === editingEnvironment.id) ? <button className="button button--quiet is-danger" onClick={() => { const target = catalog.environmentProfiles.find((profile) => profile.id === editingEnvironment.id); setEditingEnvironment(null); if (target) onDeleteEnvironment(target); }} type="button">Xoá profile</button> : null}<button className="button button--quiet" onClick={() => setEditingEnvironment(null)} type="button">Hủy</button><button className="button button--accent" disabled={!editingEnvironment.name.trim()} type="submit">Xác nhận & lưu profile</button></div>
        </form>
      ) : null}
      {!editingSpeaker && !editingEnvironment ? (
        <div className="voice-vault__list sound-library-list">
          {activeType === "speaker" ? catalog.speakers.map((speaker) => {
            const own = voices.filter((voice) => voice.speakerProfileId === speaker.id);
            return (
            <div className="voice-card-group" key={speaker.id}>
            <button className={`voice-card ${selectedVoice === speaker.id ? "is-active" : ""}`} onClick={() => onSelectVoice(speaker.id)} onContextMenu={(event) => { event.preventDefault(); setProfileMenu({ type: "speaker", id: speaker.id, left: event.clientX, top: event.clientY }); }} onDoubleClick={() => editSpeaker(speaker)} title="Double click hoặc right click để mở Properties" type="button">
              <span className="voice-card__avatar" style={{ backgroundColor: speaker.color }}><Icon name="person" /></span><span className="voice-card__copy"><strong>{speaker.name}</strong><span>{speakerSummary(speaker)}</span><small className={speaker.voiceConsent ? "is-consented" : ""}>{speaker.voiceConsent ? "✓ Đã đồng ý dùng giọng" : "Chưa xác nhận đồng ý dùng giọng"} · {own.length} voice · Properties</small></span><i aria-hidden="true" />
            </button>
            {own.length ? (
              <ul aria-label={`Voice của ${speaker.name}`} className="voice-card__voices">
                {own.map((voice) => (
                  <li key={voice.id} title={`${voice.id} · tạo ${new Date(voice.createdAt).toLocaleString("vi-VN", { hour12: false })}`}>
                    <span>{voice.name}</span>
                    <small>{VOICE_KIND_LABELS[voice.kind] ?? voice.kind} · {new Date(voice.createdAt).toLocaleDateString("vi-VN")}</small>
                    {onDeleteVoice ? <button aria-label={`Xoá voice ${voice.name}`} onClick={() => onDeleteVoice(voice)} title="Xoá voice" type="button">×</button> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            </div>
            );
          }) : catalog.environmentProfiles.map((profile) => (
            <button className="voice-card environment-card" key={profile.id} onClick={() => editEnvironment(profile)} onContextMenu={(event) => { event.preventDefault(); setProfileMenu({ type: "environment", id: profile.id, left: event.clientX, top: event.clientY }); }} onDoubleClick={() => editEnvironment(profile)} title="Double click hoặc right click để mở Properties" type="button">
              <span className="voice-card__avatar"><Icon name="landscape" /></span><span className="voice-card__copy"><strong>{profile.name}</strong><span>{profile.attributes.description || "Environment profile"}</span><small>{profile.assetIds.length} footage tham chiếu · Properties</small></span><i aria-hidden="true" />
            </button>
          ))}
          {activeType === "speaker" && !catalog.speakers.length ? <div className="voice-vault-empty"><Icon name="person" /><b>Chưa có Speaker Profile</b><span>Thêm người nói trước khi phân vai footage hoặc bắt đầu training.</span></div> : null}
          {activeType === "environment" && !catalog.environmentProfiles.length ? <div className="voice-vault-empty"><Icon name="landscape" /><b>Chưa có Environment Profile</b><span>Đặt profile cho tiếng ồn/môi trường và gán cho footage hoặc từ trong transcript.</span></div> : null}
        </div>
      ) : null}
      {profileMenu ? createPortal(
        <div className="sound-profile-context-menu" role="menu" style={{ left: profileMenu.left, top: profileMenu.top }}>
          <button onClick={() => {
            const profile = profileMenu.type === "speaker"
              ? catalog.speakers.find((item) => item.id === profileMenu.id)
              : catalog.environmentProfiles.find((item) => item.id === profileMenu.id);
            setProfileMenu(null);
            if (profileMenu.type === "speaker" && profile) editSpeaker(profile as SpeakerProfile);
            if (profileMenu.type === "environment" && profile) editEnvironment(profile as EnvironmentNoiseProfile);
          }} role="menuitem" type="button"><Icon name="settings" /> Properties</button>
          {(profileMenu.type === "speaker" ? onDeleteSpeaker : onDeleteEnvironment) ? <button className="project-context-menu__danger" onClick={() => {
            const menu = profileMenu;
            setProfileMenu(null);
            if (menu.type === "speaker") {
              const target = catalog.speakers.find((item) => item.id === menu.id);
              if (target) onDeleteSpeaker?.(target);
            } else {
              const target = catalog.environmentProfiles.find((item) => item.id === menu.id);
              if (target) onDeleteEnvironment?.(target);
            }
          }} role="menuitem" type="button">Xoá profile</button> : null}
        </div>,
        document.body,
      ) : null}
    </ModuleFrame>
  );
}