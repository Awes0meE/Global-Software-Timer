// Browser-only UI preview with synthetic data: `npm run preview:ui`, then open http://localhost:1421 (in a worktree use `npm run preview:ui -- --port <n> --strictPort` so it does not fight main for 1421).
// Query options: ?theme=light|dark, ?page=software|background|statistics|achievements|settings, ?format=hm, ?empty, ?dialog=add, ?glass=off.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  root: here("../.."),
  plugins: [react()],
  clearScreen: false,
  // Rust build output holds locked executables that crash the file watcher.
  server: { port: 1421, strictPort: true, watch: { ignored: ["**/src-tauri/target/**"] } },
  resolve: {
    alias: [
      { find: "@tauri-apps/api/core", replacement: here("./tauri-core.ts") },
      { find: "@tauri-apps/api/window", replacement: here("./tauri-window.ts") },
      { find: "@tauri-apps/plugin-autostart", replacement: here("./autostart.ts") },
    ],
  },
});
