import { emotionLabel } from "../../domain/emotions";
import type { EmotionLabel, ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface SpeakerEmotionProps {
  asset: ProjectMediaAsset | null;
  speakers: SpeakerProfile[];
  words: StudioWord[];
}

export function SpeakerEmotion({ asset, speakers, words }: SpeakerEmotionProps) {
  const assignedSpeakers = speakers.filter((speaker) => asset?.speakerProfileIds.includes(speaker.id));
  const taggedWords = words.filter((word) => word.speakerId || word.emotion).length;
  const wordEmotions = [...new Set(words.map((word) => word.emotion).filter((emotion): emotion is EmotionLabel => Boolean(emotion)))];

  return (
    <ModuleFrame className="speaker-emotion-module" eyebrow="FOOTAGE LABELS" title="Speaker & Emotion">
      {asset ? (
        <>
          <div className="speaker-emotion-asset"><b>{asset.name}</b><span>{taggedWords}/{words.length || 0} từ có tag riêng</span></div>
          <div className="speaker-emotion-section">
            <span>FILE EMOTION</span>
            <strong data-emotion={asset.emotion}>{emotionLabel(asset.emotion)}</strong>
          </div>
          <div className="speaker-emotion-section">
            <span>SPEAKERS</span>
            <div className="speaker-emotion-tags">
              {assignedSpeakers.map((speaker) => <b key={speaker.id}><i style={{ background: speaker.color }} />{speaker.name}</b>)}
              {!assignedSpeakers.length ? <em>Chưa gán người nói</em> : null}
            </div>
          </div>
          {wordEmotions.length ? <div className="speaker-emotion-section"><span>WORD EMOTIONS</span><div className="speaker-emotion-tags">{wordEmotions.map((emotion) => <b key={emotion}>{emotionLabel(emotion)}</b>)}</div></div> : null}
          <p className="speaker-emotion-hint">Chuột phải vào footage trong Media Pool để gán hoặc đổi tag.</p>
        </>
      ) : <p className="speaker-emotion-empty">Chọn một footage trong Media Pool để xem tag.</p>}
    </ModuleFrame>
  );
}
