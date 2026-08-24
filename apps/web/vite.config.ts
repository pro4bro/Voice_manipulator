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
      "/api": "http://127.0.0.1:18120",
    },
  },
  build: {
    rolldownOptions: {
      input: workspaceIndex,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
