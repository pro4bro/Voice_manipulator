import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { ScriptTextView, type ScriptTextViewProps } from "./ScriptTextView";
import { useScriptTextPlayback, type ScriptTextPlayback } from "./script-text-playback";

/** One viewport/scrollbar and editing host for every normal Script text view. */
export function ScriptTextPane({ leadingContent, viewportRef, style, scrollLabel = "Thanh cuộn Script", playbackId = null, activeText, followPlayback = true, ...props }: ScriptTextViewProps & {
  leadingContent?: ReactNode;
  viewportRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  scrollLabel?: string;
  playbackId?: string | null;
  activeText?: ScriptTextPlayback | null;
  followPlayback?: boolean;
}) {
  const ownViewport = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const viewport = viewportRef ?? ownViewport;
  const highlightStyle = useScriptTextPlayback(root, viewport, scope, playbackId, activeText, followPlayback);
  return <div className="script-text-scroll-region" ref={scope} style={style}>
    <style>{highlightStyle}</style>
    <div className="script-text-scroll" ref={viewport}>{leadingContent}<ScriptTextView {...props} onRoot={(element) => { root.current = element; props.onRoot(element); }} /></div>
    <ScriptScrollbar viewportRef={viewport} label={scrollLabel} />
  </div>;
}
