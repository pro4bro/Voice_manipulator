type RGB = readonly [number, number, number];
interface ParsedColor { channels: RGB; alpha: number; }

function parseColor(value: string): ParsedColor | null {
  const input = value.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.exec(input)?.[1];
  if (hex) {
    const short = hex.length === 3 || hex.length === 4;
    const expanded = short ? [...hex].map((part) => `${part}${part}`).join("") : hex;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as unknown as RGB;
    const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return { channels, alpha };
  }
  const colorFunction = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%)?)?\s*\)$/iu.exec(input);
  if (colorFunction) {
    const channels = [Number(colorFunction[1]), Number(colorFunction[2]), Number(colorFunction[3])].map((channel) => Math.max(0, Math.min(1, channel)) * 255) as unknown as RGB;
    const alpha = colorFunction[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(colorFunction[4]) / (colorFunction[5] ? 100 : 1)));
    return { channels, alpha };
  }
  const rgb = /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*(?:,|\/)\s*([\d.]+)(%)?\s*)?\)$/iu.exec(input);
  if (!rgb) return null;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
  const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (channels.some((channel) => !Number.isFinite(channel)) || !Number.isFinite(alpha)) return null;
  return { channels: channels.map((channel) => Math.max(0, Math.min(255, channel))) as unknown as RGB, alpha: Math.max(0, Math.min(1, alpha)) };
}

function channelLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: RGB) {
  return 0.2126 * channelLuminance(color[0]) + 0.7152 * channelLuminance(color[1]) + 0.0722 * channelLuminance(color[2]);
}

function toHex(color: RGB) {
  return `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return 1;
  const opaqueBackground = bg.channels.map((channel) => channel * bg.alpha + 255 * (1 - bg.alpha)) as unknown as RGB;
  const opaqueForeground = fg.channels.map((channel, index) => channel * fg.alpha + opaqueBackground[index] * (1 - fg.alpha)) as unknown as RGB;
  const [lighter, darker] = [luminance(opaqueForeground), luminance(opaqueBackground)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function compositeColor(foreground: string, background: string, opacity: number): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return background;
  const alpha = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 0));
  const under = bg.channels.map((channel) => channel * bg.alpha + 255 * (1 - bg.alpha)) as unknown as RGB;
  return toHex(fg.channels.map((channel, index) => channel * fg.alpha * alpha + under[index] * (1 - fg.alpha * alpha)) as unknown as RGB);
}

export const compositeColors = compositeColor;

export function readableColor(preferred: string, background: string, minimum = 4.5): string {
  const rawTarget = parseColor(background);
  if (!rawTarget) return "#181a16";
  const target = rawTarget.channels.map((channel) => channel * rawTarget.alpha + 255 * (1 - rawTarget.alpha)) as unknown as RGB;
  const preferredRgb = parseColor(preferred);
  if (!preferredRgb) return contrastRatio("#000000", toHex(target)) >= contrastRatio("#ffffff", toHex(target)) ? "#000000" : "#ffffff";
  const threshold = Number.isFinite(minimum) ? Math.max(1, minimum) : 4.5;
  if (contrastRatio(preferred, background) >= threshold) return preferred;

  const black: RGB = [0, 0, 0];
  const white: RGB = [255, 255, 255];
  const endpoint = contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? black : white;
  if (contrastRatio(toHex(endpoint), background) < threshold) return toHex(endpoint);

  let failing = 0;
  let passing = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const amount = (failing + passing) / 2;
    const candidate = toHex(preferredRgb.channels.map((channel, index) => channel + (endpoint[index] - channel) * amount) as unknown as RGB);
    if (contrastRatio(candidate, background) >= threshold) passing = amount;
    else failing = amount;
  }
  return toHex(preferredRgb.channels.map((channel, index) => channel + (endpoint[index] - channel) * passing) as unknown as RGB);
}
