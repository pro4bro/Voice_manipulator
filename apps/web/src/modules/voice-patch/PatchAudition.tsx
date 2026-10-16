import { useEffect, useRef, useState } from "react";

type View = "region" | "head" | "tail" | "full";
interface Plan { sourceAvailable: boolean; sourceReason?: string; sourceName?: string; voiceName?: string; audioUrls: Record<"source" | "variant", Record<View, string>> }

export function PatchAudition({ projectId, outputId }: { projectId: string; outputId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null), [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("region");
  const player = useRef<HTMLAudioElement>(null), pending = useRef(false);
  useEffect(() => {
    let active = true;
    const audio = player.current;
    pending.current = false; audio?.pause(); audio?.removeAttribute("src");
    setPlan(null); setError(null); setView("region");
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/voice-patch/history/${encodeURIComponent(outputId)}/audition`);
        const data = await response.json();
        if (!response.ok || !data.audioUrls) throw new Error(data.detail ?? "Không đọc được bản nghe đối chiếu.");
        if (active) setPlan(data);
      } catch (reason) { if (active) setError(String(reason)); }
    })();
    return () => { active = false; pending.current = false; audio?.pause(); audio?.removeAttribute("src"); };
  }, [projectId, outputId]);
  function play() {
    const audio = player.current;
    if (!audio || !pending.current) return;
    pending.current = false;
    void Promise.resolve(audio.play()).catch((reason: unknown) => {
      if (audio === player.current && audio.getAttribute("src") && !(reason instanceof DOMException && reason.name === "AbortError")) setError("Không phát được âm thanh. Anh thử bấm Play trên trình phát.");
    });
  }
  function listen(kind: "source" | "variant") {
    const audio = player.current, url = plan?.audioUrls[kind][view];
    if (!audio || !url) return;
    audio.pause(); setError(null); pending.current = true;
    if (audio.getAttribute("src") === url) { audio.currentTime = 0; play(); }
    else audio.setAttribute("src", url);
  }
  return <fieldset><legend>Nghe đối chiếu bản vá</legend>
    {error ? <p role="alert">{error}</p> : null}
    {!plan && !error ? <p role="status">Đang kiểm tra âm thanh…</p> : null}
    {plan ? <><p>{plan.sourceName} · {plan.voiceName}</p>
      {plan.sourceReason ? <p role="alert">{plan.sourceReason}</p> : null}
      <label>Vùng nghe đối chiếu <select aria-label="Vùng nghe đối chiếu" value={view} onChange={(event) => {
        pending.current = false; player.current?.pause(); player.current?.removeAttribute("src"); setView(event.target.value as View);
      }}><option value="region">Vùng vá và ngữ cảnh</option><option value="head">Chuyển tiếp đầu</option><option value="tail">Chuyển tiếp cuối</option><option value="full">Toàn clip</option></select></label>
      <button type="button" disabled={!plan.sourceAvailable} onClick={() => listen("source")}>Nghe nguồn</button>
      <button type="button" onClick={() => listen("variant")}>Nghe bản vá</button>
    </> : null}
    <audio ref={player} controls preload="metadata" aria-label="Nghe đối chiếu vùng vá" onLoadedMetadata={play} />
  </fieldset>;
}
