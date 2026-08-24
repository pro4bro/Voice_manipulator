import type { CSSProperties } from "react";

import type { EmotionLabel, EmotionStylePreferences } from "./types";

export const EMOTION_COLOR_IDS: EmotionLabel[] = ["exciting", "funny", "good", "low-energy", "sad", "cry", "angry", "critical"];

export const DEFAULT_EMOTION_STYLE: EmotionStylePreferences = {
  colorMode: "gradient",
  gradientStart: "#18d9ff",
  gradientEnd: "#ff4b52",
  emotionColors: {
    exciting: "#18d9ff", funny: "#49e886", good: "#b9ff38", "low-energy": "#8ea2ff",
    sad: "#7da9e8", cry: "#bd8de8", angry: "#ff7b35", critical: "#ff4b52",
  },
  backgroundEnabled: false,
  backgroundColor: "#24384b",
  backgroundOpacity: 0.34,
};

function hexChannels(color: string) {
  const normalized = /^#([0-9a-f]{6})$/iu.exec(color)?.[1];
  if (!normalized) return null;
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
}

function interpolatedColor(from: string, to: string, fraction: number) {
  const start = hexChannels(from);
  const end = hexChannels(to);
  if (!start || !end) return from;
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * fraction));
  return `rgb(${channels.join(" ")})`;
}

export function emotionTextColor(emotion: EmotionLabel | null | undefined, style: EmotionStylePreferences) {
  if (!emotion || emotion === "normal" || emotion === "mix") return null;
  if (style.colorMode === "per-emotion") return style.emotionColors[emotion] ?? DEFAULT_EMOTION_STYLE.emotionColors[emotion] ?? null;
  const index = Math.max(0, EMOTION_COLOR_IDS.indexOf(emotion));
  return interpolatedColor(style.gradientStart, style.gradientEnd, index / Math.max(1, EMOTION_COLOR_IDS.length - 1));
}

export function emotionVisualStyle(emotion: EmotionLabel | null | undefined, style: EmotionStylePreferences): CSSProperties | undefined {
  const color = emotionTextColor(emotion, style);
  if (!color) return undefined;
  return {
    color,
    backgroundColor: style.backgroundEnabled ? `color-mix(in srgb, ${style.backgroundColor} ${Math.round(style.backgroundOpacity * 100)}%, transparent)` : undefined,
  };
}