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

## Branches And Worktrees

Remote branches should stay few: `main`, the `badges` data branch that CI writes for the README download badge, and the branch of the version in progress.

- `main` holds released code only. Release commits and docs-only changes the user approves may land on it directly.
- A version in progress uses `feat/vX.Y.Z` (for example `feat/v0.4.5`). Never name a branch `vX.Y.Z`: it would clash with the release tag.
- A task inside that version uses `feat/vX.Y.Z-<topic>` (for example `feat/v0.4.5-perf`). Do not use short forms such as `v044`.
- Work outside any version uses `<type>/<topic>`, with the Conventional Commits types above (for example `fix/tracker-gap-accounting` or `docs/website-time-spec`). Do not add agent-name prefixes such as `codex/`.
- A worktree directory is named after its branch without the type prefix: `.worktrees/v0.4.5` and `.worktrees/v0.4.5-perf`. The `main` checkout stays at `.worktrees/v01-implementation` for now because existing tools refer to it.
- Push a branch whose work must not be lost, such as a spec draft, instead of keeping it only on this computer.
- After a task branch is merged into its version branch, delete the branch, locally and on the remote, and remove its worktree. After a release, delete the version branch the same way.
- Keep an abandoned branch only as an annotated `archive/<name>` tag, then delete the branch.

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
- A pixel-font LCD readout (an e-ink screen since v0.4.0; bundled Ark Pixel 12px, SIL OFL 1.1) and the skeuomorphic clock app mark.

v0.1.5 through v0.2.3 additionally include:

- Tray-app runtime (`托盘运行`) and the `后台` page, which records background processes' executable name and path, running time, CPU time, peak memory and process count (SQLite schema 2).
- Version-insensitive software identities, Edge startup-boost handling, default hiding of listed vendor helper processes, and `最常用` chosen from today's active time.

v0.2.4 additionally includes:

- Executable icons read at their largest embedded size, served through the local `gsticon` protocol and cached as 96px PNGs under `%LOCALAPPDATA%\com.globalsoftwaretimer.app\icons\`. Cache files have hashed names and are pruned after 90 days. Keep `PRIVACY.md` in step with any change to this cache.
- Stricter default noise filtering: listed services, helpers and command-line tools, and executables run from Temp, Downloads or updater folders are not tracked. As a result, a portable app run from Downloads is not tracked either.
- Column-header sorting on the `后台` table.

v0.3.0 additionally includes:

- The `统计` page (a chosen multi-day range compared with the previous range of the same length) and the `成就` page (activity heatmap, streaks, personal records, focus-time milestones, software comings and goings). Both only read the existing local daily-summary and session tables: no schema change (still schema 2) and no tracking change. Binding decisions: `docs/superpowers/specs/2026-11-21-statistics-and-achievements-design.md`.
- 只记录，不设目标: days with under 5 active minutes count as `没用` to filter noise, not as a target. Write `用过 / 没用`; never show `达标`, countdowns, streak reminders or notifications.
- Hidden software stays out of both pages' software-level figures unless their `包含隐藏软件` switch is on.
- The header single-day date button appears only on `概览` and `后台`.

v0.3.1 additionally includes:

- Timeline data collection: `timeline_segments` (focus identity and active state per credited stretch) and `timeline_window_spans` (when each software identity had a taskbar window), written in the tracker tick's transaction (SQLite schema 3). Kept permanently; no backfill, cleanup or export.
- Hidden software is still recorded; hiding only affects display. The read-only `get_timeline_summary` command exists but no page calls it until v0.5.0.
- Keep `PRIVACY.md` in step with any change to what these tables store. Binding decisions: `docs/superpowers/specs/2026-11-22-timeline-data-collection-design.md`.

v0.4.0 additionally includes:

- The Mica-glass shell with e-ink screens replaces the v0.2 desk-instrument case and LCD look (`DESIGN.md`). No tracking, schema (still 3), metric or wording change; the sidebar `时间轴` entry is still unavailable.
- One read-only command, `get_transparency_effects_enabled`, reads the Windows transparency setting (HKCU, not stored); panels turn opaque when it is off. The only other data change is one extra read-only field in the dashboard summary: `get_dashboard_summary` returns `usage_date` (the local date of today's readings), which clears the overview readout ghost when the date changes. Binding decisions: `docs/superpowers/specs/2026-11-22-glass-eink-redesign-design.md`.

v0.4.2 additionally includes:

- Date browsing on `概览` and `后台`: a `‹ date ›` header key group with a plain date-picker calendar popover on an e-ink surface, and a `今天` key when a past day is shown. The viewed date is never persisted; past days are read-only views of stored data. The `统计` custom range uses the same calendar.
- Page-specific CSV exports (`概览`, `软件`, `后台`, `统计`), settings export/import as JSON (merge-only, previewed before applying) and a full data backup (`VACUUM INTO`; restored in the app since v0.4.4). Files are written only to the path the user picks in the native dialog; no program paths in exports, no network.
- The header and panel `更多` buttons are removed (no placeholder header buttons); the `后台` e-ink strip is taller.
- No tracking or schema change (still schema 3). Binding decisions: `docs/superpowers/specs/2026-11-24-v042-date-browsing-and-exports-design.md`.

v0.4.3 additionally includes:

- Shareable 1080×1440 PNG posters: `日报海报` (the viewed day, from the `概览` `导出日报` menu) and `成就海报` (one software's highest focus milestone, from the `成就` `导出成就` key and its picker dialog). Posters follow the app's resolved theme and never show program paths.
- `统计` `导出报表` becomes a menu: `区间汇总` (every software in the range, plus `后台` and `使用天数`) and `每日明细` CSV. A used day is focus ≥ 300 s; window-only or background-only days never count.
- Posters are rendered with `modern-screenshot` 4.7.0 (loaded only when exporting) and the bundled poster-only fonts Inter and Noto Sans SC (SIL OFL 1.1, GB2312 subset); the app UI keeps its fonts. PNGs are saved by `save_binary_export` through the native dialog; the `gsticon` protocol sends CORS headers only to the app's own origins.
- No tracking or schema change (still schema 3), no network. Binding decisions: `docs/superpowers/specs/2026-11-25-v043-posters-and-reports-design.md`.

v0.4.4 additionally includes:

- `设置` gains the `外观` group (`主题`, `主题色`, `墨水屏配色`) and the `数据` group (`数据文件夹`, `从备份恢复`). `运行` gains `启动时打开`, and `显示` gains `每周起始日` and `减少动画`. The five new settings are stored as `ui.accent`, `ui.eink`, `ui.week_start`, `ui.start_page` and `ui.reduce_motion` in `app_settings` (schema still 3), written through `set_ui_preference`, and carried by settings export and import.
- `主题色` has 8 choices. 蓝 is the default and is pixel-identical to v0.4.3. Every other choice also tints the background glow, with per-choice blob alphas tuned for readability; the table is in `src/styles.css` and `DESIGN.md`. Signal orange, `--mix-*`, `--alert-*`, forced colours and posters never follow the accent. `跟随 Windows` reads the Windows accent through the read-only `get_windows_accent` command (HKCU, not stored in the database), and `src/accent.ts` clamps it for contrast. `墨水屏配色` has 5 palettes, and 极光 is today's look. Posters keep their own look.
- `每周起始日` changes exactly five frontend places, and no backend command. `启动时打开` applies only when the process starts and never navigates after the user has moved. `减少动画` can only add motion reduction on top of the Windows setting.
- `从备份恢复` restores a full backup in the app. The picked file is copied and checked, and the live database is never touched. The swap happens at the next start, before any connection opens, through an idempotent state machine. The data being replaced is kept in `backups\` (newest 3). A restore file that cannot be moved shows the `RestoreStuck` fatal message and opens nothing. Never exercise a restore on the production profile, only on disposable temp folders. `打开数据文件夹` opens the data folder from the app's own path.
- Icons and stored program paths touch the file system only for lettered local-drive paths (`src-tauri/src/local_path.rs`).
- No new Tauri plugin, capability, network access or telemetry. Keep `PRIVACY.md` in step with the accent read and the restore files. Binding decisions: `docs/superpowers/specs/2026-11-26-v044-personalization-and-data-design.md`.

v0.4.5 additionally includes:

- Apple-HIG polish: the UI font is the bundled Inter and Noto Sans SC (600 / 500 / 400, tabular digits; the e-ink pixel font is unchanged), concentric e-ink screens 8px inside their panels, one type ladder outside the screens, no letter-spacing on Chinese, scroll-edge fades, `…` on commands that ask for more, one primary key on `软件`, keyboard shortcuts (`Ctrl+1`–`Ctrl+6`, `Ctrl+,`, `Ctrl+←` / `Ctrl+→`) and 28px `?` hit areas. The last explanatory small print is removed.
- `设置` → `显示` → `文字大小` (`标准` / `大`, stored as `ui.text_size`): `大` zooms the window to 125% with a 1280×800 minimum window.
- The sidebar is a floating glass card that folds into an icon rail. The manual choice is kept only in localStorage `gst.sidebar-collapsed`, and it folds by itself below 1200 CSS px.
- Performance: the `概览` summary works out each software's name, identity and best path once per software instead of once per session (44 ms to 12 ms on a six-month database).
- Legacy heartbeat cleanup: the first start saves a full copy to `backups\GST-清理前-…db` (newest 1) and only then removes the unused `app_heartbeat` rows of `run_events` and compacts the database (`src-tauri/src/maintenance.rs`); nothing is removed when the copy fails.
- No tracking, metric or schema change (still schema 3), no new plugin, no network access.

v0.4.6 additionally includes:

- `设置` gains the `关于与反馈` group above `隐私`: `当前版本` with `更新日志`, `报告问题`, `提建议`, and `QQ 交流群` 937943526 with `复制群号` and `加入`. Links open in the default browser through `open_feedback_link` (`src-tauri/src/feedback.rs`), which accepts only four fixed names; never let the frontend pass an address.
- `检查更新…` (`src-tauri/src/update.rs`) asks for consent every time before going online. A newer stable release opens `发现新版本`; `更新并重启` saves a full copy to `backups\GST-更新前-<version>-…db` (newest 1; nothing is downloaded when the copy fails), downloads with progress, verifies the updater signature, closes the open sessions and runs the installer in passive mode; the tracker resumes when the installer cannot start. See the Privacy And Security rules below.
- CI signs the installers with the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets and publishes `latest.json` with the installers and `SHA256SUMS.txt`; a release without the key or a valid manifest is refused. This is updater signing, not Windows code signing.
- The license changes to GPL-3.0-or-later; see the License section.
- No tracking, metric or schema change (still schema 3). The only new plugin is tauri-plugin-updater, used from Rust only.

v0.4.7 additionally includes:

- Fixes from the v0.4.6 hands-on acceptance: the page header (`data-tauri-drag-region`, capability `core:window:allow-start-dragging`) moves the window, and the page selects no text (`user-select: none` on `body`; fields and `.warning` stay selectable).
- Toasts rise in and sink out (`toast-in` / `toast-out`, `TOAST_EXIT_MS`) on a raised, accent-tinted `--toast-surface`; `减少动画` cuts the motion. Every `检查更新…` ending is a `确定` dialog (`已是最新版本`, `无法连接到 GitHub`, `更新没有完成`), not a toast.
- `成就`: a lit milestone plate opens a dialog listing every software at or past its tier; unlit plates stay inert. The heatmap shades a used day linearly from 20% ink to full ink at 12 hours of active time (`heatPercent`).
- `概览` → `今日分布` has no total (it disagreed with `今日活跃`); each row keeps its percentage at every width.
- The `设置` readout shows `已记录 N 天`, `本机数据` (`get_data_size`: the database plus its `-wal`, read from the app state's path) and the line `绝对隐私，数据只存本地` / `不联网、不登录、零遥测、零请求`; the version is shown only in `关于与反馈`.
- tauri-plugin-updater 2.14.1 (drops the vulnerable `zip` 4) with Tauri 2.12.7 and `@tauri-apps/api` / `cli` 2.12.
- No tracking, metric or schema change (still schema 3), no new plugin, no new network access.

v0.4.8 additionally includes:

- Motion with no animation library (`src/motion.ts`): page, day and range swaps dissolve in place through view transitions (`runSwap`, `useContentSwap`; only `.workspace > main` and `.page-header` take part), the selected key of the sidebar and of every segmented control glides (`useSelectionGlide`), and dialogs and header popovers leave through an inert copy (`playExitGhost`, `useDialogExit`). Swaps never fade in from blank. Everything is off under `减少动画` or Windows reduced motion.
- `设置` → `显示` → `动画速度` (`快` / `中` / `慢`, stored as `ui.motion_speed`, default `normal`): `--motion-scale` 0.6 / 1 / 1.5 on every v0.4.8 duration and the dialog, popover and toast animations. Greyed out while motion is reduced.
- A quick read swaps straight in; only a read over 300 ms dims the figures. `src/pageReads.ts` keeps each page's last read in memory for this run only (never stored), so coming back to a page shows it at once.
- Numbers outside the e-ink screens use the bundled Oxanium (`GST Num`, `src/assets/fonts/oxanium/`, SIL OFL 1.1) at weight 500 with `size-adjust: 108%` and a `text-autospace` hairline before units. The UI text font, the e-ink pixel font and the poster fonts are unchanged.
- The window stays opaque: no Mica, Acrylic or glass-transparency setting (user decision; the spike is kept as tag `archive/v0.4.8-mica`).
- No tracking, metric or schema change (still schema 3), no new plugin, no new network access.

v0.1 excludes:

- macOS implementation.
- Cloud sync.
- Accounts.
- Payment/licensing.
- Notion/Obsidian integrations.
- Mobile apps.
- Administrator-permission enhanced detection.
- Window-title, document-name, or webpage-title collection.

## License

- From v0.4.6 the project is licensed GPL-3.0-or-later (`LICENSE` holds the unmodified GPL text, so GitHub detects it). v0.4.5 and earlier stay MIT.
- The names 全局软件计时器 / Global Software Timer / GST and the clock icons are not licensed with the code; see `TRADEMARKS.md`.
- New dependencies, fonts and assets must be GPL-3.0-compatible (MIT, BSD, Apache-2.0, OFL and similar are fine; no proprietary or non-commercial-only components).
- Keep the copyright holder as `Global Software Timer Contributors`; do not add personal names.

## Code Signing

- `CODE_SIGNING_POLICY.md` is the code signing policy SignPath Foundation requires; keep it linked from the README download section.
- Every `docs/releases/vX.md` ends with a `## 代码签名 / Code signing policy` line linking that file, because the release page is the download page.

## Privacy And Security

- Do not add telemetry.
- Do not add network upload.
- GST never connects on its own (user rule, 2026-11-26). The only network access is `检查更新…` (v0.4.6, `src-tauri/src/update.rs`): it goes online only after the user presses `联网检查` in its consent dialog, every time. Never remember that consent, and never check at startup, on a timer or in the background. It talks only to the GitHub release endpoint in `tauri.conf.json` and the installer URL that manifest lists, and sends no usage data. The updater plugin is used from Rust only; do not grant the webview an updater capability.
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
