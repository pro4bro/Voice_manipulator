import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { contrastPalette, useContrastPalette } from "./color-theme";
import { contrastRatio } from "../domain/accessible-color";

describe("semantic contrast palette", () => {
  it.each(["light", "dark"] as const)("provides AA pairs for %s theme", (theme) => {
    const palette = contrastPalette(theme);
    for (const pair of [palette.selection, palette.active, palette.untrusted, palette.timingCollision]) {
      expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("updates the shared palette when the root theme changes", async () => {
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useContrastPalette());
    act(() => { document.documentElement.dataset.theme = "dark"; });
    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(result.current.audio).toBe("#151714");
  });
});


it("shares one root observer across consumers and disconnects after the last one", () => {
  const original = window.MutationObserver;
  let created = 0;
  const disconnect = vi.fn();
  vi.stubGlobal("MutationObserver", class { constructor() { created += 1; } observe = vi.fn(); disconnect = disconnect; });
  try {
    const first = renderHook(() => useContrastPalette());
    const second = renderHook(() => useContrastPalette());
    expect(created).toBe(1);
    first.unmount(); expect(disconnect).not.toHaveBeenCalled();
    second.unmount(); expect(disconnect).toHaveBeenCalledTimes(1);
  } finally { vi.stubGlobal("MutationObserver", original); }
});
