import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vite resolves mapped network drives back to UNC paths during config load.
// Retain the mapped drive for the build graph so Rolldown and the HTML resolver agree.
const workspaceRoot = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd().replace(/\\/g, "/");
const workspaceIndex = "index.html";
const uncWorkspaceRootPlugin = {
  name: "pro4bro-unc-workspace-root",
  configResolved(config: { root: string }) {
    if (/^[A-Za-z]:\//.test(workspaceRoot)) config.root = workspaceRoot;
  },
};

export default defineConfig({
  plugins: [uncWorkspaceRootPlugin, react()],
  resolve: {
    alias: {
      "/src": `${workspaceRoot}/src`,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 18121,
    proxy: {
      "/api": "http://127.0.0.1:18119",
    },
  },
  build: {
    rolldownOptions: {
      input: workspaceIndex,
    },
    // One local page loaded from disk: a single chunk is the point, and the
    // default warning is written to stderr, where the launcher reads any line
    // as a failed build and refuses to start the app.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
