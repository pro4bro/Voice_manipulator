import { ModuleFrame } from "../../ui/ModuleFrame";

interface ControlRackProps {
  speed: number;
  gain: number;
  onSpeedChange: (value: number) => void;
  onGainChange: (value: number) => void;
  compact?: boolean;
}

export function ControlRack({
  speed,
  gain,
  onSpeedChange,
  onGainChange,
  compact = false,
}: ControlRackProps) {
  return (
    <ModuleFrame eyebrow="CONTROL RACK" title="Điều khiển" className={`control-rack-module ${compact ? "is-compact" : ""}`}>
      <label className="rack-control">
        <span><b>Tốc độ đọc</b><output>{speed.toFixed(2)}×</output></span>
        <input
          aria-label="Tốc độ đọc"
          max="1.35"
          min="0.65"
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          step="0.05"
          type="range"
          value={speed}
        />
        <small><span>Chậm</span><span>Tự nhiên</span><span>Nhanh</span></small>
      </label>
      <label className="rack-control">
        <span><b>Source gain</b><output>{gain > 0 ? "+" : ""}{gain.toFixed(1)} dB</output></span>
        <input
          aria-label="Source gain"
          max="12"
          min="-60"
          onChange={(event) => onGainChange(Number(event.target.value))}
          step="0.5"
          type="range"
          value={gain}
        />
      </label>
      <div className="rack-control">
        <span><b>Sắc thái</b><em>EXPERIMENTAL</em></span>
        <div className="chip-grid">
          <button className="is-active" type="button">Tự nhiên</button>
          <button type="button">Ấm áp</button>
          <button type="button">Trầm tĩnh</button>
          <button type="button">Thì thầm</button>
        </div>
      </div>
    </ModuleFrame>
  );
}

