import type { SVGProps } from "react";

const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "M15 18l-6-6 6-6",
  chevron: "m9 18 6-6-6-6",
  file: "M7 3h7l4 4v14H7zM14 3v5h5M10 13h5M10 17h5",
  folder: "M3 6h7l2 2h9v11H3z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  home: "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3M8 22h8",
  moon: "M20 15.2A8 8 0 0 1 8.8 4 8 8 0 1 0 20 15.2Z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  pause: "M9 5v14M15 5v14",
  play: "m9 18 9-6-9-6v12Z",
  plus: "M12 5v14M5 12h14",
  power: "M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0",
  project: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  refresh: "M20 7v5h-5M4 17v-5h5M6.1 8.5A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 17.9 15.5",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  landscape: "M3 19h18M4 17l5-7 4 5 3-4 4 6M5 5h.01",
  trash: "M5 7h14M10 11v5m4-5v5M9 7l1-3h4l1 3m-8 0 1 13h8l1-13",
  window: "M4 4h16v16H4zM4 8h16M8 4v4",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
  search: "m20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  spark: "m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
  training: "M5 20h14M7 17V9m5 8V4m5 13v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M5 20h14",
  waveform: "M3 12h2l2-7 3 14 3-11 2 8 2-4h4",
  wrench: "M14 6a4 4 0 0 0-5 5L4 16l4 4 5-5a4 4 0 0 0 5-5l-3 2-3-3 2-3Z",
} as const;

export type IconName = keyof typeof paths;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
