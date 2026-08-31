import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project repo from /<repo>/, but dev has to stay at /.
const REPO_BASE = "/firstlight/";

// Read without pulling in @types/node just for one variable.
const envBase = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.VITE_BASE;

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? envBase || REPO_BASE : "/",
  server: {
    // Listen on every interface so a phone on the same wifi can open it.
    // /api is proxied server-side, so the phone needs no backend access of its own.
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/media": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  build: { target: "es2020" },
}));
