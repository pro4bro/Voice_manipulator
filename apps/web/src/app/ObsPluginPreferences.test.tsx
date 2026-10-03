import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

afterEach(() => vi.useRealTimers());

it("recovers installation status after a transport outage without reopening Preferences", async () => {
  vi.useFakeTimers();
  apiMocks.getObsPluginInstallation.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<ObsPluginPreferences />);
  await act(async () => {});
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(apiMocks.getObsPluginInstallation).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Chưa cài")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("stops transport retries when Preferences unmounts", async () => {
  vi.useFakeTimers();
  apiMocks.getObsPluginInstallation.mockRejectedValue(new TypeError("Failed to fetch"));
  const view = render(<ObsPluginPreferences />);
  await act(async () => {});
  view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(apiMocks.getObsPluginInstallation).toHaveBeenCalledTimes(1);
});

it("reads status after a failed mutation without repeating the install", async () => {
  vi.useFakeTimers();
  apiMocks.changeObsPluginInstallation.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<ObsPluginPreferences />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Install plugin" }));
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Install plugin" })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(apiMocks.getObsPluginInstallation).toHaveBeenCalledTimes(2);
  expect(apiMocks.changeObsPluginInstallation).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("installs from Preferences and reports verified status", async () => {
  apiMocks.changeObsPluginInstallation.mockResolvedValue({ state: "installed", message: "", obsRoot: "C:\\Program Files\\obs-studio", layout: "standard", obsRunning: false, pairingReady: true, pluginVersion: "0.1.0", obsBuildVersion: "32.2.2" });
  render(<ObsPluginPreferences />);
  const install = await screen.findByRole("button", { name: "Install plugin" });
  await waitFor(() => expect(install).toBeEnabled());
  fireEvent.click(install);
  await waitFor(() => expect(apiMocks.changeObsPluginInstallation).toHaveBeenCalledWith("install", "C:\\Program Files\\obs-studio", false));
  expect(await screen.findByText("Đã cài và đúng hash")).toBeInTheDocument();
});

it("keeps repair and remove disabled while OBS runs", async () => {
  apiMocks.getObsPluginInstallation.mockResolvedValue({ state: "damaged", message: "", obsRoot: "C:\\Program Files\\obs-studio", layout: "standard", obsRunning: true, pairingReady: true });
  render(<ObsPluginPreferences />);
  expect(await screen.findByRole("button", { name: "Repair" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
});
