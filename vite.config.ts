import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, ".worktrees/**"],
    setupFiles: ["./src/test-setup.ts"],
    // Vitest turns CSS imports into empty strings by default; the CSS tests
    // read the source through `?raw`, so only those requests are processed.
    css: { include: [/\.css\?raw$/] },
  },
});
