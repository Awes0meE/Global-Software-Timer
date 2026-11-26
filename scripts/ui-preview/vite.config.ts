// Browser-only UI preview with synthetic data: `npm run preview:ui`, then open http://localhost:1421 (in a worktree use `npm run preview:ui -- --port <n> --strictPort` so it does not fight main for 1421).
// Query options: ?theme=light|dark, ?page=software|background|statistics|achievements|settings, ?format=hm, ?empty, ?dialog=add, ?dialog=restore (with ?page=settings), ?glass=off, ?tick (each poll adds 6 minutes to today's readings, to show the readout ghost),
// ?accent=<id>, ?eink=<id>, ?weekstart=sun, ?startpage=<id>, ?motion=reduce (stored display preferences; as in the app, ?startpage=<id> opens that page once settings load, so give probe.mjs ?page=<id> too),
// ?restore=ok|invalid|newer|live|space|fail and ?restorestatus=restored|rolled_back (从备份恢复, mock-exports.ts),
// ?poster=daily|achievement&theme=dark|light[&software=<key>][&date=YYYY-MM-DD] (one poster alone, poster-route.tsx).
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  root: here("../.."),
  plugins: [
    react(),
    {
      // ?poster=daily|achievement&theme=dark|light&software=<key>: one poster alone at 540×720 (poster-route.tsx).
      name: "gst-preview-entry",
      transformIndexHtml: (html) => html.replace("/src/main.tsx", "/scripts/ui-preview/preview-main.tsx"),
    },
  ],
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
