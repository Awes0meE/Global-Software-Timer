# Global Software Timer

Global Software Timer, also displayed as `全局软件计时器` in Chinese, is a local-first desktop app that tracks how long you use desktop software.

v0.1 is Windows-first. It runs in the system tray, records application runtime locally, and shows a Steam-like dashboard with Most Used, today's recorded time, today's active time, and per-application totals.

## Privacy First

v0.1 stores data locally in SQLite. It does not upload telemetry, require an account, record window titles, record document names, record webpage titles, or request administrator permission by default.

## Tech Stack

- Tauri v2
- Rust
- React and TypeScript
- SQLite

## Development

```powershell
npm install
npm run tauri:dev
```

## Checks

```powershell
npm test
npm run build
cd src-tauri
cargo test
```

## Open-Source Core

The local tracker, classifier, storage schema, and privacy boundaries are intended to remain auditable open-source core modules. Future advanced analytics or team features must not weaken the local-first privacy model.
