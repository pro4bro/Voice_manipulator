import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import type { EngineProfileSchema, SpeakerProfile, VoiceCollection, VoiceCollectionImport, VoiceCollectionProperties } from "../../domain/types";
import "./voice-collections.css";

const emptyProperties: VoiceCollectionProperties = { language: null, languageId: null, region: null, age: null, gender: "unspecified", color: "#ff6745", attributes: {} };

/** The same collection browser serves the hub, project import and project export. */
export function VoiceCollections({ projectId, exportVoiceId, speaker, schema: suppliedSchema, onImported, onPrepareExport, onBusyChange }:
  { projectId?: string; exportVoiceId?: string; speaker?: SpeakerProfile; schema?: EngineProfileSchema | null;
    onImported?: (result: VoiceCollectionImport) => void; onPrepareExport?: () => Promise<void>; onBusyChange?: (busy: boolean) => void }) {
  const [collections, setCollections] = useState<VoiceCollection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [properties, setProperties] = useState<VoiceCollectionProperties>(() => speaker ? {
    language: speaker.language, languageId: speaker.languageId, region: speaker.region, age: speaker.age,
    gender: speaker.gender, color: speaker.color, attributes: { ...speaker.attributes },
  } : { ...emptyProperties, attributes: {} });
  const [schema, setSchema] = useState(suppliedSchema ?? null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set());
  const [collapsedProfiles, setCollapsedProfiles] = useState<Set<string>>(() => new Set());
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const packageInput = useRef<HTMLInputElement>(null);
  const selected = collections.find((item) => item.id === selectedId);
  const projectImport = Boolean(projectId && !exportVoiceId);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void api.listVoiceCollections().then((items) => {
      if (!active) return;
      setCollections(items); setSelectedId(items[0]?.id ?? "");
    }).catch((reason) => { if (active) setError(String(reason instanceof Error ? reason.message : reason)); })
      .finally(() => { if (active) setLoading(false); });
    if (!suppliedSchema) void api.getOmniVoiceProfileSchema().then((result) => { if (active) setSchema(result); }).catch(() => undefined);
    return () => { active = false; mounted.current = false; };
  }, []);

  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); onBusyChange?.(true); setError(null); setNotice(null);
    try { await task(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Không hoàn tất thao tác với collection."); }
    finally { operation.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const collection = await api.createVoiceCollection(name.trim(), properties);
      if (!mounted.current) return;
      setCollections((items) => [...items, collection]); setSelectedId(collection.id); setSelectedEntryIds(new Set()); setCollapsedProfiles(new Set()); setCreating(false); setName("");
    });
  }
  function add() {
    if (!selected || !projectId || !exportVoiceId) return;
    void run(async () => {
      await onPrepareExport?.();
      const entry = await api.addVoiceToCollection(selected.id, projectId, exportVoiceId);
      if (!mounted.current) return;
      setCollections((items) => items.map((item) => item.id === selected.id ? { ...item, entries: [...item.entries.filter((voice) => voice.id !== entry.id), entry] } : item));
      setNotice("Đã thêm voice vào collection.");
    });
  }

  function importPackage(file?: File) {
    if (!selected || !file) return;
    const collectionId = selected.id;
    void run(async () => {
      const entry = await api.importVoiceCollectionPackage(collectionId, file);
      if (!mounted.current) return;
      setCollections((items) => items.map((item) => item.id === collectionId
        ? { ...item, entries: [...item.entries.filter((current) => current.id !== entry.id), entry] }
        : item));
      setNotice("Imported voice package into collection; select it below to import into a project.");
    });
  }

  function exportEntry(entryId: string) {
    if (!selected) return;
    const collectionId = selected.id;
    void run(async () => {
      await api.exportVoiceCollectionEntry(collectionId, entryId);
      if (mounted.current) setNotice("Voice package downloaded.");
    });
  }

  function chooseCollection(id: string) {
    setSelectedEntryIds(new Set());
    setCollapsedProfiles(new Set());
    setImportProgress(null);
    setNotice(null);
    setError(null);
    if (id === "__new__") setCreating(true);
    else { setCreating(false); setSelectedId(id); }
  }

  function toggleProfile(entryIds: string[]) {
    if (busy) return;
    const allSelected = entryIds.every((id) => selectedEntryIds.has(id));
    setSelectedEntryIds((current) => {
      const next = new Set(current);
      for (const id of entryIds) allSelected ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleEntry(entryId: string) {
    if (busy) return;
    setSelectedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });
  }

  function importSelected() {
    if (!projectImport || !projectId || !selected || !selectedEntryIds.size) return;
    const collectionId = selected.id;
    const destinationProjectId = projectId;
    const entriesToImport = selected.entries.filter((entry) => selectedEntryIds.has(entry.id));
    void run(async () => {
      let completed = 0;
      setImportProgress({ completed, total: entriesToImport.length });
      for (const entry of entriesToImport) {
        if (!mounted.current) return;
        setImportProgress({ completed, total: entriesToImport.length });
        try {
          await onPrepareExport?.();
          if (!mounted.current) return;
          const result = await api.importCollectionVoice(collectionId, entry.id, destinationProjectId);
          completed += 1;
          if (!mounted.current) return;
          onImported?.(result);
          setSelectedEntryIds((current) => { const next = new Set(current); next.delete(entry.id); return next; });
        } catch (reason) {
          if (!mounted.current) return;
          const message = reason instanceof Error ? reason.message : "Không hoàn tất import voice.";
          const remaining = entriesToImport.length - completed;
          setImportProgress(null);
          setError(`Đã import ${completed}/${entriesToImport.length} model; còn ${remaining} model được giữ lại để thử lại. ${message}`);
          setNotice(null);
          return;
        }
      }
      if (mounted.current) {
        setImportProgress(null);
        setNotice(`Đã import ${completed} voice.`);
      }
    });
  }

  const profileGroups = selected ? [...selected.entries.reduce((groups, entry) => {
    const key = JSON.stringify([entry.sourceProjectId, entry.speaker.id]);
    const group = groups.get(key) ?? { key, speaker: entry.speaker, sourceProjectId: entry.sourceProjectId, sourceProjectName: entry.sourceProjectName, entries: [] as typeof selected.entries };
    group.entries.push(entry);
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; speaker: typeof selected.entries[number]["speaker"]; sourceProjectId: string; sourceProjectName: string; entries: typeof selected.entries }>()).values()] : [];

  return <section aria-label="Voice Collection" className="voice-collections">
    <header><h2>Voice Collection</h2><button className="button button--quiet" disabled={busy || loading} onClick={() => setCreating(true)} type="button">+ New Collection</button></header>
    {loading ? <p role="status">Đang tải collection…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <label className="collection-choice">Collection<select aria-label="Chọn Voice Collection" disabled={busy || loading} value={creating ? "__new__" : selectedId} onChange={(event) => chooseCollection(event.target.value)}><option value="">Chọn collection</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.entries.length})</option>)}<option value="__new__">New Collection</option></select></label>
    {creating ? <form className="collection-form" onSubmit={create}>
      <label className="is-wide">Tên collection<input autoFocus maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Ngôn ngữ<select value={properties.languageId ?? ""} onChange={(event) => { const language = schema?.languages.find((item) => item.id === event.target.value); setProperties({ ...properties, languageId: language?.id ?? null, language: language?.label ?? null }); }}><option value="">Chưa chọn</option>{schema?.languages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Miền / vùng<input maxLength={120} value={properties.region ?? ""} onChange={(event) => setProperties({ ...properties, region: event.target.value || null })} /></label>
      <label>Màu đại diện<input aria-label="Màu collection" type="color" value={properties.color ?? "#ff6745"} onChange={(event) => setProperties({ ...properties, color: event.target.value })} /></label>
      {(schema?.facets ?? []).map((facet) => <label key={facet.id}>{facet.label}<select value={facet.id === "gender" ? properties.gender ?? "" : facet.id === "age" ? properties.age ?? "" : properties.attributes[facet.id] ?? ""} onChange={(event) => setProperties({ ...properties, ...(facet.id === "gender" ? { gender: event.target.value } : facet.id === "age" ? { age: event.target.value || null } : { attributes: { ...properties.attributes, [facet.id]: event.target.value } }) })}><option value="">Chưa chọn</option>{facet.options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>)}
      {!schema ? <><label>Giới tính<input value={properties.gender ?? ""} onChange={(event) => setProperties({ ...properties, gender: event.target.value })} /></label><label>Độ tuổi<input value={properties.age ?? ""} onChange={(event) => setProperties({ ...properties, age: event.target.value || null })} /></label></> : null}
      <div className="collection-form__actions"><button className="button button--quiet" disabled={busy} onClick={() => setCreating(false)} type="button">Hủy</button><button className="button button--accent" disabled={busy || !name.trim()} type="submit">{busy ? "Đang tạo…" : "Tạo collection"}</button></div>
    </form> : selected ? <>
      <p className="collection-properties">{[selected.properties.language, selected.properties.region, selected.properties.age, selected.properties.gender, ...Object.values(selected.properties.attributes)].filter(Boolean).join(" · ")}</p>
      {projectImport ? <p className="collection-import-help">Tick hồ sơ để chọn toàn bộ model trong Collection này; xổ danh sách để chọn từng model.</p> : null}
      {exportVoiceId ? <button className="button button--accent" disabled={busy} onClick={add} type="button">{busy ? "Đang sao chép voice…" : "Add to Collection"}</button> : null}
      <div className="collection-package-transfer">
        <input accept=".zip,application/zip" aria-label="Import voice package" disabled={busy} hidden onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          importPackage(file);
        }} ref={packageInput} type="file" />
        <button className="button button--quiet" disabled={busy} onClick={() => packageInput.current?.click()} type="button">Import voice package</button>
        {projectImport ? <small>Import the package into this collection, then select the voice below and use Import to project.</small> : null}
      </div>
      <ul className="collection-entries">{profileGroups.map((group) => {
        const entryIds = group.entries.map((entry) => entry.id);
        const selectedCount = entryIds.filter((id) => selectedEntryIds.has(id)).length;
        const checked = entryIds.length > 0 && selectedCount === entryIds.length;
        const partial = selectedCount > 0 && !checked;
        const expanded = !collapsedProfiles.has(group.key);
        const profileLabel = `${group.speaker.name} · ${group.sourceProjectName || group.sourceProjectId}`;
        return <li className="collection-profile" key={group.key}>
          <div className="collection-profile__header">
            {projectImport ? <input aria-label={`Chọn toàn bộ model của ${profileLabel}`} checked={checked} disabled={busy} ref={(node) => { if (node) node.indeterminate = partial; }} type="checkbox" onChange={() => toggleProfile(entryIds)} /> : null}
            <button aria-expanded={expanded} aria-label={`${expanded ? "Thu gọn" : "Mở rộng"} model ${profileLabel}`} className="collection-profile__toggle" disabled={busy} onClick={() => setCollapsedProfiles((current) => { const next = new Set(current); if (expanded) next.add(group.key); else next.delete(group.key); return next; })} type="button">{expanded ? "▾" : "▸"}</button>
            <span className="collection-profile__identity"><strong>{group.speaker.name}</strong><small>{group.sourceProjectName || group.sourceProjectId} · {group.entries.length} model</small></span>
          </div>
          {expanded ? <ul className="collection-profile__models">{group.entries.map((entry) => <li key={entry.id}>
            {projectImport ? <label className="collection-model-choice"><input aria-label={`Chọn model ${entry.voice.name} · ${profileLabel}`} checked={selectedEntryIds.has(entry.id)} disabled={busy} type="checkbox" onChange={() => toggleEntry(entry.id)} /><span><strong>{entry.voice.name}</strong><small>{entry.voice.kind}</small></span></label> : <div className="collection-model-choice__browse"><strong>{entry.voice.name}</strong><small>{entry.voice.kind}</small></div>}
            <button aria-label={`Export package for ${entry.voice.name}`} className="button button--quiet collection-entry-export" disabled={busy} onClick={() => exportEntry(entry.id)} type="button">Export file</button>
          </li>)}</ul> : null}
        </li>;
      })}</ul>
      {projectImport ? <div className="collection-import-action">
        {importProgress ? <p role="status">Đang import {Math.min(importProgress.completed + 1, importProgress.total)}/{importProgress.total}…</p> : null}
        <button className="button button--accent" disabled={busy || !selectedEntryIds.size} onClick={importSelected} type="button">{importProgress ? "Đang import…" : `Import đã chọn (${selectedEntryIds.size})`}</button>
      </div> : null}
      {!selected.entries.length ? <p>Collection chưa có voice đã train.</p> : null}
    </> : !loading && !creating ? <p>Tạo collection để gom voice đã train từ các project.</p> : null}
  </section>;
}
