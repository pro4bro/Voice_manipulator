import { useEffect, useRef, useState } from "react";
import type { VoiceOutput } from "../../domain/types";

interface Word { index: number; text: string; startFrame: number; endFrame: number; minFrame: number; maxFrame: number; segmentIndex: number; timingTrusted: boolean; timingSource?: string }
interface Plan { key: string; sampleRate: number; frames: number; words: Word[]; trustedWords: number; totalWords: number }

export function WordTimingReview({ projectId, outputId, onOutputReady }: { projectId: string; outputId: string; onOutputReady?: (output: VoiceOutput) => void }) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId)}/word-review`;
  const [plan, setPlan] = useState<Plan | null>(null), [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [reviewed, setReviewed] = useState(false), [savedId, setSavedId] = useState<string | null>(null);
  const serial = useRef(0), owner = useRef(endpoint); owner.current = endpoint;
  const player = useRef<HTMLAudioElement>(null), pending = useRef(false);
  function stop() { pending.current = false; player.current?.pause(); player.current?.removeAttribute("src"); }
  useEffect(() => {
    const audio = player.current;
    setPlan(null); setSelected(0); setBusy(false); setError(null); setSavedId(null); serial.current++; stop();
    return () => { serial.current++; pending.current = false; audio?.pause(); audio?.removeAttribute("src"); };
  }, [endpoint]);
  async function load() {
    const expected = endpoint, version = ++serial.current; stop(); setBusy(true); setError(null); setPlan(null);
    try {
      const response = await fetch(endpoint), data = await response.json();
      if (!response.ok || !Array.isArray(data.words) || !data.words.length) throw new Error(data.detail ?? "Không đọc được mốc từ.");
      if (owner.current === expected && serial.current === version) { setPlan(data); setSelected(0); }
    } catch (reason) { if (owner.current === expected && serial.current === version) setError(String(reason)); }
    finally { if (owner.current === expected && serial.current === version) setBusy(false); }
  }
  function choose(index: number) { stop(); setSelected(index); }
  function play() {
    const audio = player.current;
    if (!audio || !pending.current) return;
    pending.current = false;
    const src = audio.getAttribute("src"), expected = endpoint;
    void Promise.resolve(audio.play()).catch(() => { if (owner.current === expected && audio.getAttribute("src") === src) setError("Không phát được âm thanh. Anh thử Play trên trình phát."); });
  }
  const word = plan?.words[selected];
  useEffect(() => {
    setStart(plan && word ? (word.startFrame / plan.sampleRate).toFixed(6) : "");
    setEnd(plan && word ? (word.endFrame / plan.sampleRate).toFixed(6) : "");
    setReviewed(false); setSavedId(null);
  }, [plan, word]);
  const startFrame = Math.round(Number(start) * (plan?.sampleRate ?? 24000)), endFrame = Math.round(Number(end) * (plan?.sampleRate ?? 24000));
  const valid = !!word && !!plan && start.trim() !== "" && end.trim() !== "" && Number.isFinite(startFrame) && Number.isFinite(endFrame)
    && startFrame >= Math.max(word.minFrame, plan.words[selected - 1]?.endFrame ?? 0)
    && endFrame <= Math.min(word.maxFrame, plan.words[selected + 1]?.startFrame ?? plan.frames) && endFrame > startFrame;
  async function save() {
    if (!plan || !word || !valid || !reviewed || busy) return;
    const expected = endpoint, version = ++serial.current; setBusy(true); setError(null); stop();
    try {
      const response = await fetch(`${endpoint}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedKey: plan.key, reviewed: true, changes: [{ index: word.index, startFrame, endFrame }] }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail ?? "Không lưu được mốc từ.");
      if (owner.current === expected && serial.current === version) { setSavedId(data.output.id); onOutputReady?.(data.output); }
    } catch (reason) { if (owner.current === expected && serial.current === version) setError(String(reason)); }
    finally { if (owner.current === expected && serial.current === version) setBusy(false); }
  }
  return <details className="voice-script-settings"><summary>Kiểm tra mốc từng từ</summary>
    <p>Nghe từ cùng 200 ms ngữ cảnh trong câu đã lưu. Nghe một từ chưa làm mốc đó thành tin cậy; audio gốc được giữ nguyên.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>Đọc mốc từ đã lưu</button>
    {busy ? <p role="status">Đang kiểm tra mốc từ…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {plan && word ? <>
      <p>{plan.trustedWords}/{plan.totalWords} từ có mốc tin cậy đã lưu.</p>
      <label>Từ cần kiểm tra <select aria-label="Từ cần kiểm tra" disabled={busy} value={selected} onChange={(event) => choose(Number(event.target.value))}>
        {plan.words.map((item, index) => <option key={item.index} value={index}>{index + 1}. {item.text}{item.timingTrusted ? "" : " · cần kiểm tra"}</option>)}
      </select></label>
      <button type="button" disabled={busy || selected === 0} onClick={() => choose(selected - 1)}>Từ trước</button>
      <button type="button" disabled={busy || selected === plan.words.length - 1} onClick={() => choose(selected + 1)}>Từ sau</button>
      <p>START {(word.startFrame / plan.sampleRate).toFixed(6)} s · END {(word.endFrame / plan.sampleRate).toFixed(6)} s · DURATION {((word.endFrame - word.startFrame) / plan.sampleRate).toFixed(6)} s</p>
      <p>{word.timingTrusted ? "Tin cậy đã lưu" : "Chưa tin cậy"} · {word.timingSource ?? "không rõ nguồn mốc"}</p>
      <button type="button" disabled={busy || !valid} onClick={() => {
        const audio = player.current; if (!audio) return;
        const src = `${endpoint}/audio?index=${word.index}&key=${encodeURIComponent(plan.key)}&startFrame=${startFrame}&endFrame=${endFrame}`;
        audio.pause(); pending.current = true; setError(null);
        if (audio.getAttribute("src") === src) { audio.currentTime = 0; play(); } else audio.setAttribute("src", src);
      }}>Nghe từ và ngữ cảnh</button>
      <p>Nhập biên đã kiểm tra bằng tai. Chỉ từ đang chọn được đánh dấu người dùng đã review; lưu bản mới với WAV nguyên vẹn.</p>
      <label>Mốc đầu của từ (giây) <input type="number" step="0.000001" aria-label="Mốc đầu của từ (giây)" value={start} disabled={busy} onChange={(event) => { setStart(event.target.value); setReviewed(false); }} /></label>
      <label>Mốc cuối của từ (giây) <input type="number" step="0.000001" aria-label="Mốc cuối của từ (giây)" value={end} disabled={busy} onChange={(event) => { setEnd(event.target.value); setReviewed(false); }} /></label>
      {!valid ? <p role="alert">Biên phải nằm trong câu, có độ dài dương và không chồng từ lân cận.</p> : null}
      <label><input type="checkbox" disabled={busy || !valid} checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />Đã nghe và kiểm tra biên từ này</label>
      <button type="button" disabled={busy || !valid || !reviewed} onClick={() => void save()}>Lưu mốc từ thành bản mới</button>
      {savedId ? <p role="status">Đã lưu bản mốc từ mới: {savedId}</p> : null}
    </> : null}
    <audio ref={player} controls preload="metadata" aria-label="Nghe mốc từ" onLoadedMetadata={play} />
  </details>;
}
