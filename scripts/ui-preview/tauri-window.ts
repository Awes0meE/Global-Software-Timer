// Browser-only stand-in for @tauri-apps/api/window used by `npm run preview:ui`.
export function getCurrentWindow() {
  return {
    onCloseRequested: async () => () => {},
    setTheme: async () => {},
  };
}
