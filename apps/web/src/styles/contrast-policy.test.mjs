import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { contrastRatio } from "../domain/accessible-color";
import { contrastPalette } from "../ui/color-theme";

const read = (path) => readFileSync(resolve(process.cwd(), "src", path), "utf8");
const tokenSource = read("styles/tokens.css");
function tokens(theme) {
  const [base, dark] = tokenSource.split(':root[data-theme="dark"]');
  const parse = (source) => Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2].trim()]));
  return { ...parse(base), ...(theme === "dark" ? parse(dark) : {}) };
}
function expand(source, palette) {
  let expanded = source;
  for (let pass = 0; pass < 5; pass += 1) expanded = expanded.replace(/var\((--[\w-]+)(?:,([^)]*))?\)/gu, (_, key, fallback) => palette[key] ?? fallback ?? "initial");
  return expanded;
}
afterEach(() => { document.body.replaceChildren(); document.querySelectorAll("style[data-contrast-test]").forEach((element) => element.remove()); });

it.each(["light", "dark"])("keeps CSS and resolver palettes identical in %s", (theme) => {
  const palette = tokens(theme), resolved = contrastPalette(theme);
  for (const [slot, css] of [["audio", "--surface-audio"], ["field", "--surface-field"], ["word", "--contrast-word-background"]]) expect(resolved[slot]).toBe(palette[css]);
  for (const [slot, name] of [["selection", "selection"], ["active", "active"], ["untrusted", "untrusted"], ["timingCollision", "timing-collision"]]) {
    expect(resolved[slot].foreground).toBe(palette[`--contrast-${name}-foreground`]);
    expect(resolved[slot].background).toBe(palette[`--contrast-${name}-background`]);
    expect(contrastRatio(resolved[slot].foreground, resolved[slot].background)).toBeGreaterThanOrEqual(4.5);
  }
});
it.each(["light", "dark"])("enforces readable semantic foregrounds on every standard surface in %s", (theme) => {
  const palette = tokens(theme);
  const surfaces = Object.entries(palette).filter(([key]) => /^--surface-/u.test(key) && key !== "--surface-inverse");
  for (const [key, color] of Object.entries(palette).filter(([name]) => ["--text", "--text-muted", "--text-subtle", "--accent-ink", "--lime-ink", "--gold-ink", "--red-ink", "--clone-ink"].includes(name))) {
    for (const [surface, background] of surfaces) expect(contrastRatio(color, background), `${key} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  }
});
it.each(["light", "dark"])("applies paired states despite bright inline profile/emotion colors in %s", (theme) => {
  const palette = tokens(theme);
  const css = ["styles/modules.css", "modules/timeline/waveform.css", "modules/timeline/subtitle-density.css", "styles/contrast.css"].map(read).join("\n");
  const sheet = document.createElement("style"); sheet.dataset.contrastTest = "true"; sheet.textContent = expand(css, palette); document.head.append(sheet);
  const root = document.createElement("div"); root.className = "timeline-module";
  document.body.append(root);
  for (const [className, attributes] of [
    ["timeline-word timeline-word--untrusted", ""], ["timeline-word is-active", ""],
    ["timeline-word is-selected", ""], ["timeline-word is-timing-collision", ""],
    ["imported-timeline__word is-active", ""], ["imported-timeline__word is-selected", ""],
    ["script-table__word", 'aria-pressed="true"'],
  ]) {
    // Inline background+color mimics enabled custom emotion paint and pale profile text.
    root.innerHTML = `<button class="${className}" ${attributes} style="color:#caed70;background-color:#ffd98a">Readable text</button>`;
    const style = getComputedStyle(root.firstChild);
    expect(contrastRatio(style.color, style.backgroundColor), className).toBeGreaterThanOrEqual(4.5);
  }
});

it.each(["light", "dark"])("keeps a manual subtitle speaker underline independent from text state paint in %s", (theme) => {
  const palette = tokens(theme);
  const css = ["styles/modules.css", "modules/timeline/waveform.css", "modules/timeline/subtitle-density.css", "styles/contrast.css"].map(read).join("\n");
  const sheet = document.createElement("style"); sheet.dataset.contrastTest = "true"; sheet.textContent = expand(css, palette); document.head.append(sheet);
  const root = document.createElement("div"); root.className = "timeline-module"; document.body.append(root);
  const states = ["", "is-selected", "is-active", "is-timing-collision"];
  try {
    for (const state of states) {
      root.innerHTML = `<button class="timeline-word timeline-word--manual ${state}" style="--subtitle-manual-foreground:#004987;--subtitle-speaker-underline:#caed70;background-color:#ffd98a;color:#fff">Manual word</button>`;
      const word = root.firstChild;
      const style = getComputedStyle(word);
      expect(style.borderBottomStyle, state).toBe("solid");
      expect(word.style.getPropertyValue("--subtitle-speaker-underline"), state).toBe("#caed70");
      expect(style.borderBottomWidth, state).toBe("2px");
      expect(style.backgroundColor, state).not.toBe("rgb(202, 237, 112)");
      expect(contrastRatio(style.color, style.backgroundColor), state).toBeGreaterThanOrEqual(4.5);
    }
    root.innerHTML = '<button class="timeline-word timeline-word--manual timeline-word--untrusted" style="--subtitle-manual-foreground:#004987;--subtitle-speaker-underline:#caed70">Manual word</button>';
    expect(getComputedStyle(root.firstChild).boxShadow).toBe("none");
    expect(root.firstChild.style.getPropertyValue("--subtitle-speaker-underline")).toBe("#caed70");
    expect(getComputedStyle(root.firstChild).borderTopColor).toBe("rgb(226, 154, 36)");
  } finally { sheet.remove(); }
});
