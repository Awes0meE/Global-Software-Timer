# Contributing

Thank you for helping build Global Software Timer.

Global Software Timer is a local-first Windows desktop app. Contributions are welcome, especially around reliability, app classification, Windows UX, privacy-preserving analytics, documentation, and testing.

## Principles

- Keep the tracker core local-first and auditable.
- Do not add telemetry.
- Keep privacy-sensitive features opt-in.
- Prefer small, tested modules over large files.
- Do not collect window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, or browser history.
- Do not request administrator permission by default.
- Keep changes focused. Avoid unrelated refactors in feature pull requests.

## Contribution Flow

1. Open or find an issue before starting larger work.
2. Fork the repository and create a feature branch.
3. Make a small, focused change.
4. Add or update tests when behavior changes.
5. Run local checks.
6. Open a pull request using the template.

Maintainers may ask for changes before merging. Pull requests to `main` must pass CI.

## Local Checks

```powershell
npm test
npm run build

. .\scripts\dev-env.ps1
cd src-tauri
cargo test
```

## Pull Request Guidelines

- Explain what changed and why.
- Include screenshots or screen recordings for UI changes when useful.
- Mention privacy impact explicitly, even if the impact is "none".
- Keep generated build artifacts out of the pull request.
- Do not commit secrets, local databases, logs, or personal data.

## Security

Please do not report security issues in public issues. See [SECURITY.md](./SECURITY.md) for the private disclosure process.
