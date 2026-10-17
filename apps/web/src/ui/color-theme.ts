import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";
export interface ContrastPair { foreground: string; background: string; }
export interface ContrastPalette {
  theme: ThemeMode;
  surface: string;
  field: string;
  audio: string;
  word: string;
  selection: ContrastPair;
  active: ContrastPair;
  untrusted: ContrastPair;
  timingCollision: ContrastPair;
}

const palettes: Record<ThemeMode, ContrastPalette> = {
  light: {
    theme: "light", surface: "#faf7ef", field: "#fffdf8", audio: "#f8f5ec", word: "#fffdf8",
    selection: { foreground: "#2d1e1a", background: "#ffb4a4" },
    active: { foreground: "#1b2630", background: "#b9dcff" },
    untrusted: { foreground: "#181a16", background: "#ffd98a" },
    timingCollision: { foreground: "#181a16", background: "#ff6745" },
  },
  dark: {
    theme: "dark", surface: "#2a2e28", field: "#151714", audio: "#151714", word: "#222520",
    selection: { foreground: "#2d1e1a", background: "#ffb4a4" },
    active: { foreground: "#1b2630", background: "#b9dcff" },
    untrusted: { foreground: "#181a16", background: "#ffd98a" },
    timingCollision: { foreground: "#181a16", background: "#ff6745" },
  },
};

function getSnapshot(): ThemeMode {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const listeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function subscribe(onChange: () => void) {
  if (typeof document === "undefined") return () => undefined;
  listeners.add(onChange);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => { for (const listener of listeners) listener(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  return () => {
    listeners.delete(onChange);
    if (!listeners.size) {
      themeObserver?.disconnect();
      themeObserver = null;
    }
  };
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light");
}

export function contrastPalette(theme: ThemeMode): ContrastPalette {
  return palettes[theme];
}

export function useContrastPalette(): ContrastPalette {
  return contrastPalette(useThemeMode());
}
