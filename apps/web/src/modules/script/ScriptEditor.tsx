import { Fragment, useRef, useState } from "react";

import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import type { EmotionLabel, SpeakerProfile, StudioWord, WorkspacePage } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  workflow: WorkspacePage;
  onGenerate?: () => void;
  onDeferredAction?: (action: string) => void;
  words?: StudioWord[];
  activeWordIndex?: number;
  speakers?: SpeakerProfile[];
  onWordsChange?: (words: StudioWord[]) => void;
}

interface ScriptSegment {
  text: string;
  wordIndex: number | null;
}

function scriptSegments(value: string, words: StudioWord[]): ScriptSegment[] {
  if (!value || !words.length) return [{ text: value, wordIndex: null }];
  const lowerValue = value.toLocaleLowerCase("vi");
  const segments: ScriptSegment[] = [];
  let cursor = 0;
  words.forEach((word, wordIndex) => {
    const needle = word.text.trim();
    if (!needle) return;
    const start = lowerValue.indexOf(needle.toLocaleLowerCase("vi"), cursor);
    if (start < 0) return;
    if (start > cursor) segments.push({ text: value.slice(cursor, start), wordIndex: null });
    const end = start + needle.length;
    segments.push({ text: value.slice(start, end), wordIndex });
    cursor = end;
  });
  if (cursor < value.length) segments.push({ text: value.slice(cursor), wordIndex: null });
  return segments;
}

export function ScriptEditor({ value, onChange, workflow, onGenerate, onDeferredAction, words = [], activeWordIndex = -1, speakers = [], onWordsChange }: ScriptEditorProps) {
  const playbackLayerRef = useRef<HTMLDivElement>(null);
  const [tagMode, setTagMode] = useState(false);
  const [tagSpeakerId, setTagSpeakerId] = useState("");
  const [tagEmotion, setTagEmotion] = useState<EmotionLabel>("normal");
  const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0;
  const duration = Math.round(wordCount / 2.65);
  const canGenerate = workflow === "voice-manipulator";

  function tagWord(index: number) {
    onWordsChange?.(words.map((word, wordIndex) => wordIndex === index ? {
      ...word,
      speakerId: tagSpeakerId || word.speakerId || null,
      emotion: tagEmotion,
    } : word));
  }

  return (
    <ModuleFrame
      eyebrow="SCRIPT"
      title={workflow === "voice-training" ? "Training transcript" : "Nội dung & transcript"}
      className="script-module"
      action={
        <div className="script-module__duration">
          <span>EST. DURATION</span>
          <strong>
            {String(Math.floor(duration / 60)).padStart(2, "0")}:
            {String(duration % 60).padStart(2, "0")}
          </strong>
        </div>
      }
    >
      <div className="script-toolbars">
        <div className="script-review-strip">
          <strong>TRANSCRIPT LAYERS</strong>
          <span className="candidate candidate--realtime">Realtime</span>
          <span className="candidate candidate--stt">STT kỹ</span>
          <span className="candidate candidate--ai">AI fix</span>
          <span className="review-status"><i /> Direct edit ready</span>
        </div>
        {words.length ? (
          <div className="script-tag-toolbar">
            <button aria-pressed={tagMode} className={tagMode ? "is-active" : ""} onClick={() => setTagMode((current) => !current)} type="button">TAG WORDS</button>
            <select aria-label="Người nói để gán cho từ" disabled={!tagMode} onChange={(event) => setTagSpeakerId(event.target.value)} value={tagSpeakerId}><option value="">Giữ speaker hiện tại</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select>
            <select aria-label="Cảm xúc để gán cho từ" disabled={!tagMode} onChange={(event) => setTagEmotion(event.target.value as EmotionLabel)} value={tagEmotion}>{EMOTION_OPTIONS.filter((option) => option.id !== "mix").map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            <span>Chọn từ trên transcript để gán</span>
          </div>
        ) : null}
      </div>
      <div className={`script-editor-stack ${activeWordIndex >= 0 ? "is-tracking" : ""} ${tagMode ? "is-tagging" : ""}`}>
        {tagMode ? (
          <div aria-label="Gán người nói và cảm xúc theo từ" className="script-tag-editor">
            {words.map((word, index) => {
              const speaker = speakers.find((profile) => profile.id === word.speakerId);
              const previousSpeakerId = index ? words[index - 1]?.speakerId : null;
              return (
                <Fragment key={`${word.start}-${index}`}>
                  {speaker && speaker.id !== previousSpeakerId ? <span className="script-speaker-cue" style={{ borderColor: speaker.color }}><i style={{ background: speaker.color }} />{speaker.name}</span> : null}
                  <button
                    aria-label={`Gán nhãn cho từ ${word.text}`}
                    className={index === activeWordIndex ? "is-active" : ""}
                    data-emotion={word.emotion ?? "normal"}
                    onClick={() => tagWord(index)}
                    style={speaker ? { borderBottomColor: speaker.color } : undefined}
                    title={`${speaker?.name ?? "Chưa gán speaker"} · ${emotionLabel(word.emotion ?? "normal")} · ${word.start.toFixed(2)}s`}
                    type="button"
                  >{word.text}<small>{emotionLabel(word.emotion ?? "normal")}</small></button>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <>
        <div aria-hidden="true" className="script-playback-layer" ref={playbackLayerRef}>
          {scriptSegments(value, words).map((segment, index) => (
            <span className={segment.wordIndex === activeWordIndex ? "is-active" : ""} key={`${segment.wordIndex ?? "text"}-${index}`}>{segment.text}</span>
          ))}
        </div>
        <textarea
          aria-label="Script transcript"
          className="script-editor"
          maxLength={12000}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (!playbackLayerRef.current) return;
            playbackLayerRef.current.scrollTop = event.currentTarget.scrollTop;
            playbackLayerRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }}
          placeholder="Transcript realtime, STT kỹ và AI fix sẽ cùng xuất hiện ở đây..."
          spellCheck
          value={value}
        />
          </>
        )}
      </div>
      <div className="script-module__footer">
        <div className="script-stats">
          <span><b>{wordCount}</b> từ</span>
          <span><b>{value.length.toLocaleString("vi-VN")}</b> / 12.000</span>
        </div>
        <div className="script-actions">
          {workflow === "speech-to-text" ? (
            <>
              <button className="button button--quiet" onClick={() => onDeferredAction?.("STT kỹ")} type="button">Nhận diện kỹ</button>
              <button className="button button--lime" onClick={() => onDeferredAction?.("AI fix")} type="button"><Icon name="spark" />AI fix</button>
            </>
          ) : null}
          {workflow === "voice-training" ? (
            <button className="button button--lime" onClick={() => onDeferredAction?.("Dataset review")} type="button"><Icon name="spark" />Duyệt cho dataset</button>
          ) : null}
          {canGenerate ? (
            <button aria-label="Tạo voice" className="button button--accent" onClick={onGenerate} type="button">
              <span><b>Tạo voice</b><small>OmniVoice · 32 steps</small></span>
              <Icon name="arrow" />
            </button>
          ) : null}
        </div>
      </div>
    </ModuleFrame>
  );
}
