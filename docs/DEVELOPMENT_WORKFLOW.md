# Development Workflow

This project is a Windows-first Tauri desktop app. Use this workflow for every implementation task.

## 1. Start From A Clean Remote Baseline

Do not implement directly on `main`.

Use the clean main worktree only to mirror GitHub:

```powershell
cd F:\XJTLU\科研_DIY\Global_Software_Timer\.worktrees\v01-implementation
git fetch --prune origin
git status --short --branch
git pull --ff-only origin main
```

Create a task worktree from the latest remote baseline:

```powershell
cd F:\XJTLU\科研_DIY\Global_Software_Timer\.worktrees\v01-implementation
git worktree add ..\<task-name> -b codex/<task-name> origin/main
cd ..\<task-name>
```

## 2. Read The Required Context

Before implementation, read:

- `AGENTS.md`
- `docs/superpowers/specs/2026-05-28-global-software-timer-design.md`
- `docs/superpowers/plans/2026-05-28-global-software-timer-v01.md`
- `docs/superpowers/specs/2026-06-04-settings-autostart-design.md`
- `CHANGELOG.md`
- `memory.md`

The shipped code, approved specs, `CHANGELOG.md`, and `memory.md` are source of truth. Historical plans are useful context, but shipped behavior wins when they conflict.

## 3. Implement With Test-First Checks

For bug fixes, write or update a failing test first whenever practical. Keep changes surgical and tied to the task.

Use the Windows toolchain environment before Rust or Tauri commands:

```powershell
. .\scripts\dev-env.ps1
```

Run the complete local gate before review or commit:

```powershell
npm.cmd run check
```

This runs:

- frontend tests
- frontend production build
- Rust formatting check
- Rust tests
- npm audit at moderate severity or higher

## 4. Review Gates

Before each commit:

1. Self-review the diff.
2. Check the behavior against the relevant spec and privacy boundaries.
3. Check code quality: minimal scope, no broad path filters, no speculative abstractions, no unrelated formatting churn.
4. Re-run affected checks after any fix.

Privacy boundaries are strict: do not collect window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, telemetry, or cloud data.

## 5. Commit Discipline

Use Conventional Commits:

```text
feat: add user-visible behavior
fix: correct behavior or regression
docs: update documentation only
test: add or adjust tests only
build: dependency or packaging changes
ci: workflow changes
chore: auxiliary maintenance only
```

Do not hide features, fixes, tests, or docs inside `chore`.

Commit after a coherent checkpoint once checks and reviews pass.

## 6. Push And Release

Push task branches for normal review:

```powershell
git push -u origin codex/<task-name>
```

Only push directly to `main` when explicitly requested by the project owner.

Build release artifacts with:

```powershell
npm.cmd run release:build
```

The script runs the full local gate, builds Tauri bundles, copies installer assets to `release-staging/`, and prints SHA256 hashes.

Release notes must include:

- version and commit
- user-visible changes
- validation evidence
- installer filenames
- SHA256 hashes
- SmartScreen unsigned-installer note when applicable

## 7. Local Capability Checklist

Required local tooling:

- Node.js and npm
- Rust stable MSVC toolchain
- Visual Studio 2022 Build Tools with C++ workload
- Windows SDK resource and manifest tools
- Microsoft Edge WebView2 Runtime
- GitHub CLI authenticated for pushes and release uploads
- Tauri CLI through npm
- WiX and NSIS, downloaded by Tauri during `npm.cmd run tauri:build`

Useful Codex skills/tools:

- `karpathy-guidelines`
- `brainstorming-research-ideas`
- multi-agent tools for subagent-driven development

The older `superpowers:*` skill files may not be installed locally. If they are unavailable, follow the repository workflow and review gates in this document and `AGENTS.md`.
