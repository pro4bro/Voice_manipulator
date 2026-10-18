import type { CSSProperties } from "react";

type LaneMixerControlsProps = {
  gain: number;
  gainLabel: string;
  level: number;
  levelLabel: string;
  muteLabel: string;
  muted: boolean;
  onGainChange: (gain: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  soloLabel: string;
  solo: boolean;
  soloTitle: string;
  unmuteLabel: string;
  unsoloLabel: string;
  title: string;
};

export function LaneMixerControls({ gain, gainLabel, level, levelLabel, muted, onGainChange,
  muteLabel, onMuteToggle, onSoloToggle, solo, soloLabel, soloTitle, title, unmuteLabel, unsoloLabel }: LaneMixerControlsProps) {
  return <div aria-label={title} className="obs-timeline__lane-controls" title={title}>
    <div className="obs-timeline__lane-toggles">
      <button aria-label={muted ? unmuteLabel : muteLabel} aria-pressed={muted}
        className="obs-timeline__mute" onClick={onMuteToggle} title={muted ? "Bật tiếng track" : "Tắt tiếng track"} type="button">M</button>
      <button aria-label={solo ? unsoloLabel : soloLabel} aria-pressed={solo}
        className="obs-timeline__mute obs-timeline__solo" onClick={onSoloToggle} title={soloTitle} type="button">S</button>
    </div>
    <label className="obs-timeline__gain">
      <span>GAIN</span>
      <input aria-label={gainLabel} max="200" min="0" onChange={(event) => onGainChange(Number(event.target.value))}
        step="1" type="range" value={gain} />
      <output>{gain}%</output>
    </label>
    <div aria-label={levelLabel} aria-valuemax={100} aria-valuemin={0} aria-valuenow={level}
      className="obs-timeline__level" role="meter">
      <span>LEVEL</span>
      <div><i style={{ "--source-level": `${level}%` } as CSSProperties} /></div>
      <output>{level}%</output>
    </div>
  </div>;
}
