# Contributing

Thank you for helping build Global Software Timer.

## Principles

- Keep the tracker core local-first and auditable.
- Do not add telemetry.
- Keep privacy-sensitive features opt-in.
- Prefer small, tested modules over large files.

## Local Checks

```powershell
npm test
npm run build
cd src-tauri
cargo test
```
