import { useEffect, useRef } from "react";

import { ModuleFrame } from "../../ui/ModuleFrame";

interface SoundReactorProps {
  tone: "input" | "output";
  title: string;
  eyebrow: string;
  /** Band energies 0..1, low to high frequency, as the live worker last measured them. */
  spectrum: number[];
  levelDb: number;
  peakDb: number;
  active: boolean;
  caption?: string;
}

const BANDS = 48;
const FLOOR_DB = -60;

export function meterFraction(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
}

function formatDb(db: number) {
  return db <= -119 ? "-∞" : db.toFixed(1);
}

/**
 * A visual of one side of the live stream: the voice going in, or the voice
 * coming out after conversion. Bars rise to what the worker measured and fall
 * back smoothly between polls, so a 10 Hz status still reads as motion.
 */
export function SoundReactor({ tone, title, eyebrow, spectrum, levelDb, peakDb, active, caption }: SoundReactorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<number[]>([]);
  const shownRef = useRef<number[]>(Array.from({ length: BANDS }, () => 0));
  targetRef.current = active ? spectrum : [];

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext?.("2d");
      if (canvas && context) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const ratio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const styles = getComputedStyle(canvas);
        const color = styles.getPropertyValue("--reactor-color").trim() || "#ff6745";
        const dim = styles.getPropertyValue("--reactor-dim").trim() || "rgba(255,255,255,.08)";
        const gap = 2;
        const barWidth = Math.max(1, (width - gap * (BANDS - 1)) / BANDS);
        const middle = height / 2;
        for (let band = 0; band < BANDS; band += 1) {
          const target = targetRef.current[band] ?? 0;
          const current = shownRef.current[band] ?? 0;
          // Rise at once, fall gently: how a meter reads to the eye.
          const next = target > current ? target : current + (target - current) * 0.18;
          shownRef.current[band] = next;
          const x = band * (barWidth + gap);
          context.fillStyle = dim;
          context.fillRect(x, 4, barWidth, height - 8);
          const bar = Math.max(1, next * (height - 10));
          context.fillStyle = color;
          context.globalAlpha = 0.35 + next * 0.65;
          context.fillRect(x, middle - bar / 2, barWidth, bar);
          context.globalAlpha = 1;
        }
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <ModuleFrame className={`sound-reactor-module is-${tone} ${active ? "is-active" : ""}`} eyebrow={eyebrow} index={tone === "input" ? "IN" : "OUT"} title={title}
      action={<span className="sound-reactor__db">{formatDb(levelDb)} <small>dB</small></span>}>
      <div className="sound-reactor">
        <canvas aria-label={`${title} · phổ tần`} className="sound-reactor__canvas" ref={canvasRef} role="img" />
        <div aria-label={`${title} · mức âm`} aria-valuemax={0} aria-valuemin={FLOOR_DB} aria-valuenow={Math.round(Math.max(FLOOR_DB, levelDb))} className="sound-reactor__meter" role="meter">
          <i style={{ width: `${meterFraction(levelDb) * 100}%` }} />
          <b style={{ left: `${meterFraction(peakDb) * 100}%` }} />
        </div>
        <small className="sound-reactor__caption">{active ? caption ?? `Peak ${formatDb(peakDb)} dB` : caption ?? "Chưa chạy"}</small>
      </div>
    </ModuleFrame>
  );
}
