import type { EmotionLabel } from "./types";

export const EMOTION_OPTIONS: Array<{ id: EmotionLabel; label: string }> = [
  { id: "exciting", label: "Exciting" },
  { id: "funny", label: "Funny" },
  { id: "good", label: "Good" },
  { id: "normal", label: "Normal" },
  { id: "low-energy", label: "Low energy" },
  { id: "sad", label: "Sad" },
  { id: "cry", label: "Cry" },
  { id: "angry", label: "Angry" },
  { id: "critical", label: "Critical" },
  { id: "mix", label: "Mix" },
];

export function emotionLabel(value: EmotionLabel) {
  return EMOTION_OPTIONS.find((option) => option.id === value)?.label ?? value;
}
