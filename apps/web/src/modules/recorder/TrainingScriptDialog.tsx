import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../../api/client";
import { EMOTION_OPTIONS } from "../../domain/emotions";
import { splitIntoCards, splitSummary } from "../../domain/script-splitter";
import type { EmotionLabel, ReadingAudienceVocabulary, ReadingPassageKind } from "../../domain/types";

/**
 * Authoring a reading passage without touching JSON.
 *
 * The passage goes to the app-level library, not to a project: a moderator
 * writes it once and every project can draw on it. What makes it findable are
 * the audience tags, which are multi-valued on purpose — one passage serves
 * several regions at once, and an empty list means no restriction.
 *
 * The username and password in front of this are a **mis-click guard in the UI
 * and nothing more**. `POST /api/reading-packs/passages` answers anyone who can
 * reach the API, with or without this dialog. Do not describe it to anyone as
 * access control; when real auth arrives it belongs on the route, and this form
 * becomes its front end.
 */

const PASSCODE_KEY = "pro4bro.authoring.passcode";

const LANGUAGES = [
  { id: "vi", name: "Tiếng Việt" },
  { id: "en", name: "English" },
  { id: "zh", name: "中文" },
  { id: "ko", name: "한국어" },
  { id: "ja", name: "日本語" },
];

const PERFORMABLE = EMOTION_OPTIONS.filter((option) => option.id !== "mix");

function readPasscode(): string | null {
  try {
    return window.localStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;    // private window, or storage blocked; treat as unset
  }
}

function writePasscode(value: string) {
  try {
    window.localStorage.setItem(PASSCODE_KEY, value);
  } catch {
    /* The gate is a convenience; failing to remember it must not block work. */
  }
}

interface TrainingScriptDialogProps {
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function TrainingScriptDialog({ onClose, onSaved }: TrainingScriptDialogProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const existing = useMemo(readPasscode, []);

  const [audience, setAudience] = useState<ReadingAudienceVocabulary | null>(null);
  const [language, setLanguage] = useState("vi");
  const [title, setTitle] = useState("");
  const [emotion, setEmotion] = useState<EmotionLabel>("normal");
  const [kind, setKind] = useState<ReadingPassageKind>("emotion");
  const [direction, setDirection] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [ageRanges, setAgeRanges] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    api.getReadingAudience().then(setAudience).catch(() => setAudience(null));
  }, [unlocked]);

  const cards = useMemo(() => splitIntoCards(body), [body]);
  const summary = useMemo(() => splitSummary(cards), [cards]);
  const regionOptions = audience?.regionsByLanguage[language] ?? [];

  function unlock(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !passcode) {
      setGateError("Nhập tên và mật khẩu.");
      return;
    }
    if (!existing) {
      writePasscode(passcode);     // first use sets it on this machine
    } else if (passcode !== existing) {
      setGateError("Mật khẩu không đúng trên máy này.");
      return;
    }
    setGateError(null);
    setUnlocked(true);
  }

  function toggle(list: string[], set: (next: string[]) => void, id: string, wanted: boolean) {
    set(wanted ? [...list.filter((item) => item !== id), id] : list.filter((item) => item !== id));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !cards.length) return;
    setBusy(true);
    setError(null);
    try {
      const pack = await api.addReadingPassage({
        language,
        languageName: LANGUAGES.find((item) => item.id === language)?.name ?? language,
        kind,
        emotion,
        title: title.trim(),
        direction: direction.trim(),
        regions,
        genders,
        ageRanges,
        cards: cards.map((card) => ({ text: card.text, tags: [] })),
      });
      onSaved(`Đã thêm "${title.trim()}" vào ${pack.title} · ${cards.length} thẻ.`);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không lưu được bài đọc");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authoring-dialog" role="dialog" aria-modal="true" aria-labelledby="authoring-title">
      <button aria-label="Đóng" className="authoring-dialog__backdrop" onClick={onClose} type="button" />
      {!unlocked ? (
        <form className="authoring-gate" onSubmit={unlock}>
          <header><span>RESTRICTED</span><b id="authoring-title">Soạn bài đọc</b></header>
          <p className="authoring-note">
            Dành cho admin, moderator và staff. Ô này chỉ chặn bấm nhầm trên máy này —
            nó chưa phải lớp bảo mật, và endpoint lưu bài vẫn mở.
          </p>
          <label><span>TÊN NGƯỜI SOẠN</span><input autoFocus onChange={(event) => setUsername(event.target.value)} value={username} /></label>
          <label><span>MẬT KHẨU{existing ? "" : " · ĐẶT LẦN ĐẦU"}</span><input onChange={(event) => setPasscode(event.target.value)} type="password" value={passcode} /></label>
          {gateError ? <p className="authoring-error">{gateError}</p> : null}
          <footer>
            <button className="button button--quiet" onClick={onClose} type="button">Huỷ</button>
            <button className="button button--accent" type="submit">Mở trình soạn</button>
          </footer>
        </form>
      ) : (
        <form className="authoring-form" onSubmit={save}>
          <header><span>THƯ VIỆN BÀI ĐỌC</span><b id="authoring-title">Thêm bài đọc</b><small>{username}</small></header>
          <p className="authoring-note">Bài vào thư viện chung của app, mọi project đều lấy được. Thẻ tag là để lọc, không khoá ai đọc bài nào.</p>

          <div className="authoring-grid">
            <label><span>NGÔN NGỮ</span><select onChange={(event) => { setLanguage(event.target.value); setRegions([]); }} value={language}>{LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>CẢM XÚC</span><select onChange={(event) => setEmotion(event.target.value as EmotionLabel)} value={emotion}>{PERFORMABLE.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label><span>LOẠI BÀI</span><select onChange={(event) => setKind(event.target.value as ReadingPassageKind)} value={kind}><option value="emotion">Bài cảm xúc</option><option value="coverage">Bài phủ ngữ âm</option><option value="drill">Bài luyện âm</option></select></label>
          </div>

          <label><span>TIÊU ĐỀ</span><input onChange={(event) => setTitle(event.target.value)} placeholder="Tên bài đọc" value={title} /></label>
          <label><span>CHỈ ĐẠO DIỄN XUẤT</span><input onChange={(event) => setDirection(event.target.value)} placeholder="Ví dụ: bắt đầu kìm nén, siết chặt từng chữ" value={direction} /></label>

          <fieldset className="authoring-tags">
            <legend>HỢP VỚI · để trống là không giới hạn</legend>
            <div>
              <b>Vùng miền</b>
              <div className="authoring-chips">{regionOptions.length ? regionOptions.map((option) => <label key={option.id}><input checked={regions.includes(option.id)} onChange={(event) => toggle(regions, setRegions, option.id, event.target.checked)} type="checkbox" /><span>{option.label}</span></label>) : <small>Ngôn ngữ này chưa có danh sách vùng miền.</small>}</div>
            </div>
            <div>
              <b>Giới tính</b>
              <div className="authoring-chips">{(audience?.genders ?? []).map((option) => <label key={option.id}><input checked={genders.includes(option.id)} onChange={(event) => toggle(genders, setGenders, option.id, event.target.checked)} type="checkbox" /><span>{option.label}</span></label>)}</div>
            </div>
            <div>
              <b>Độ tuổi</b>
              <div className="authoring-chips">{(audience?.ageRanges ?? []).map((option) => <label key={option.id}><input checked={ageRanges.includes(option.id)} onChange={(event) => toggle(ageRanges, setAgeRanges, option.id, event.target.checked)} type="checkbox" /><span>{option.label}</span></label>)}</div>
            </div>
          </fieldset>

          <label><span>DÁN BÀI ĐỌC</span><textarea onChange={(event) => setBody(event.target.value)} placeholder="Dán cả bài vào đây. App tự cắt thành thẻ theo câu." rows={7} value={body} /></label>

          {cards.length ? (
            <div className="authoring-preview">
              <header><b>{summary.cards} thẻ · {summary.words} từ · ~{summary.seconds}s</b>{summary.warnings ? <em>{summary.warnings} thẻ ngoài khoảng 2–15s</em> : <span>mọi thẻ nằm trong khoảng 2–15s</span>}</header>
              <ol>{cards.map((card, index) => <li className={card.warning ? `is-${card.warning}` : ""} key={index}><i>{index + 1}</i><span>{card.text}</span><small>{card.estimatedSeconds}s</small></li>)}</ol>
            </div>
          ) : null}

          {error ? <p className="authoring-error">{error}</p> : null}
          <footer>
            <button className="button button--quiet" onClick={onClose} type="button">Huỷ</button>
            <button className="button button--accent" disabled={busy || !title.trim() || !cards.length} type="submit">{busy ? "Đang lưu..." : `Lưu ${cards.length} thẻ`}</button>
          </footer>
        </form>
      )}
    </div>
  );
}
