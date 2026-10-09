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
  const mounted = useRef(true);
  const operation = useRef(false);
  const selected = collections.find((item) => item.id === selectedId);
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
      setCollections((items) => [...items, collection]); setSelectedId(collection.id); setCreating(false); setName("");
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

  return <section aria-label="Voice Collection" className="voice-collections">
    <header><h2>Voice Collection</h2><button className="button button--quiet" disabled={busy || loading} onClick={() => setCreating(true)} type="button">+ New Collection</button></header>
    {loading ? <p role="status">Đang tải collection…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <label className="collection-choice">Collection<select aria-label="Chọn Voice Collection" disabled={busy || loading} value={creating ? "__new__" : selectedId} onChange={(event) => {
      setNotice(null); setError(null);
      if (event.target.value === "__new__") setCreating(true);
      else { setCreating(false); setSelectedId(event.target.value); }
    }}><option value="">Chọn collection</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.entries.length})</option>)}<option value="__new__">New Collection</option></select></label>
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
      {exportVoiceId ? <button className="button button--accent" disabled={busy} onClick={add} type="button">{busy ? "Đang sao chép voice…" : "Add to Collection"}</button> : null}
      <ul className="collection-entries">{selected.entries.map((entry) => <li key={entry.id}><div><strong>{entry.voice.name}</strong><span>{entry.speaker.name} · {entry.voice.kind}</span><small>Project: {entry.sourceProjectName || entry.sourceProjectId}</small></div>{projectId && !exportVoiceId ? <button className="button button--quiet" disabled={busy} onClick={() => void run(async () => {
        await onPrepareExport?.();
        const result = await api.importCollectionVoice(selected.id, entry.id, projectId);
        if (mounted.current) { onImported?.(result); setNotice(`Đã import ${result.voice.name}.`); }
      })} type="button">Import voice</button> : null}</li>)}</ul>
      {!selected.entries.length ? <p>Collection chưa có voice đã train.</p> : null}
    </> : !loading && !creating ? <p>Tạo collection để gom voice đã train từ các project.</p> : null}
  </section>;
}
