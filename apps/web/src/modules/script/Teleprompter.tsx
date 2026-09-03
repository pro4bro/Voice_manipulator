import { useEffect, useMemo, useRef, useState } from "react";

import { emotionLabel } from "../../domain/emotions";
import { followScript, splitScript, startReadAlong } from "../../domain/read-along";
import type { ReadingPlanCard } from "../../domain/reading-plan";

interface TeleprompterProps {
  card: ReadingPlanCard;
  cardNumber: number;
  cardTotal: number;
  /** Trailing words from the local recognizer, oldest first. Empty until it is running. */
  heard?: string[];
  /** Whether the microphone is currently carrying speech. */
  speaking?: boolean;
  /** False while no recognizer is attached, which turns the follower manual. */
  followerReady?: boolean;
}

/**
 * Shows the card being read and marks how far the speaker has got.
 *
 * The cursor is deliberately forgiving. A reader who fumbles a word should carry
 * on to the next one rather than stop and repeat, so the highlight steps over
 * anything it cannot hear instead of waiting. Getting the position slightly
 * wrong costs nothing; stalling the reader costs a take.
 */
export function Teleprompter({
  card,
  cardNumber,
  cardTotal,
  heard = [],
  speaking = false,
  followerReady = false,
}: TeleprompterProps) {
  const words = useMemo(() => splitScript(card.text), [card.text]);
  const [state, setState] = useState(() => startReadAlong());
  const currentRef = useRef<HTMLElement | null>(null);

  useEffect(() => setState(startReadAlong(performance.now())), [card.cardId]);

  useEffect(() => {
    if (!followerReady || !heard.length) return;
    setState((current) => followScript(current, { script: words, heard, now: performance.now(), speaking }));
  }, [followerReady, heard, speaking, words]);

  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView, and neither do some embedded
    // webviews. Losing the auto-scroll is survivable; throwing mid-take is not.
    currentRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [state.cursor]);

  function move(delta: number) {
    setState((current) => ({
      cursor: Math.max(0, Math.min(words.length, current.cursor + delta)),
      movedAt: performance.now(),
    }));
  }

  return (
    <div className="teleprompter">
      <header>
        <div>
          <span>{card.passageTitle}</span>
          <b>{emotionLabel(card.emotion)}</b>
        </div>
        <output aria-label="Tiến độ thẻ">
          {cardNumber} / {cardTotal}
        </output>
      </header>
      {card.direction ? <p className="teleprompter__direction">{card.direction}</p> : null}
      <div
        aria-label="Bài đọc"
        className="teleprompter__text"
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
        }}
        role="group"
        tabIndex={0}
      >
        {words.map((word, index) => (
          <b
            className={index < state.cursor ? "is-read" : index === state.cursor ? "is-current" : ""}
            key={`${card.cardId}-${index}`}
            onClick={() => setState({ cursor: index, movedAt: performance.now() })}
            ref={index === state.cursor ? currentRef : null}
          >
            {word}
          </b>
        ))}
      </div>
      <footer className="teleprompter__hint">
        {followerReady ? (
          <span>Đọc sai một từ thì cứ bỏ qua, đọc tiếp từ đang sáng. Highlight sẽ tự đuổi kịp.</span>
        ) : (
          <span>
            Bám chữ tự động cần STT chạy trên máy, hiện chưa bật. Dùng phím cách hoặc bấm vào một từ để
            di chuyển.
          </span>
        )}
      </footer>
    </div>
  );
}
