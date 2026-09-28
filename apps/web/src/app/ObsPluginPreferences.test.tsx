import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { ObsPluginPreferences } from "./ObsPluginPreferences";

const apiMocks = vi.hoisted(() => ({
  getObsPluginInstallation: vi.fn(),
  changeObsPluginInstallation: vi.fn(),
  pickFolder: vi.fn(),
}));
vi.mock("../api/client", () => ({ api: apiMocks }));

beforeEach(() => {
  vi.resetAllMocks();
  apiMocks.getObsPluginInstallation.mockResolvedValue({ state: "not-installed", message: "", obsRoot: "C:\\Program Files\\obs-studio", layout: "standard", obsRunning: false, pairingReady: false, pluginVersion: "0.1.0", obsBuildVersion: "32.2.2" });
});

it("installs from Preferences and reports verified status", async () => {
  apiMocks.changeObsPluginInstallation.mockResolvedValue({ state: "installed", message: "", obsRoot: "C:\\Program Files\\obs-studio", layout: "standard", obsRunning: false, pairingReady: true, pluginVersion: "0.1.0", obsBuildVersion: "32.2.2" });
  render(<ObsPluginPreferences />);
  fireEvent.click(await screen.findByRole("button", { name: "Install plugin" }));
  await waitFor(() => expect(apiMocks.changeObsPluginInstallation).toHaveBeenCalledWith("install", "C:\\Program Files\\obs-studio", false));
  expect(await screen.findByText("Đã cài và đúng hash")).toBeInTheDocument();
});

it("keeps repair and remove disabled while OBS runs", async () => {
  apiMocks.getObsPluginInstallation.mockResolvedValue({ state: "damaged", message: "", obsRoot: "C:\\Program Files\\obs-studio", layout: "standard", obsRunning: true, pairingReady: true });
  render(<ObsPluginPreferences />);
  expect(await screen.findByRole("button", { name: "Repair" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
});
