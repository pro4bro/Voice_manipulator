import { useEffect, useRef, useState } from "react";

interface Word { index: number; text: string; startFrame: number; endFrame: number; minFrame: number; maxFrame: number; segmentIndex: number; timingTrusted: boolean; timingSource?: string }
interface Plan { key: string; sampleRate: number; frames: number; words: Word[]; trustedWords: number; totalWords: number }

export function WordTimingReview({ projectId, outputId }: { projectId: string; outputId: string }) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId)}/word-review`;
  const [plan, setPlan] = useState<Plan | null>(null), [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const serial = useRef(0), owner = useRef(endpoint); owner.current = endpoint;
  const player = useRef<HTMLAudioElement>(null), pending = useRef(false);
  function stop() { pending.current = false; player.current?.pause(); player.current?.removeAttribute("src"); }
  useEffect(() => {
    const audio = player.current;
    setPlan(null); setSelected(0); setBusy(false); setError(null); serial.current++; stop();
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
  return <details className="voice-script-settings"><summary>Kiểm tra mốc từng từ</summary>
    <p>Nghe từ cùng 200 ms ngữ cảnh trong câu đã lưu. Nghe một từ chưa làm mốc đó thành tin cậy; audio gốc được giữ nguyên.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>Đọc mốc từ đã lưu</button>
    {busy ? <p role="status">Đang kiểm tra mốc từ…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {plan && word ? <>
      <p>{plan.trustedWords}/{plan.totalWords} từ có mốc tin cậy đã lưu.</p>
      <label>Từ cần kiểm tra <select aria-label="Từ cần kiểm tra" value={selected} onChange={(event) => choose(Number(event.target.value))}>
        {plan.words.map((item, index) => <option key={item.index} value={index}>{index + 1}. {item.text}{item.timingTrusted ? "" : " · cần kiểm tra"}</option>)}
      </select></label>
      <button type="button" disabled={selected === 0} onClick={() => choose(selected - 1)}>Từ trước</button>
      <button type="button" disabled={selected === plan.words.length - 1} onClick={() => choose(selected + 1)}>Từ sau</button>
      <p>START {(word.startFrame / plan.sampleRate).toFixed(6)} s · END {(word.endFrame / plan.sampleRate).toFixed(6)} s · DURATION {((word.endFrame - word.startFrame) / plan.sampleRate).toFixed(6)} s</p>
      <p>{word.timingTrusted ? "Tin cậy đã lưu" : "Chưa tin cậy"} · {word.timingSource ?? "không rõ nguồn mốc"}</p>
      <button type="button" onClick={() => {
        const audio = player.current; if (!audio) return;
        const src = `${endpoint}/audio?index=${word.index}&key=${encodeURIComponent(plan.key)}`;
        audio.pause(); pending.current = true; setError(null);
        if (audio.getAttribute("src") === src) { audio.currentTime = 0; play(); } else audio.setAttribute("src", src);
      }}>Nghe từ và ngữ cảnh</button>
    </> : null}
    <audio ref={player} controls preload="metadata" aria-label="Nghe mốc từ" onLoadedMetadata={play} />
  </details>;
}
