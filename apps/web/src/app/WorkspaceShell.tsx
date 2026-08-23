import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import type { EmotionLabel, EngineStatus, ManipulatorMode, MediaImportChoice, Project, ProjectMediaAsset, RecordingWaveformPreview, StudioAudioItem, StudioWord, ThemeMode, TrainingCatalog, WorkspacePage } from "../domain/types";
import { ModuleRegistry, type StudioContext } from "../modules/registry/ModuleRegistry";
import type { ActiveTake } from "../modules/timeline/Timeline";
import { workspaceManifest } from "../pages/workspaceManifest";
import { api } from "../api/client";
import type { CapturedAudio } from "../modules/recorder/Recorder";
import { Icon, type IconName } from "../ui/Icon";

interface WorkspaceShellProps {
  project: Project;
  engine: EngineStatus | null;
  onBack: () => void;
  onPageChange: (page: WorkspacePage) => Promise<Project>;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const pages: Array<{ id: WorkspacePage; label: string; short: string; icon: IconName }> = [
  { id: "speech-to-text", label: "Speech to Text", short: "STT", icon: "mic" },
  { id: "voice-training", label: "Voice Training", short: "TRAIN", icon: "training" },
  { id: "voice-manipulator", label: "Voice Manipulator", short: "VOICE", icon: "wrench" },
];

const modeLabels: Record<ManipulatorMode, string> = {
  "voice-over": "Voice Over",
  "voice-isolator": "Voice Isolator",
  "voice-changer": "Voice Changer",
  "voice-dubber": "Voice Dubber",
  "voice-patch": "Voice Patch",
};

function emptyTrainingCatalog(): TrainingCatalog {
  return {
    speakers: [],
    environmentProfiles: [],
    settings: {
      targetSpeakerIds: [],
      maxSteps: 10000,
      checkpointEvery: 1000,
      batchSize: 4,
      learningRate: 0.00002,
      denoiseBeforeTraining: true,
      learnEnvironmentNoise: false,
      environmentProfileId: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function WorkspaceShell({ project, engine, onBack, onPageChange, theme, onToggleTheme }: WorkspaceShellProps) {
  const [activePage, setActivePage] = useState<WorkspacePage>(project.lastPage);
  const [activeMode, setActiveMode] = useState<ManipulatorMode>("voice-over");
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [speed, setSpeed] = useState(1);
  const [gain, setGain] = useState(0);
  const [take, setTake] = useState<ActiveTake | null>(null);
  const [mediaAssets, setMediaAssets] = useState<ProjectMediaAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recordingPreview, setRecordingPreview] = useState<RecordingWaveformPreview | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [trainingCatalog, setTrainingCatalog] = useState<TrainingCatalog>(emptyTrainingCatalog);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const catalogRevisionRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [scriptDirty, setScriptDirty] = useState(false);
  const scriptRef = useRef("");
  const scratchStorageKey = `pro4bro:${project.id}:scratch-script`;
  const legacyScriptStorageKey = `pro4bro:${project.id}:script`;
  const [script, setScript] = useState(() => localStorage.getItem(scratchStorageKey) ?? localStorage.getItem(legacyScriptStorageKey) ?? "");
  const manifest = workspaceManifest(activePage);

  scriptRef.current = script;
  useEffect(() => {
    if (!selectedAssetId) localStorage.setItem(scratchStorageKey, script);
  }, [script, scratchStorageKey, selectedAssetId]);
  useEffect(() => {
    let cancelled = false;
    setMediaBusy(true);
    void Promise.all([api.listProjectMedia(project.id), api.getTrainingCatalog(project.id)]).then(([assets, catalog]) => {
      if (cancelled) return;
      setMediaAssets(assets);
      setTrainingCatalog(catalog);
      if (catalog.speakers[0]) setSelectedVoice((current) => current || catalog.speakers[0].id);
      if (assets[0]) applyMediaAsset(assets[0]);
    }).catch((error: unknown) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Không đọc được Media Pool");
    }).finally(() => {
      if (!cancelled) setMediaBusy(false);
    });
    return () => { cancelled = true; };
  }, [project.id]);
  useEffect(() => {
    if (!catalogRevision) return;
    const revision = catalogRevision;
    const snapshot = trainingCatalog;
    const timer = window.setTimeout(() => {
      void api.saveTrainingCatalog(project.id, snapshot).then((saved) => {
        if (catalogRevisionRef.current === revision) {
          setTrainingCatalog(saved);
          setCatalogRevision(0);
        }
      }).catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : "Không lưu được Training Catalog");
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [catalogRevision, project.id, trainingCatalog]);
  useEffect(() => {
    if (!scriptDirty || !selectedAssetId) return;
    const pendingAssetId = selectedAssetId;
    const pendingText = script;
    const timer = window.setTimeout(() => {
      void api.updateMediaScript(project.id, pendingAssetId, pendingText, "user").then((updated) => {
        setMediaAssets((current) => current.map((asset) => {
          if (asset.id !== updated.id) return asset;
          return scriptRef.current === pendingText ? updated : { ...updated, text: asset.text };
        }));
        if (scriptRef.current === pendingText) setScriptDirty(false);
      }).catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : "Không lưu được revision Script");
      });
    }, 850);
    return () => window.clearTimeout(timer);
  }, [project.id, script, scriptDirty, selectedAssetId]);
  useEffect(() => () => {
    if (take?.url?.startsWith("blob:")) URL.revokeObjectURL(take.url);
  }, [take?.url]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function selectPage(page: WorkspacePage) {
    setActivePage(page);
    try {
      await onPageChange(page);
    } catch {
      setNotice("Không lưu được trang đang mở. Nội dung Script vẫn được giữ cục bộ.");
    }
  }

  function beginResize(side: "left" | "right", event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const width = Math.min(430, Math.max(220, startWidth + (side === "left" ? delta : -delta)));
      side === "left" ? setLeftWidth(width) : setRightWidth(width);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  function resizeWithKeyboard(side: "left" | "right", event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 16 : -16;
    if (side === "left") setLeftWidth((width) => Math.min(430, Math.max(220, width + delta)));
    else setRightWidth((width) => Math.min(430, Math.max(220, width - delta)));
  }

  function applyStudioItem(item: StudioAudioItem) {
    setTake({ id: item.id, name: item.name, url: item.url, duration: item.duration, text: item.text, words: item.words });
    if (item.text) setScript(item.text);
  }

  function applyMediaAsset(asset: ProjectMediaAsset) {
    setSelectedAssetId(asset.id);
    setScript(asset.text);
    setScriptDirty(false);
    setTake(asset.url ? {
      id: asset.studioItemId ?? asset.id,
      name: asset.name,
      url: asset.url,
      duration: asset.duration,
      text: asset.text,
      words: asset.words,
    } : null);
  }

  function storeMediaAsset(asset: ProjectMediaAsset) {
    setMediaAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
  }

  function flushCurrentMediaDraft() {
    if (!scriptDirty || !selectedAssetId) return;
    const assetId = selectedAssetId;
    const text = scriptRef.current;
    void api.updateMediaScript(project.id, assetId, text, "user").then(storeMediaAsset).catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Không lưu được revision Script trước khi đổi asset");
    });
  }

  function selectMediaAsset(assetId: string) {
    const asset = mediaAssets.find((item) => item.id === assetId);
    if (asset && asset.id !== selectedAssetId) {
      flushCurrentMediaDraft();
      applyMediaAsset(asset);
    }
  }

  function changeScript(value: string) {
    setScript(value);
    if (!selectedAssetId) return;
    setMediaAssets((current) => current.map((asset) => asset.id === selectedAssetId ? { ...asset, text: value } : asset));
    setScriptDirty(true);
  }

  function changeCatalog(catalog: TrainingCatalog) {
    catalogRevisionRef.current += 1;
    setTrainingCatalog(catalog);
    setCatalogRevision(catalogRevisionRef.current);
  }

  async function updateMediaAnnotations(assetId: string, speakerProfileIds: string[], emotion: EmotionLabel) {
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, speakerProfileIds, emotion } : asset));
    try {
      const updated = await api.updateMediaAnnotations(project.id, assetId, speakerProfileIds, emotion);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
    } catch (error) {
      if (previous) setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được speaker/emotion của footage");
    }
  }

  async function changeWordAnnotations(words: StudioWord[]) {
    if (!selectedAssetId) return;
    const asset = mediaAssets.find((item) => item.id === selectedAssetId);
    if (!asset) return;
    const wordSpeakerIds = words.map((word) => word.speakerId).filter((id): id is string => Boolean(id));
    const speakerProfileIds = [...new Set([...asset.speakerProfileIds, ...wordSpeakerIds])];
    const emotions = [...new Set(words.map((word) => word.emotion ?? asset.emotion))];
    const emotion = emotions.length > 1 ? "mix" : emotions[0] ?? asset.emotion;
    setTake((current) => current ? { ...current, words } : current);
    setMediaAssets((current) => current.map((item) => item.id === asset.id ? { ...item, words, speakerProfileIds, emotion } : item));
    try {
      await api.updateMediaScript(project.id, asset.id, scriptRef.current, "user", words);
      const updated = await api.updateMediaAnnotations(project.id, asset.id, speakerProfileIds, emotion);
      setMediaAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`Đã gán ${speakerProfileIds.length} speaker · emotion ${emotion}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không lưu được nhãn theo từ");
    }
  }

  async function processCapturedAudio(captured: CapturedAudio) {
    setTake(captured);
    setMediaBusy(true);
    setJob("Đang lưu bản thu vào Media Pool và chạy STT kỹ...");
    try {
      const result = await api.importProjectMedia(project.id, captured.file, "record");
      flushCurrentMediaDraft();
      storeMediaAsset(result.asset);
      applyMediaAsset(result.asset);
      setNotice(`Bản thu đã vào Media Pool · STT ${result.elapsed.toFixed(1)} giây · ${result.asset.words.length} từ.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không xử lý được audio");
    } finally {
      setMediaBusy(false);
      setJob(null);
    }
  }

  async function importMedia(choices: MediaImportChoice[]) {
    setMediaBusy(true);
    let imported = 0;
    let lastAsset: ProjectMediaAsset | null = null;
    try {
      for (const [index, choice] of choices.entries()) {
        setJob(`Đang import ${index + 1}/${choices.length}: ${choice.file.name}${choice.transcribe ? " · STT" : " · bỏ STT"}`);
        const result = await api.importProjectMedia(project.id, choice.file, "import", "", choice.transcribe);
        storeMediaAsset(result.asset);
        lastAsset = result.asset;
        imported += 1;
      }
      if (lastAsset) {
        flushCurrentMediaDraft();
        applyMediaAsset(lastAsset);
      }
      setNotice(lastAsset?.status === "no-audio"
        ? `${lastAsset.name} đã vào Media Pool nhưng không có audio stream.`
        : `Đã import ${imported} asset · ${choices.filter((choice) => choice.transcribe).length} file chạy transcript.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Import media thất bại";
      setNotice(imported ? `Đã import ${imported}/${choices.length} asset. File tiếp theo lỗi: ${detail}` : detail);
    } finally {
      setMediaBusy(false);
      setJob(null);
    }
  }

  async function toggleTrainingAsset(assetId: string, selected: boolean) {
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, trainingSelected: selected } : asset));
    try {
      const updated = await api.setMediaTrainingSelected(project.id, assetId, selected);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
    } catch (error) {
      if (previous) setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn Voice Training");
    }
  }

  function sendSelectedToTraining() {
    const selectedCount = mediaAssets.filter((asset) => asset.trainingSelected).length;
    if (!selectedCount) {
      setNotice("Hãy tick TRAIN cho ít nhất một footage.");
      return;
    }
    void selectPage("voice-training");
    setNotice(`Đã chuyển ${selectedCount} footage đã chọn sang Voice Training.`);
  }

  async function runAccurateTranscription(source: "stt" | "ai" = "stt") {
    if (!take?.id) {
      setNotice("Hãy record hoặc import audio trước khi chạy STT kỹ.");
      return;
    }
    setJob("Đang chạy lại STT kỹ và contextual pass...");
    try {
      const result = await api.transcribeAudio(take.id, "", script);
      if (selectedAssetId) {
        const updated = await api.updateMediaScript(project.id, selectedAssetId, result.item.text, source, result.item.words);
        storeMediaAsset(updated);
        applyMediaAsset(updated);
      } else {
        applyStudioItem(result.item);
      }
      setNotice(`Đã nhận diện lại trong ${result.elapsed.toFixed(1)} giây.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "STT kỹ thất bại");
    } finally {
      setJob(null);
    }
  }

  async function generateVoice() {
    if (!script.trim()) {
      setNotice("Hãy nhập Script trước khi tạo voice.");
      return;
    }
    setJob("OmniVoice đang render voice...");
    try {
      const result = await api.generateVoice({ text: script, voiceId: selectedVoice, speed, emotion: "natural" });
      applyStudioItem(result.item);
      setNotice(`Render hoàn tất trong ${result.elapsed.toFixed(1)} giây.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Render voice thất bại");
    } finally {
      setJob(null);
    }
  }

  const context = useMemo<StudioContext>(() => ({
    workflow: activePage,
    script,
    selectedVoice,
    speed,
    gain,
    take,
    mediaAssets,
    selectedAssetId,
    mediaBusy,
    recordingPreview,
    activeWordIndex,
    trainingCatalog,
    onScriptChange: changeScript,
    onVoiceChange: setSelectedVoice,
    onSpeedChange: setSpeed,
    onGainChange: setGain,
    onTakeChange: (captured) => void processCapturedAudio(captured),
    onImportMedia: (choices) => void importMedia(choices),
    onSelectAsset: selectMediaAsset,
    onRecordingPreview: setRecordingPreview,
    onActiveWordChange: setActiveWordIndex,
    onToggleTraining: (assetId, selected) => void toggleTrainingAsset(assetId, selected),
    onUpdateAnnotations: (assetId, speakerProfileIds, emotion) => void updateMediaAnnotations(assetId, speakerProfileIds, emotion),
    onWordsChange: (words) => void changeWordAnnotations(words),
    onCatalogChange: changeCatalog,
    onSendToTraining: sendSelectedToTraining,
    onGenerate: () => void generateVoice(),
    onDeferredAction: (action) => {
      if (action === "STT kỹ") void runAccurateTranscription("stt");
      else if (action === "AI fix") void runAccurateTranscription("ai");
      else setNotice(`${action} chưa có processor phù hợp.`);
    },
  }), [activePage, activeWordIndex, gain, mediaAssets, mediaBusy, recordingPreview, script, selectedAssetId, selectedVoice, speed, take, trainingCatalog]);

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <button className="workspace-brand" onClick={onBack} type="button"><span>P4B</span><b>VOICE<br />MANIPULATOR</b></button>
        <nav aria-label="Quy trình chính">
          {pages.map((page, index) => (
            <button className={activePage === page.id ? "is-active" : ""} key={page.id} onClick={() => void selectPage(page.id)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span><Icon name={page.icon} /><b>{page.label}</b>
            </button>
          ))}
        </nav>
        <div className="workspace-meta"><span><i />{engine?.installed ? "ENGINE READY" : "ENGINE OFFLINE"}</span><button aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"} onClick={onToggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} type="button"><Icon name={theme === "light" ? "moon" : "sun"} /></button></div>
      </header>

      <div className="workspace-body">
        <aside className="project-rail">
          <button aria-label="Về danh sách project" onClick={onBack} type="button"><Icon name="back" /></button>
          <div className="rail-project"><span>{project.name.slice(0, 2).toUpperCase()}</span><b>{project.name}</b><small>{project.accent}</small></div>
          <div className="rail-spine">PRO4BRO / LOCAL SESSION / {project.id.slice(0, 6).toUpperCase()}</div>
          <button aria-label="Project files" type="button"><Icon name="folder" /></button>
        </aside>

        <section className={`workspace-stage ${activePage === "voice-manipulator" ? "has-modes" : ""}`}>
          <header className="stage-heading">
            <div><span>{manifest.eyebrow}</span><h1>{manifest.label}</h1></div>
            <div className="stage-lineage"><span>PROJECT</span><b>{project.name}</b><i /><span>TAKE</span><b>{take?.name ?? "Chưa chọn"}</b></div>
          </header>

          {activePage === "voice-manipulator" ? (
            <div className="mode-area">
              <div className="mode-switcher" role="tablist" aria-label="Chế độ Voice Manipulator">
                {manifest.modes.map((mode) => {
                  const planned = manifest.plannedModes.includes(mode);
                  return <button aria-selected={activeMode === mode} className={activeMode === mode ? "is-active" : ""} key={mode} onClick={() => setActiveMode(mode)} role="tab" type="button"><span>{modeLabels[mode]}</span>{planned ? <small>PLANNED</small> : null}</button>;
                })}
              </div>
              {manifest.plannedModes.includes(activeMode) ? (
                <div className="processor-banner" role="status"><b>{modeLabels[activeMode]}</b><span>Workspace contract đã sẵn sàng · processor adapter chưa được cài</span></div>
              ) : null}
            </div>
          ) : null}

          <div className={`studio-board studio-board--${activePage} ${manifest.columns.left.length ? "" : "is-two-column"}`} style={{ "--left-column": `${leftWidth}px`, "--right-column": `${rightWidth}px` } as CSSProperties}>
            <div className="module-column module-column--left">{manifest.columns.left.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
            <div aria-label="Co kéo cột trái" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => resizeWithKeyboard("left", event)} onPointerDown={(event) => beginResize("left", event)} role="separator" tabIndex={0}><i /></div>
            <div className="module-column module-column--center">{manifest.columns.center.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
            <div aria-label="Co kéo cột phải" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => resizeWithKeyboard("right", event)} onPointerDown={(event) => beginResize("right", event)} role="separator" tabIndex={0}><i /></div>
            <div className="module-column module-column--right">{manifest.columns.right.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
            <div className="module-column module-column--bottom">{manifest.columns.bottom.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
          </div>
        </section>
      </div>
      {notice ? <div className="studio-notice" role="status"><i />{notice}</div> : null}
      {job ? <div className="studio-job" role="status"><span><i /><i /><i /></span><b>{job}</b><small>Không đóng app trong khi model đang xử lý.</small></div> : null}
    </main>
  );
}
