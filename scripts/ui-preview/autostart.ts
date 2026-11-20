// Browser-only stand-in for @tauri-apps/plugin-autostart used by `npm run preview:ui`.
let enabled = true;

export async function isEnabled(): Promise<boolean> {
  return enabled;
}

export async function enable(): Promise<void> {
  enabled = true;
}

export async function disable(): Promise<void> {
  enabled = false;
}
