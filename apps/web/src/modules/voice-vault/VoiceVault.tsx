import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { EngineProfileSchema, EnvironmentNoiseProfile, ProjectMediaAsset, ProjectVoice, SpeakerProfile, TrainingCatalog, VoiceCollectionImport } from "../../domain/types";
import { api } from "../../api/client";
import { CollectionDialog } from "../voice-collection/CollectionDialog";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import "../../ui/list-canvas.css";

interface VoiceVaultProps {
  projectId?: string;
  onCollectionImported?: (result: VoiceCollectionImport) => void;
  onPrepareCollectionExport?: () => Promise<void>;
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
  onDeleteVoices?: (voices: ProjectVoice[]) => void;
  onDeleteSpeakers?: (speakers: SpeakerProfile[]) => void;
  onDeleteEnvironments?: (profiles: EnvironmentNoiseProfile[]) => void;
}

const VOICE_KIND_LABELS: Record<string, string> = { clone: "nhái giọng", lora: "LoRA", full: "full fine-tune", vc: "đổi giọng" };
const EMPTY_PROJECT_VOICES: ProjectVoice[] = [];

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

export function VoiceVault({ projectId, onCollectionImported, onPrepareCollectionExport, catalog, assets, profileSchema, selectedVoice, onCatalogChange, onSelectVoice, voices = EMPTY_PROJECT_VOICES, onDeleteVoice, onDeleteSpeaker, onDeleteEnvironment, onDeleteVoices, onDeleteSpeakers, onDeleteEnvironments }: VoiceVaultProps) {
  const [addMenu, setAddMenu] = useState(false);
  const [collectionMode, setCollectionMode] = useState<{ voice?: ProjectVoice } | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const evidenceSerial = useRef(0);
  useEffect(() => () => { evidenceSerial.current += 1; }, []);
  useEffect(() => {
    if (!addMenu) return;
    const close = (event: globalThis.PointerEvent) => { if (!(event.target as Element)?.closest(".voice-vault-add-options")) setAddMenu(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setAddMenu(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [addMenu]);
  const [activeType, setActiveType] = useState<ProfileType>("speaker");
  const [profileMenu, setProfileMenu] = useState<{ type: ProfileType; id: string; left: number; top: number } | null>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<SpeakerProfile | null>(null);
  const [editingEnvironment, setEditingEnvironment] = useState<EnvironmentNoiseProfile | null>(null);
  const [profileSelection, setProfileSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const [voiceSelection, setVoiceSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const [bulkSpeakerColor, setBulkSpeakerColor] = useState("#ff6745");
  const profileItems = activeType === "speaker" ? catalog.speakers : catalog.environmentProfiles;
  const profileIds = profileItems.map((item) => item.id);
  const voiceIds = voices.map((item) => item.id);
  const selectedProfileIds = reconcileListSelection(profileSelection, profileIds).ids;
  const selectedVoiceIds = reconcileListSelection(voiceSelection, voiceIds).ids;
  useEffect(() => setProfileSelection((current) => reconcileListSelection(current, profileIds)), [catalog, activeType]);
  useEffect(() => setVoiceSelection((current) => reconcileListSelection(current, voiceIds)), [voices]);
  const facets = profileSchema?.facets ?? [];
  const facetById = useMemo(() => new Map(facets.map((facet) => [facet.id, facet])), [facets]);
  const languageId = editingSpeaker?.languageId?.toLocaleLowerCase() ?? "";
  const languageLabel = editingSpeaker?.language?.toLocaleLowerCase() ?? "";
  const isEnglish = languageId === "en" || languageId.startsWith("en-") || languageLabel.includes("english") || languageLabel.includes("tiếng anh");
  const isChinese = languageId === "zh" || languageId.startsWith("zh-") || languageLabel.includes("chinese") || languageLabel.includes("tiếng trung");

  function editSpeaker(profile?: SpeakerProfile) {
    evidenceSerial.current += 1; setEvidenceBusy(false); setEvidenceError(null); setAddMenu(false);
    setActiveType("speaker");
    setEditingEnvironment(null);
    setEditingSpeaker(profile ? { ...profile, attributes: { ...profile.attributes } } : freshSpeaker(catalog.speakers.length));
  }

  function editEnvironment(profile?: EnvironmentNoiseProfile) {
    setAddMenu(false);
    setActiveType("environment");
    setEditingSpeaker(null);
    setEditingEnvironment(profile ? { ...profile, assetIds: [...profile.assetIds], attributes: { ...profile.attributes } } : freshEnvironment());
  }

  function saveSpeaker(event: FormEvent) {
    event.preventDefault();
    if (!editingSpeaker?.name.trim() || evidenceBusy) return;
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

  async function attachEvidence(file: File) {
    if (!projectId || !editingSpeaker?.voiceConsent) return;
    const serial = ++evidenceSerial.current;
    const profileId = editingSpeaker.id;
    setEvidenceBusy(true); setEvidenceError(null);
    try {
      const evidence = await api.uploadConsentEvidence(projectId, file);
      if (serial !== evidenceSerial.current) return;
      setEditingSpeaker((current) => current?.id === profileId && current.voiceConsent ? { ...current, voiceConsent: { ...current.voiceConsent, evidence } } : current);
    } catch (reason) {
      if (serial === evidenceSerial.current) setEvidenceError(reason instanceof Error ? reason.message : "Không lưu được bằng chứng.");
    } finally { if (serial === evidenceSerial.current) setEvidenceBusy(false); }
  }

  function selectProfile(event: MouseEvent<HTMLButtonElement>, id: string) {
    setProfileSelection((current) => selectListItem(current, profileIds, id, { shift: event.shiftKey, toggle: !event.shiftKey || event.ctrlKey || event.metaKey }));
  }

  function selectVoiceItem(event: MouseEvent<HTMLButtonElement>, id: string) {
    setVoiceSelection((current) => selectListItem(current, voiceIds, id, { shift: event.shiftKey, toggle: !event.shiftKey || event.ctrlKey || event.metaKey }));
  }

  function selectAllInLibrary(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) {
      event.preventDefault();
      if (activeType === "speaker" && (event.target as HTMLElement).closest(".voice-card__voices")) setVoiceSelection((current) => selectAllListItems(current, voiceIds));
      else setProfileSelection((current) => selectAllListItems(current, profileIds));
    }
  }

  function deleteSelectedProfiles() {
    if (!selectedProfileIds.length) return;
    if (activeType === "speaker") {
      const targets = catalog.speakers.filter((item) => selectedProfileIds.includes(item.id));
      const dependentVoices = voices.filter((voice) => targets.some((speaker) => speaker.id === voice.speakerProfileId)).length;
      if (!window.confirm(`Xoá ${targets.length} Speaker Profile đã chọn? ${dependentVoices} voice thuộc các profile này cũng sẽ bị xoá vĩnh viễn. Footage đang gán sẽ thành chưa gán người nói.`)) return;
      if (onDeleteSpeakers) onDeleteSpeakers(targets);
      else targets.forEach((target) => onDeleteSpeaker?.(target));
    } else {
      const targets = catalog.environmentProfiles.filter((item) => selectedProfileIds.includes(item.id));
      if (!window.confirm(`Xoá ${targets.length} Environment Profile đã chọn? Footage tham chiếu không bị xoá.`)) return;
      if (onDeleteEnvironments) onDeleteEnvironments(targets);
      else targets.forEach((target) => onDeleteEnvironment?.(target));
    }
    setProfileSelection({ ids: [], anchorId: null });
  }

  function updateSelectedSpeakerColor() {
    if (activeType !== "speaker" || !selectedProfileIds.length) return;
    const selected = new Set(selectedProfileIds);
    onCatalogChange({ ...catalog, speakers: catalog.speakers.map((speaker) => selected.has(speaker.id) ? { ...speaker, color: bulkSpeakerColor } : speaker) });
  }

  function deleteSelectedVoices() {
    const targets = voices.filter((item) => selectedVoiceIds.includes(item.id));
    if (!targets.length || !window.confirm(`Xoá ${targets.length} voice đã chọn khỏi project?`)) return;
    if (onDeleteVoices) onDeleteVoices(targets);
    else targets.forEach((target) => onDeleteVoice?.(target));
    setVoiceSelection({ ids: [], anchorId: null });
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
      action={<div className="voice-vault-add-options"><button aria-expanded={addMenu} aria-label={activeType === "speaker" ? "Thêm Speaker Profile" : "Thêm Environment Profile"} className="voice-vault-add" onClick={() => projectId && activeType === "speaker" ? setAddMenu(!addMenu) : activeType === "speaker" ? editSpeaker() : editEnvironment()} type="button"><Icon name="plus" /> ADD</button>{addMenu ? <div role="menu"><button role="menuitem" onClick={() => editSpeaker()} type="button">Tạo mới</button><button role="menuitem" onClick={() => { setAddMenu(false); setCollectionMode({}); }} type="button">Import from Collection</button></div> : null}</div>}
      className="voice-vault-module"
      eyebrow="SOUND LIBRARY"
      title="Profiles"
    >
      <div className="sound-library-tabs" role="tablist" aria-label="Sound Library profile type">
        <button aria-selected={activeType === "speaker"} className={activeType === "speaker" ? "is-active" : ""} onClick={() => { setActiveType("speaker"); setVoiceSelection({ ids: [], anchorId: null }); }} role="tab" type="button"><Icon name="person" />Speaker Profiles <b>{catalog.speakers.length}</b></button>
        <button aria-selected={activeType === "environment"} className={activeType === "environment" ? "is-active" : ""} onClick={() => { setActiveType("environment"); setVoiceSelection({ ids: [], anchorId: null }); }} role="tab" type="button"><Icon name="landscape" />Environment Profiles <b>{catalog.environmentProfiles.length}</b></button>
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
            <label className="profile-consent__check"><input checked={Boolean(editingSpeaker.voiceConsent)} onChange={(event) => { evidenceSerial.current += 1; setEvidenceBusy(false); setEvidenceError(null); setEditingSpeaker({ ...editingSpeaker, voiceConsent: event.target.checked ? { grantedBy: editingSpeaker.name.trim(), note: null, confirmedAt: new Date().toISOString(), uploadAllowed: false } : null }); }} type="checkbox" /><span>Chủ giọng đã đồng ý cho dùng giọng này để đổi giọng trong project</span></label>
            {editingSpeaker.voiceConsent ? <>
              <label><span>Người đồng ý</span><input aria-label="Người đồng ý" onChange={(event) => setEditingSpeaker({ ...editingSpeaker, voiceConsent: { ...editingSpeaker.voiceConsent!, grantedBy: event.target.value } })} value={editingSpeaker.voiceConsent.grantedBy} /></label>
              <label><span>Căn cứ</span><input aria-label="Căn cứ đồng ý" onChange={(event) => setEditingSpeaker({ ...editingSpeaker, voiceConsent: { ...editingSpeaker.voiceConsent!, note: event.target.value || null } })} placeholder="Ví dụ: hợp đồng, tin nhắn ngày…" value={editingSpeaker.voiceConsent.note ?? ""} /></label>
              <label className="profile-consent__check"><input type="checkbox" checked={Boolean(editingSpeaker.voiceConsent.uploadAllowed)} onChange={(event) => setEditingSpeaker({ ...editingSpeaker, voiceConsent: { ...editingSpeaker.voiceConsent!, uploadAllowed: event.target.checked } })} /><span>Chủ giọng đồng ý cho upload voice lên server</span></label>
              {projectId ? <label className="profile-consent__browse"><span>{evidenceBusy ? "Đang lưu bằng chứng…" : "Browse · bằng chứng / hợp đồng"}</span><input aria-label="Browse bằng chứng đồng ý" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" disabled={evidenceBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void attachEvidence(file); }} type="file" /></label> : null}
              {editingSpeaker.voiceConsent.evidence ? <small>Bằng chứng: {editingSpeaker.voiceConsent.evidence.name}</small> : null}
              {evidenceError ? <small role="alert">{evidenceError}</small> : null}
              <small>Ghi nhận lúc {new Date(editingSpeaker.voiceConsent.confirmedAt).toLocaleString("vi-VN")}. Voice Changer chỉ đổi sang giọng của profile có xác nhận này.</small>
            </> : <small>Chưa có xác nhận: profile vẫn dùng được cho STT và training, nhưng không làm giọng giả trong Voice Changer.</small>}
          </fieldset>
          <div className="speaker-profile-actions">{onDeleteSpeaker && catalog.speakers.some((speaker) => speaker.id === editingSpeaker.id) ? <button className="button button--quiet is-danger" onClick={() => { const target = catalog.speakers.find((speaker) => speaker.id === editingSpeaker.id); evidenceSerial.current += 1; setEditingSpeaker(null); if (target) onDeleteSpeaker(target); }} type="button">Xoá profile</button> : null}<button className="button button--quiet" onClick={() => { evidenceSerial.current += 1; setEvidenceBusy(false); setEditingSpeaker(null); }} type="button">Hủy</button><button className="button button--accent" disabled={evidenceBusy || !editingSpeaker.name.trim() || Boolean(editingSpeaker.voiceConsent && !editingSpeaker.voiceConsent.grantedBy.trim())} type="submit">Xác nhận & lưu profile</button></div>
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
        <div aria-label="Danh sách Sound Library" className="voice-vault__list sound-library-list" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("button, input, .voice-card-group, .sound-library-bulk-actions")) { setProfileSelection({ ids: [], anchorId: null }); setVoiceSelection({ ids: [], anchorId: null }); setProfileMenu(null); } }} onKeyDown={selectAllInLibrary} role="region" tabIndex={0}>
          {selectedProfileIds.length ? <div className="sound-library-bulk-actions"><b>{selectedProfileIds.length} profile đã chọn</b>{activeType === "speaker" ? <><label>Màu chung<input aria-label="Màu cho Speaker Profiles đã chọn" onChange={(event) => setBulkSpeakerColor(event.target.value)} type="color" value={bulkSpeakerColor} /></label><button className="button button--quiet" onClick={updateSelectedSpeakerColor} type="button">Áp dụng màu</button></> : null}<button className="button button--quiet is-danger" onClick={deleteSelectedProfiles} type="button">Xoá profiles đã chọn</button><button className="button button--quiet" onClick={() => setProfileSelection({ ids: [], anchorId: null })} type="button">Bỏ chọn profiles</button></div> : null}
          {activeType === "speaker" && selectedVoiceIds.length ? <div className="sound-library-bulk-actions"><b>{selectedVoiceIds.length} voice đã chọn</b><button className="button button--quiet is-danger" onClick={deleteSelectedVoices} type="button">Xoá voices đã chọn</button><button className="button button--quiet" onClick={() => setVoiceSelection({ ids: [], anchorId: null })} type="button">Bỏ chọn voices</button></div> : null}
          {activeType === "speaker" ? catalog.speakers.map((speaker) => {
            const own = voices.filter((voice) => voice.speakerProfileId === speaker.id);
            return (
            <div className={`voice-card-group ${selectedProfileIds.includes(speaker.id) ? "is-selected" : ""}`} key={speaker.id}>
            <div className="voice-card-group__header">
            <button aria-label={`Chọn profile ${speaker.name}`} aria-pressed={selectedProfileIds.includes(speaker.id)} className="sound-library-select" onClick={(event) => selectProfile(event, speaker.id)} type="button">{selectedProfileIds.includes(speaker.id) ? "✓" : ""}</button>
            <button className={`voice-card ${selectedVoice === speaker.id ? "is-active" : ""}`} onClick={() => onSelectVoice(speaker.id)} onContextMenu={(event) => { event.preventDefault(); setProfileMenu({ type: "speaker", id: speaker.id, left: event.clientX, top: event.clientY }); }} onDoubleClick={() => editSpeaker(speaker)} title="Double click hoặc right click để mở Properties" type="button">
              <span className="voice-card__avatar" style={{ backgroundColor: speaker.color }}><Icon name="person" /></span><span className="voice-card__copy"><strong title={speaker.name}>{speaker.name}</strong><span title={speakerSummary(speaker)}>{speakerSummary(speaker)}</span><small title={speaker.voiceConsent ? "Đã đồng ý dùng giọng" : "Chưa xác nhận đồng ý dùng giọng"} className={speaker.voiceConsent ? "is-consented" : ""}>{speaker.voiceConsent ? "✓ Đã đồng ý dùng giọng" : "Chưa xác nhận đồng ý dùng giọng"} · {own.length} voice</small></span><i aria-hidden="true" />
            </button>
            <button className="sound-library-properties" aria-label={`Properties profile ${speaker.name}`} title="Properties" onClick={() => editSpeaker(speaker)} type="button"><Icon name="settings" /></button>
            </div>
            {own.length ? (
              <ul aria-label={`Voice của ${speaker.name}`} className="voice-card__voices">
                {own.map((voice) => (
                  <li key={voice.id} title={`${voice.id} · tạo ${new Date(voice.createdAt).toLocaleString("vi-VN", { hour12: false })}`}>
                    <button aria-label={`Chọn voice ${voice.name}`} aria-pressed={selectedVoiceIds.includes(voice.id)} className="sound-library-select" onClick={(event) => selectVoiceItem(event, voice.id)} type="button">{selectedVoiceIds.includes(voice.id) ? "✓" : ""}</button>
                    <div className="sound-library-voice-copy"><span title={voice.name}>{voice.name}</span>
                    <small>{VOICE_KIND_LABELS[voice.kind] ?? voice.kind} · {new Date(voice.createdAt).toLocaleDateString("vi-VN")}</small>
                    </div>
                    {(projectId && voice.kind !== "clone") || onDeleteVoice ? <div className="sound-library-voice-actions">
                    {projectId && voice.kind !== "clone" ? <button className="sound-library-collection" aria-label={`Add to Collection ${voice.name}`} onClick={() => setCollectionMode({ voice })} type="button"><Icon name="folder-plus" /> Add to Collection</button> : null}
                    {onDeleteVoice ? <button className="sound-library-delete" aria-label={`Xoá voice ${voice.name}`} onClick={() => onDeleteVoice(voice)} title="Xoá voice" type="button"><Icon name="trash" /></button> : null}
                    </div> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            </div>
            );
          }) : catalog.environmentProfiles.map((profile) => (
            <div className={`voice-card-group ${selectedProfileIds.includes(profile.id) ? "is-selected" : ""}`} key={profile.id}>
            <div className="voice-card-group__header">
            <button aria-label={`Chọn profile ${profile.name}`} aria-pressed={selectedProfileIds.includes(profile.id)} className="sound-library-select" onClick={(event) => selectProfile(event, profile.id)} type="button">{selectedProfileIds.includes(profile.id) ? "✓" : ""}</button>
            <button className="voice-card environment-card" key={profile.id} onClick={() => editEnvironment(profile)} onContextMenu={(event) => { event.preventDefault(); setProfileMenu({ type: "environment", id: profile.id, left: event.clientX, top: event.clientY }); }} onDoubleClick={() => editEnvironment(profile)} title="Double click hoặc right click để mở Properties" type="button">
              <span className="voice-card__avatar"><Icon name="landscape" /></span><span className="voice-card__copy"><strong title={profile.name}>{profile.name}</strong><span title={profile.attributes.description}>{profile.attributes.description || "Environment profile"}</span><small>{profile.assetIds.length} footage tham chiếu · Properties</small></span><i aria-hidden="true" />
            </button>
            <button className="sound-library-properties" aria-label={`Properties profile ${profile.name}`} title="Properties" onClick={() => editEnvironment(profile)} type="button"><Icon name="settings" /></button>
            </div>
            </div>
          ))}
          {activeType === "speaker" && !catalog.speakers.length ? <div className="voice-vault-empty"><Icon name="person" /><b>Chưa có Speaker Profile</b><span>Thêm người nói trước khi phân vai footage hoặc bắt đầu training.</span></div> : null}
          {activeType === "environment" && !catalog.environmentProfiles.length ? <div className="voice-vault-empty"><Icon name="landscape" /><b>Chưa có Environment Profile</b><span>Đặt profile cho tiếng ồn/môi trường và gán cho footage hoặc từ trong transcript.</span></div> : null}
        </div>
      ) : null}
      {collectionMode ? <CollectionDialog onClose={() => setCollectionMode(null)} projectId={projectId} exportVoiceId={collectionMode.voice?.id} speaker={catalog.speakers.find((item) => item.id === collectionMode.voice?.speakerProfileId)} schema={profileSchema} onImported={onCollectionImported} onPrepareExport={onPrepareCollectionExport} /> : null}
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
