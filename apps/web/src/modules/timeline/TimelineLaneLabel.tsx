import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

interface Props {
  text: string;
  title?: string;
}

export function TimelineLaneLabel({ text, title = text }: Props) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = textRef.current;
    if (!viewport || !content) return;
    const measure = () => setScrollWidth(content.scrollWidth > viewport.clientWidth + 1 ? content.scrollWidth : 0);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text]);

  const scrolling = scrollWidth > 0;
  const style = scrolling
    ? { "--lane-scroll-duration": `${Math.max(5, (scrollWidth + 24) / 28)}s` } as CSSProperties
    : undefined;
  return <span className="timeline-lane-label" data-scrolling={scrolling} ref={viewportRef}>
    <span className="timeline-lane-label__track" style={style}>
      <b ref={textRef} title={title}>{text}</b>
      {scrolling ? <b aria-hidden="true">{text}</b> : null}
    </span>
  </span>;
}
