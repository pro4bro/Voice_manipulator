import { useEffect, useRef, useState } from "react";

type Rating = "unassessed" | "acceptable" | "needs-work";
const labels = { clarity: "Độ rõ", identity: "Giống giọng", delivery: "Cách thể hiện", transitions: "Chuyển tiếp" };
type Ratings = Record<keyof typeof labels, Rating>;
interface Review { revision: number; expectedKey: string; status: "unreviewed" | "current" | "stale"; ratings: Ratings; notes: string }

export function PatchReview({ projectId, outputId }: { projectId: string; outputId: string }) {
  const [packet, setPacket] = useState<Review | null>(null), [ratings, setRatings] = useState<Ratings | null>(null);
  const [notes, setNotes] = useState(""), [listened, setListened] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const owner = useRef(""); owner.current = `${projectId}/${outputId}`;
  const serial = useRef(0);
  const url = `/api/projects/${encodeURIComponent(projectId)}/voice-patch/history/${encodeURIComponent(outputId)}/review`;
  useEffect(() => {
    const version = ++serial.current;
    setPacket(null); setRatings(null); setNotes(""); setListened(false); setBusy(false); setError(null);
    void (async () => {
      try {
        const response = await fetch(url), data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? "Không đọc được đánh giá.");
        if (serial.current === version) { setPacket(data); setRatings(data.ratings); setNotes(data.notes); setListened(data.status === "current"); }
      } catch (reason) { if (serial.current === version) setError(String(reason)); }
    })();
    return () => { serial.current++; };
  }, [url, refresh]);
  async function save() {
    if (!packet || !ratings || !listened || busy) return;
    const expected = owner.current, version = serial.current;
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: packet.revision, expectedKey: packet.expectedKey, listened: true, ratings, notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Không lưu được đánh giá; hãy tải lại.");
      if (owner.current === expected && serial.current === version) { setPacket(data); setRatings(data.ratings); setNotes(data.notes); }
    } catch (reason) { if (owner.current === expected && serial.current === version) setError(String(reason)); }
    finally { if (owner.current === expected && serial.current === version) setBusy(false); }
  }
  return <fieldset><legend>Đánh giá sau khi nghe</legend>
    <p>Nhận xét do người nghe xác nhận, gắn với đúng bản vá đã lưu.</p>
    <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Tải lại đánh giá</button>
    {error ? <p role="alert">{error}</p> : null}
    {packet && ratings ? <>
      <p role="status">{packet.status === "current" ? "Đánh giá khớp bản âm thanh hiện tại." : packet.status === "stale" ? "Đánh giá cũ không còn khớp. Hãy nghe lại trước khi lưu." : "Chưa có đánh giá cho bản này."}</p>
      {(Object.keys(labels) as (keyof Ratings)[]).map((key) => <label key={key}>{labels[key]} <select aria-label={labels[key]} value={ratings[key]} disabled={busy} onChange={(event) => setRatings({ ...ratings, [key]: event.target.value as Rating })}>
        <option value="unassessed">Chưa đánh giá</option><option value="acceptable">Chấp nhận được</option><option value="needs-work">Cần sửa</option>
      </select></label>)}
      <label>Ghi chú khi nghe <textarea aria-label="Ghi chú khi nghe" maxLength={2000} value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></label>
      <label><input type="checkbox" checked={listened} disabled={busy} onChange={(event) => setListened(event.target.checked)} />Đã nghe bản này</label>
      <button type="button" disabled={busy || !listened} onClick={() => void save()}>Lưu đánh giá</button>
    </> : !error ? <p role="status">Đang đọc đánh giá…</p> : null}
  </fieldset>;
}
