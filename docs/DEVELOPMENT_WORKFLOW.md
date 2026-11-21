# Development Workflow

This project is a Windows-first Tauri desktop app. Use this workflow for every implementation task.

For the verified code baseline, metric definitions, and outstanding review findings, read [CURRENT_STATE.md](./CURRENT_STATE.md). Review suggestions are proposals, not implemented behavior or an approved implementation plan.

## 1. Start From A Clean Remote Baseline

Do not implement directly on `main`.

Use the clean main worktree only to mirror GitHub:

Enter your main Git worktree, not an enclosing container directory. Check for uncommitted files before pulling; preserve externally supplied reports. If fetch fails, do not describe cached `origin/main` as freshly verified. A GitHub API head comparison can verify a commit without updating local refs.

```powershell
Set-Location '<main-worktree-path>'
git fetch --prune origin
git status --short --branch
git pull --ff-only origin main
```

Create a task worktree from the latest remote baseline:

```powershell
Set-Location '<main-worktree-path>'
git worktree add ..\<task-name> -b <type>/<task-name> origin/main
cd ..\<task-name>
```

Use a semantic branch prefix, such as `docs/review-follow-up` or `fix/tracker-gap-accounting`. Existing worktree folder names do not need to change.

## 2. Read The Required Context

Before implementation, read:

- `AGENTS.md`
- `docs/superpowers/specs/2026-05-28-global-software-timer-design.md`
- `docs/superpowers/plans/2026-05-28-global-software-timer-v01.md`
- `docs/superpowers/specs/2026-06-04-settings-autostart-design.md`
- `CHANGELOG.md`
- `memory.md`
- `docs/CURRENT_STATE.md`

The code, approved specs, `CHANGELOG.md`, and `memory.md` are the references for release state. Historical plan checkboxes are not a live task list. Record observed differences separately; if a conflict affects the intended behavior of a new implementation, resolve it with the coordinating agent before changing behavior.

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

- release-script failure regressions
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

Commit after a coherent checkpoint once checks and reviews pass and the user has authorized commits for the task/session. Otherwise leave the changes uncommitted and report a suggested commit message.

## 6. Push And Release

Push task branches for normal review:

```powershell
git push -u origin <type>/<task-name>
```

Only push directly to `main` when explicitly requested by the project owner.

Build release artifacts with:

```powershell
npm.cmd run release:build
```

The script runs the full local gate, builds Tauri bundles, copies installer assets to `release-staging/`, and prints SHA256 hashes.

The release wrapper checks both npm exit codes and stops before staging on failure. `scripts/test-release-build.ps1` verifies both failure paths and runs through the local check gate and CI. A source push is not an installer release; verify artifacts before publishing.

The `Windows release` workflow (`.github/workflows/release-validation.yml`) reruns `release:build` on pushes to `main` that touch `package-lock.json`, `docs/releases/*.md`, or the workflow. It creates the `v<version>` GitHub Release only when the head commit subject is exactly `chore(release): publish <version>`, matching the `package.json` version, and it uses `docs/releases/v<version>.md` as the notes, appending the source commit and SHA256 hashes.

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

Discover available Superpowers workflows in the active environment rather than relying on historical installation notes. If unavailable, follow the repository workflow and review gates in this document and `AGENTS.md`.

## 8. Dependency Audit Notes

Use these commands for dependency security checks:

```powershell
npm.cmd audit --audit-level=moderate
gh api repos/Awes0meE/Global-Software-Timer/dependabot/alerts --paginate
```

As of 2026-06-18, `npm.cmd audit --audit-level=moderate` reports zero vulnerabilities after the Vite/Vitest/jsdom toolchain update.

On 2026-11-17, CI #45 reported seven npm findings. Compatible lockfile updates resolved them, and cloud npm audit returned zero vulnerabilities. CI now enforces a blocking audit.

The 2026-06-18 audit also recorded a medium Rust Dependabot alert for `glib` in `src-tauri/Cargo.lock`. These are historical results, not a current clean bill of health. In that check, the crate was absent from the Windows target dependency tree:

```powershell
cargo tree --manifest-path src-tauri\Cargo.toml --target x86_64-pc-windows-msvc -i glib
```

That check found it only with `--target all` through Tauri's Linux GTK/WebKit/tray dependency stack, and the narrow `glib` dry-run update locked zero packages. Recheck upstream constraints and advisory status before making a new dependency decision; do not infer the 2026-11-17 status from the June audit.
