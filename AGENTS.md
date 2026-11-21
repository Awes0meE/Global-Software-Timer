# AGENTS.md

## Project

Global Software Timer is a Windows-first, local-first desktop tray application for tracking software runtime.

Read these files before implementation work:

- `docs/superpowers/specs/2026-05-28-global-software-timer-design.md`
- `docs/superpowers/plans/2026-05-28-global-software-timer-v01.md`
- `docs/superpowers/specs/2026-06-04-settings-autostart-design.md`
- `memory.md`
- `docs/CURRENT_STATE.md`

`docs/CURRENT_STATE.md` records verified implementation behavior and review follow-up. The external improvement report is review input, not authorization to implement every proposal. Historical plan checkboxes do not represent current unfinished work.

## Required Working Style

- Follow Superpowers workflows for planning, execution, review, and finishing.
- Use subagent-driven development for the v0.1 implementation plan.
- Follow Karpathy Guidelines:
  - Think before coding.
  - Prefer simple implementations.
  - Make surgical changes.
  - Define verifiable success criteria and loop until checked.
- Use TDD for implementation tasks when the plan asks for tests.
- Do not start implementation on `main`; use an isolated worktree/branch.
- Use semantic branch names such as `docs/review-follow-up` or `fix/tracker-gap-accounting`; do not introduce agent-name prefixes.
- Commit after each completed task or coherent checkpoint.

## Git Commit Discipline

Use Conventional Commits-style messages so GitHub history reads like a clear engineering log, not a pile of release chores. Reference: https://blog.csdn.net/chenyajundd/article/details/139322838

Format:

```text
<type>(optional-scope): <short summary>
```

Use the most specific type that describes the actual change:

- `feat`: user-visible feature or behavior addition.
- `fix`: bug fix or regression fix.
- `docs`: documentation-only change.
- `style`: formatting or style-only change that does not affect behavior.
- `refactor`: code restructuring that is neither a feature nor a fix.
- `perf`: performance improvement.
- `test`: adding or changing tests.
- `build`: build system, packaging, or external dependency changes.
- `ci`: CI workflow/configuration changes.
- `chore`: repository maintenance, tooling, generated metadata, or other auxiliary work only.
- `revert`: revert a previous commit.

Do not hide feature work, bug fixes, tests, or documentation inside `chore`. A release/version bump may use `chore(release): ...` only when the underlying feature/fix/doc/test commits already exist separately.

Commit granularity:

- Prefer one commit per completed feature, fix, test addition, documentation update, or coherent checkpoint.
- Do not batch unrelated features into one end-of-release commit.
- After finishing a step and running its checks/reviews, commit immediately when the user has given permission for commits in that task/session.
- If commit permission has not been given, leave the work uncommitted and report the suggested commit message.

## Project Scope Guardrails

v0.1 includes:

- Windows 10/11.
- Tauri v2 + Rust + React/TypeScript + SQLite.
- System tray app.
- Local event/session storage.
- App runtime tracking.
- Today's recorded time and active time.
- Smart default filtering of noisy processes.
- Steam-like dark dashboard.
- Chinese UI title: `全局软件计时器`.
- Chinese time format: decimal hours with one fractional digit, for example `8.3小时` or `0.7小时`.

v0.1.2 additionally includes:

- A real Settings page in the existing app shell.
- Startup-at-login control, enabled by default through the current-user autostart mechanism.
- Close-window behavior control: minimize to tray or exit directly.
- First-close choice dialog that saves the user's choice automatically.

v0.1.3 additionally includes:

- The real `软件` page in the existing app shell.
- `特别关注`, `隐藏软件列表`, and read-only `已发现软件` panels.
- Local offline software search with English, Chinese, pinyin full spelling, and pinyin initials.
- Software-page foreground/background runtime aggregates and focused active time.
- Hidden software filtering from default dashboard summaries while keeping raw local history.
- App sidebar version display updated to `V0.1.3`.

v0.1.4 additionally includes:

- Gap-aware atomic tracker accounting and normal-exit session closure.
- Versioned schema baseline and independent read-only summary queries.
- Visibility-aware UI polling and release failure gates.
- No destructive historical cleanup or automatic database replacement; see `docs/CURRENT_STATE.md`.

The v0.2 desktop UI additionally includes:

- The desk-instrument visual system in `DESIGN.md`, replacing the Steam-like dark dashboard look.
- Light and dark themes with a 跟随系统 / 浅色 / 深色 Settings choice stored as `ui.theme`.
- A pixel-font LCD readout (bundled Ark Pixel 12px, SIL OFL 1.1) and the skeuomorphic clock app mark.

v0.1.5 through v0.2.3 additionally include:

- Tray-app runtime (`托盘运行`) and the `后台` page, which records background processes' executable name and path, running time, CPU time, peak memory and process count (SQLite schema 2).
- Version-insensitive software identities, Edge startup-boost handling, default hiding of listed vendor helper processes, and `最常用` chosen from today's active time.

v0.2.4 additionally includes:

- Executable icons read at their largest embedded size, served through the local `gsticon` protocol and cached as 96px PNGs under `%LOCALAPPDATA%\com.globalsoftwaretimer.app\icons\`. Cache files have hashed names and are pruned after 90 days. Keep `PRIVACY.md` in step with any change to this cache.
- Stricter default noise filtering: listed services, helpers and command-line tools, and executables run from Temp, Downloads or updater folders are not tracked. As a result, a portable app run from Downloads is not tracked either.
- Column-header sorting on the `后台` table.

v0.1 excludes:

- macOS implementation.
- Cloud sync.
- Accounts.
- Payment/licensing.
- Notion/Obsidian integrations.
- Mobile apps.
- Administrator-permission enhanced detection.
- Window-title, document-name, or webpage-title collection.

## Privacy And Security

- Do not add telemetry.
- Do not add network upload.
- Do not request administrator permission by default.
- Startup at login must not request administrator permission.
- Do not collect window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, or browser history.
- Keep privacy-sensitive future features explicit and opt-in.

## Windows And Encoding

This repository may contain BOM-less UTF-8 and Chinese text.

- In PowerShell, use `Get-Content -Encoding UTF8` for Markdown, source, config, and docs.
- Use `Select-String -Encoding UTF8` when searching with PowerShell.
- Prefer `rg` for search.
- Keep new files UTF-8.

## Local Toolchain

Rust is installed through rustup under `C:\Users\123\.cargo\bin`, but existing Codex shells may not inherit the refreshed user PATH.

Before running Rust/Tauri commands in PowerShell, load:

```powershell
. .\scripts\dev-env.ps1
```

This prepends Cargo to PATH and imports the Visual Studio 2022 Build Tools environment when available.

## Review Gates

For each implementation task:

1. Implement according to the plan.
2. Run the task's specified checks.
3. Self-review the diff.
4. Run a spec-compliance review.
5. Run a code-quality review.
6. Fix review findings before moving to the next task.

## Source References

The approved spec, current code, `CHANGELOG.md`, and `memory.md` are the source of truth for the current release state. The implementation plan is historical once a release has shipped. If they conflict in a way that affects behavior, stop and ask the coordinating agent rather than guessing.
