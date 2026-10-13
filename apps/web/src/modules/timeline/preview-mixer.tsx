import { createContext, useContext, useState, type ReactNode } from "react";

function useMixerState() {
  const [gains, setGains] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [solo, setSolo] = useState<Record<string, boolean>>({});
  return { gains, setGains, muted, setMuted, solo, setSolo };
}

const PreviewMixerContext = createContext<ReturnType<typeof useMixerState> | null>(null);

/** A project session owns preview settings across Timeline mounts and selection changes. */
export function PreviewMixerProvider({ children }: { children: ReactNode }) {
  const mixer = useMixerState();
  return <PreviewMixerContext.Provider value={mixer}>{children}</PreviewMixerContext.Provider>;
}

export function usePreviewMixer() {
  const shared = useContext(PreviewMixerContext);
  const local = useMixerState();
  return shared ?? local;
}
