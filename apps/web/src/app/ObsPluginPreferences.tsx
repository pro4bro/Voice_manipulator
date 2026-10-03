import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { ObsPluginInstallationStatus } from "../domain/types";

const LABELS: Record<ObsPluginInstallationStatus["state"], string> = {
  "obs-unavailable": "Chưa tìm thấy OBS",
  "package-unavailable": "Thiếu plugin package",
  "not-installed": "Chưa cài",
  installed: "Đã cài và đúng hash",
  "update-available": "Có bản cập nhật",
  damaged: "Plugin chưa khớp package",
};

export function ObsPluginPreferences() {
  const [status, setStatus] = useState<ObsPluginInstallationStatus | null>(null);
  const [selectedRoot, setSelectedRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removePairing, setRemovePairing] = useState(false);
  const [transportFailed, setTransportFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void api.getObsPluginInstallation().then((result) => {
      if (active) { setStatus(result); setSelectedRoot(result.obsRoot ?? ""); }
    }).catch((cause: unknown) => { if (active) {
      setError(String(cause)); setTransportFailed(cause instanceof TypeError);
    } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!transportFailed || busy) return;
    let active = true;
    let timer: number;
    function check() {
      void api.getObsPluginInstallation(selectedRoot || undefined).then((result) => {
        if (!active) return;
        setStatus(result); setSelectedRoot(result.obsRoot ?? "");
        setError(""); setTransportFailed(false);
      }).catch((cause: unknown) => {
        if (!active) return;
        setError(String(cause));
        if (cause instanceof TypeError) timer = window.setTimeout(check, 3000);
        else setTransportFailed(false);
      });
    }
    timer = window.setTimeout(check, 3000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [transportFailed, busy, selectedRoot]);

  async function refresh(root = selectedRoot) {
    setBusy(true); setError("");
    try { setStatus(await api.getObsPluginInstallation(root || undefined)); setTransportFailed(false); }
    catch (cause) { setError(String(cause)); setTransportFailed(cause instanceof TypeError); }
    finally { setBusy(false); }
  }

  async function chooseRoot() {
    setBusy(true); setError("");
    try {
      const result = await api.pickFolder(selectedRoot);
      if (result.path) {
        setSelectedRoot(result.path);
        setStatus(await api.getObsPluginInstallation(result.path));
      }
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }

  async function act(action: "install" | "repair" | "remove" | "open-obs" | "reset-pairing") {
    setBusy(true); setError("");
    try { setStatus(await api.changeObsPluginInstallation(action, selectedRoot || undefined, action === "remove" && removePairing)); setTransportFailed(false); }
    catch (cause) { setError(String(cause)); setTransportFailed(cause instanceof TypeError); }
    finally { setBusy(false); }
  }

  const ready = status && !["obs-unavailable", "package-unavailable"].includes(status.state);
  const mutationBlocked = busy || transportFailed || !ready;
  const canInstall = ready && ["not-installed", "update-available"].includes(status.state) && (!status.obsRunning || status.state === "not-installed") && !status.compatibilityWarning;
  const canRepair = ready && ["installed", "update-available", "damaged"].includes(status.state) && !status.obsRunning && !status.compatibilityWarning;
  const canRemove = ready && status.state !== "not-installed" && !status.obsRunning;

  return <section className="preferences-section obs-plugin-preferences" aria-label="OBS LiveLink plugin">
    <h3>OBS LiveLink plugin</h3>
    <p>Cài plugin trực tiếp vào OBS. Bản cài, locale và hash được kiểm tra; cấu hình ghép nối nằm riêng trong hồ sơ Windows của bạn.</p>
    <div className="obs-plugin-preferences__status" role="status">
      <strong>{status ? LABELS[status.state] : "Đang kiểm tra…"}</strong>
      {status?.layout ? <span>{status.layout === "standard" ? "OBS cài chuẩn" : "OBS portable"} · plugin {status.pluginVersion} · build cho OBS {status.obsBuildVersion} · OBS máy này {status.detectedObsVersion ?? "chưa xác định"}</span> : null}
      {status?.compatibilityWarning ? <span>Phiên bản OBS này chưa khớp bản build plugin; cài đặt sẽ bị chặn.</span> : null}
      {status?.obsRunning ? <span>OBS đang chạy. Đóng OBS trước khi cập nhật, Repair hoặc gỡ.</span> : null}
      {status?.restartObsRequired ? <span>Khởi động lại OBS để nạp plugin mới.</span> : null}
      {status?.message ? <span>{status.message}</span> : null}
      {status && !status.pairingReady && status.state === "installed" ? <span>Chưa có cấu hình ghép nối cho Windows user này.</span> : null}
    </div>
    <div className="obs-plugin-preferences__path"><span title={selectedRoot}>{selectedRoot || "Chưa chọn thư mục OBS"}</span><button className="button button--quiet" disabled={busy} onClick={() => void chooseRoot()} type="button">Chọn thư mục OBS…</button></div>
    <div className="obs-plugin-preferences__actions">
      <button className="button button--accent" disabled={mutationBlocked || !canInstall} onClick={() => void act("install")} type="button">{status?.state === "update-available" ? "Update plugin" : "Install plugin"}</button>
      <button className="button button--quiet" disabled={mutationBlocked || !canRepair} onClick={() => void act("repair")} type="button">Repair</button>
      <button className="button button--quiet" disabled={mutationBlocked || !canRemove} onClick={() => void act("remove")} type="button">Remove</button>
      <button className="button button--quiet" disabled={busy || !ready} onClick={() => void act("open-obs")} type="button">Open OBS</button>
      <button className="button button--quiet" disabled={busy || !ready || status?.state === "not-installed"} onClick={() => void act("reset-pairing")} type="button">Reset pairing</button>
      <button className="button button--quiet" disabled={busy} onClick={() => void refresh()} type="button">Check status</button>
    </div>
    <label className="obs-plugin-preferences__remove"><input checked={removePairing} onChange={(event) => setRemovePairing(event.target.checked)} type="checkbox" /><span>Khi Remove, xóa cả cấu hình ghép nối của Windows user này</span></label>
    <small className="preferences-note">Reset pairing tạo token mới và ngắt kết nối đang dùng token cũ.</small>
    {error ? <p className="obs-plugin-preferences__error" role="alert">{error}</p> : null}
    <small className="preferences-note">Mở Tools → Pro4Bro LiveLink trong OBS để xem kết nối. Plugin tự nối lại khi app hoạt động.</small>
  </section>;
}
