# v0.4.4 Personalisation and Data Tools Design

Status: binding. The user approved the product decisions below on 2026-11-26, for version v0.4.4, after one round of rendered mockups:

- 主题色 variant **B**: the accent also tints the background glow.
- All 8 accent swatches and all 5 e-ink palettes ship.
- 玻璃透明度 is **dropped** from v0.4.4 (option 甲).
- The 设置 layout as mocked, including the one-line row descriptions.

Amended on 2026-11-26, after implementation, to record what was built where the first text was silent or could not hold:

- the tuned glow alphas (§B);
- the one Windows accent read on 设置 for the 跟随 Windows swatch (§A, §B);
- the `RestoreStuck` startup message and the restore fixes (§H);
- the preview's `?startpage` behaviour and its extra query options (§J).

The glow strength and the 跟随 Windows fallback alphas still wait for the user's confirmation.

The previous release spec is `2026-11-25-v043-posters-and-reports-design.md` (v0.4.3, shipped).

This spec is written in English. Every UI string is given in Chinese exactly as it must appear.

The approved look comes from throwaway mockups that are not committed: session scratchpad `v044/mock`, with sheets `1-settings.png` … `5-restore.png`, `README.md` (all values with measured contrast) and `scripts/lib.js` (the injected CSS). Port the look faithfully and write production code. Where this spec and the mock disagree, this spec wins. The mock's 玻璃透明度 row is not built.

## Goal and scope

| Do | Do not |
| --- | --- |
| 主题色 (8 choices, including 跟随 Windows), which also tints the background glow | 玻璃透明度; a transparent, Mica or Acrylic native window (a later, separate spike) |
| 墨水屏配色 (5 palettes) | Change posters: they keep their own fixed look |
| 每周起始日, 启动时打开, 减少动画 | Change tracking, metrics, the schema (still schema 3) or any summary command's inputs |
| 打开数据文件夹, 从备份恢复 | New Tauri plugins, network access, telemetry, admin rights |
| Settings export/import carries the five new settings | A free-form colour picker, or user-defined palettes |

## A. 设置 page layout

The order and rows below are binding. Existing rows keep their current text, icon and behaviour. A new row uses the existing `settings-row` structure: icon, `strong` title, one-line `span` description, then the control. Lucide icons are used, matching the mock.

1. **本机状态** readout: unchanged.
2. **运行**
   - 开机自启动
   - 关闭窗口时最小化到后台
   - **启动时打开**: description 「启动 GST 后先显示的页面」. Segmented control `概览 | 软件 | 后台 | 统计 | 成就`. (§E)
3. **显示**
   - 显示分钟数
   - **每周起始日**: description 「日历、热力图和“本周”从哪天开始」. Segmented control `周一 | 周日`. (§D)
   - **减少动画**: description 「关闭开关滑动、弹窗和指示灯呼吸等动效」. A toggle with status `已开启` / `已关闭`. (§F)
4. **外观** (new group)
   - 主题: the existing segmented row moves here unchanged.
   - **主题色**: description 「开关、选中项、导航图标和背景光晕的颜色」. A swatch row, with status text showing the current choice's name. (§B)
   - **墨水屏配色**: description 「读数屏和日历弹窗的纸色与墨色」. A chip row, with status text showing the current palette's name. (§C)
5. **数据** (new group)
   - **数据文件夹**: description 「数据库和恢复前的自动备份都在这里」, with an in-panel secondary key `打开`. (§G)
   - **从备份恢复**: description 「用一份完整备份替换当前数据，完成后自动重启」, with an in-panel secondary key `选择备份…`. (§H)
6. **隐私**: unchanged.

The page already scrolls (`overflow: auto`). Nothing else on the page changes.

### Swatch and chip controls

- **Swatches**:
  - 8 round 20 px dots with a 10 px gap, in a `role="radiogroup"` labelled by the row title.
  - Each dot is a `role="radio"` button with `aria-checked`, an `aria-label` and a `title` set to its name.
  - Selected: a 2 px `--ink` ring with a 2 px gap.
  - Keyboard: arrow keys move and select within the group (roving tabindex); Home and End go to the first and last swatch.
  - Focus uses the standard `--focus` ring.
  - The first dot, 「跟随 Windows」, is filled with the resolved Windows accent and carries a small white four-pane Windows glyph. When the Windows accent cannot be read, it is filled with the 蓝 preset.
  - *Amended:* the dot shows the Windows accent even while another choice is selected. So when 设置 opens with any choice other than `system`, the page does one read-only `get_windows_accent` read (`readWindowsAccentForSwatch` in `src/appearance.ts`). Only the swatch uses the result, because a preset ignores the Windows pair. Like every read, the result goes into the `gst.appearance` cache.
- **Chips**:
  - 5 chips of 36×22 px with a 5 px radius. Each chip is painted with its palette's paper for the current theme (the dark gradient in dark) and shows a pixel-font 「8」 in that palette's ink.
  - Selection ring, ARIA and keyboard as for the swatches.
- Until settings load, both groups are disabled, like the theme row today.

## B. 主题色

### Choices

The values are stored as `ui.accent`. The default, used when the key is unset or invalid, is `blue`, so existing users see no change.

| id | Name | Light `--accent` | Dark `--accent` |
| --- | --- | --- | --- |
| `system` | 跟随 Windows | derived (below) | derived (below) |
| `blue` | 蓝 | `#2f7de1` | `#5aa9ff` |
| `cyan` | 青 | `#0e8a9e` | `#3cc8dc` |
| `green` | 绿 | `#048f54` | `#4fd18b` |
| `violet` | 紫 | `#7d5ce0` | `#a78bfa` |
| `rose` | 玫红 | `#d6336c` | `#ff7aa2` |
| `amber` | 琥珀 | `#ad6d15` | `#f5b94a` |
| `graphite` | 石墨 | `#5f6b7a` | `#aab4c3` |

Swatch order is the table order. Every pair passes the current contrast rules, as measured in the mock README:

- **Light theme:** at least 3:1 on `--glass-solid` and on the glass over every glow centre. The glass is the only glass level, i.e. today's.
- **Dark theme:**
  - the knob ring `rgba(0,0,0,.5)` over the accent is at least 3:1;
  - `--muted` on a 14% accent tint over `--glass-solid` is at least 4.5:1.

### What follows the accent

These follow the accent:

- Every current `var(--accent)` use: selection, nav icon, `mark`, selected add-software row, toggle on fill and hover, background-table sort focus and icon, header focus, menu icon hover, calendar focus outlines, toast icon, poster-dialog selected row, and the 6666 h plate ring.
- `--focus`, `--tg-rim-on`, and `--tg-well-on`.
  - `--tg-well-on` is rebuilt from the accent; it no longer uses hard-coded navy.
  - Light: `inset 0 2px 3px -1px color-mix(in srgb, color-mix(in srgb, var(--accent) 30%, #000) 50%, transparent), inset 0 -1px 0 rgba(255,255,255,.32)`.
  - Dark: `inset 0 2px 3px -1px color-mix(in srgb, color-mix(in srgb, var(--accent) 22%, #000) 60%, transparent), inset 0 -1px 0 rgba(255,255,255,.28)`.

These do **not** follow:

- `--signal*` ("now", recording lamps)
- `--mix-*` (app identity colours)
- `--alert-*`
- forced-colours rules
- posters

### Background glow (variant B)

The three blobs keep today's sizes, positions and fade stops.

- **`blue`**: the glow stays exactly today's `--glow` in both themes. The default look is pixel-identical to v0.4.3.
- **Every other choice, `system` included**: the glow is built from the accent with the mock formula.
  - Light:
    - blob 1 = `color-mix(in srgb, var(--accent) 45%, transparent)`;
    - blob 2 = `color-mix(in srgb, color-mix(in srgb, var(--accent) 40%, rgb(240,120,190)) 26%, transparent)`;
    - blob 3 = `color-mix(in srgb, color-mix(in srgb, var(--accent) 65%, rgb(160,130,255)) 30%, transparent)`.
  - Dark: the same shape, with blob 1 at 50%, blob 2 mixing into `rgb(236,92,170)` at 24%, and blob 3 mixing into `rgb(150,110,255)` at 28%.
- *Amended (option (a)):* the percentages above are the mock's, and they fail the readability rule below for several choices. The colour mixes stay as given, but the blob alphas are `--glow-alpha-1 / -2 / -3`, set per choice and theme. Each value is the largest whole percent that passes `contrast.test.ts`:
  - blob 1 is bounded by the text and graphic checks on the worst glow centre, B;
  - blobs 2 and 3 are bounded by B staying the lowest-contrast centre.

  `src/styles.css` holds the values, which are binding:

  | choice | light 1 / 2 / 3 | dark 1 / 2 / 3 |
  | --- | --- | --- |
  | `system` 跟随 Windows | 16 / 18 / 17% | 23 / 20 / 22% |
  | `cyan` 青 | 26 / 26 / 28% | 27 / 24 / 28% |
  | `green` 绿 | 25 / 26 / 27% | 27 / 24 / 28% |
  | `violet` 紫 | 25 / 26 / 27% | 32 / 24 / 28% |
  | `rose` 玫红 | 22 / 26 / 25% | 31 / 24 / 28% |
  | `amber` 琥珀 | 27 / 26 / 29% | 25 / 24 / 28% |
  | `graphite` 石墨 | 25 / 26 / 27% | 27 / 24 / 28% |

  - `system` uses the fallback values of the two theme blocks. That one set holds for every accent the clamp can return. `accent.ts` still clamps against the stronger mock alphas.
  - `blue` keeps today's `--glow` and has no alphas.
  - Still open for the user: the glow is fainter than the approved mock, and light `system` is the faintest of all. The two ways out are amending this table or relaxing the "B is the lowest-contrast centre" rule to allow stronger blob-1 alphas.
- Readability is unchanged. The existing glow-centre contrast checks (`--ink`, `--ink-2` and `--muted` on the worst glow centre, and text straight on the glow) must pass for every choice, in both themes.

### Mechanism

- CSS stays theme-driven.
  - Each theme block reads `--accent: var(--user-accent-light, #2f7de1)` and `var(--user-accent-dark, #5aa9ff)`.
  - A root attribute `data-accent="<id>"` selects the glow: absent or `blue` means today's glow, and any other value means the accent-built glow.
- JS sets `--user-accent-light` and `--user-accent-dark` inline on `<html>` for every choice except `blue`. For `blue` it removes them.

### 跟随 Windows

- A new read-only Rust command `get_windows_accent` returns `{ light: "#rrggbb", dark: "#rrggbb" } | null`. It does not write or store anything.
  - Primary source: `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent\AccentPalette`. This is `REG_BINARY` holding 8 RGBA entries; use entries Light3, Light2, Light1, Accent, Dark1, …. Light takes **AccentDark1** and dark takes **AccentLight2**.
  - Fallback: `HKCU\Software\Microsoft\Windows\DWM\AccentColor`, a `REG_DWORD` in ABGR. Both themes start from that base.
  - A missing or malformed value returns `null`.
- Follow the `appearance.rs` template: a pure parser, a `#[cfg(windows)]` `RegGetValueW` reader with a non-Windows stub, and unit tests (including a cross-check against `reg query`).
- The frontend passes the result through a pure clamp, `src/accent.ts`. It adjusts OKLCH (or OKLab) lightness, keeping hue and chroma, until the colour meets the preset rules above. A mid-tone Windows accent can therefore never fail contrast.
  - With `null`, `system` resolves to the `blue` values but still uses the accent-built glow. That glow is deliberately not today's exact glow, so the choice stays visibly "system".
- Read when settings load, then again on every `visibilitychange` to visible, with the same latest-request guard as `startTransparencyWatch`. Nothing is read when the choice is not `system`, with one exception: the single read when 设置 opens, which paints the swatch (§A).

## C. 墨水屏配色

The values are stored as `ui.eink`. The default, used when the key is unset or invalid, is `aurora`, which is today's look.

Five ids, in this chip order: `aurora` 极光, `graphite` 石墨, `night` 夜蓝, `warm` 暖纸, `forest` 墨绿.

Each palette sets all 11 `--eink-*` tokens per theme. The tokens are `paper`, `paper-solid`, `dial-paper`, `ink`, `dim`, `mid`, `off`, `track`, `ghost`, `grain` and `grain-blend`. Their values are binding and are the ones in the mock README table "墨水屏配色", copied here:

| id | Theme | paper | solid | dial | ink | dim | mid | off / track / ghost (rgb · alphas) | grain, blend |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aurora | light | today | today | today | today | today | today | today | today |
| aurora | dark | today | today | today | today | today | today | today | today |
| graphite | light | `#e3e3e1` | `#e3e3e1` | `#e3e3e1` | `#111111` | `#434346` | `#6e6e72` | 17,17,17 · .28/.12/.04 | .06 multiply |
| graphite | dark | `linear-gradient(105deg, #22252b, #2a2c33)` | `#26282e` | `#2c2f36` | `#ededf0` | `#b4b5bb` | `#85868d` | 237,237,240 · .2/.14/.05 | .4 soft-light |
| night | light | `#e2ebf6` | `#e2ebf6` | `#e2ebf6` | `#0b1422` | `#30435e` | `#5d7392` | 11,20,34 · .28/.12/.04 | .06 multiply |
| night | dark | `linear-gradient(105deg, #14233a, #1a2f4d)` | `#172943` | `#1d3150` | `#e7eef8` | `#a9bad0` | `#6f84a1` | 231,238,248 · .2/.14/.05 | .4 soft-light |
| warm | light | `#f4eee1` | `#f4eee1` | `#f4eee1` | `#2a2218` | `#5a4d3c` | `#857660` | 42,34,24 · .28/.13/.05 | .08 multiply |
| warm | dark | `linear-gradient(105deg, #2a231b, #3a2c20)` | `#322719` | `#3a2e22` | `#f4ead8` | `#cdbfa6` | `#958670` | 244,234,216 · .2/.14/.05 | .42 soft-light |
| forest | light | `#e1ede4` | `#e1ede4` | `#e1ede4` | `#0e1a14` | `#31503f` | `#5e7a6b` | 14,26,20 · .28/.12/.04 | .06 multiply |
| forest | dark | `linear-gradient(105deg, #16302a, #1d3b33)` | `#1a352e` | `#1f3d35` | `#e8f2ec` | `#aac3b6` | `#6f9183` | 232,242,236 · .2/.14/.05 | .4 soft-light |

- **Selectors.** `data-eink="<id>"` on `<html>` (absent means `aurora`). Selectors must be scoped per theme so a light palette never leaks into dark: `:root:not([data-theme="dark"])[data-eink="x"]` and `:root[data-theme="dark"][data-eink="x"]`.
- **What follows the palette.** Every e-ink surface follows automatically through the tokens: the 概览 readout and dial, the 后台 strip, the calendar popovers, the 统计 recorder and the 成就 heatmap and plates. Posters do not.
- **Contrast, per palette and theme**, against every paper stop, `paper-solid` and `dial-paper`:
  - dim ≥ 4.5:1;
  - mid ≥ 3:1;
  - mid and off must stay distinguishable, as in today's tests;
  - the accent focus outline on paper ≥ 3:1, checked for every accent choice. If a pairing fails, the focus outline on e-ink paper uses `--eink-ink` instead of the accent. Decide this by test, not by eye.

## D. 每周起始日

The values are stored as `ui.week_start`: `monday` (default) or `sunday`. The setting only changes the frontend display. No backend command gets a new argument.

`WeekStart = 0 | 1` (Sunday = 0, Monday = 1) is provided once from `App` through a small `WeekStartContext`, with default 1. Pure helpers take it as a last parameter that defaults to 1. Exactly these five places follow it:

1. **The date-picker calendar** (`DayCalendar` / `RangeCalendar` `weekStartsOn`). Header names reorder to 日一…六.
2. **The 统计 `本周` preset.** It uses `(now.getDay() - weekStart + 7) % 7`.
3. **The 成就 activity heatmap.** The header row rotates, and the leading blank cells use the same offset formula.
4. **The `TrendRecorder` mid-density ticks.** They mark the first day of the week.
5. **The 软件 page 「这周X / 上周X」 last-opened text.**

These do **not** change:

- Weekday names (`周三`, `星期三`).
- 工作日 / 周末 (Saturday and Sunday stay the weekend).
- Posters, CSV exports, and the 统计 comparison range ("the same number of days just before").

## E. 启动时打开

- The values are stored as `ui.start_page`: `overview` (default), `software`, `background`, `statistics` or `achievements`. Unknown values, `settings` and `timeline` included, normalise to `overview`.
- The options are derived from `navItems` (available, not 设置). When v0.5.0 adds 时间轴, it only has to be added in one place.
- It applies only when the app process starts: a manual launch, autostart at login, a relaunch after 退出, or the restart after a restore. Showing the window from the tray, or from a second launch, keeps the page the user left.
- **No flip.** The first render uses a localStorage cache (`gst.startPage`), read the way `gst.theme` is. The lazy chunk for that page is warmed at mount. After settings load:
  - the cache is refreshed;
  - if the stored page differs from the cached page **and the user has not navigated yet**, it switches once.
  - Changing the setting, or importing settings, saves and caches the new value but never navigates.

## F. 减少动画

- The values are stored as `ui.reduce_motion`: `system` (default; follow Windows) or `reduce` (always reduce). The toggle is on when the value is `reduce`.
- The user can only add reduction. With `system`, the OS setting still applies.
- `data-motion="reduced"` on `<html>` when the value is `reduce`.
- In CSS, the existing `@media (prefers-reduced-motion: reduce)` block stays unchanged. A sibling block with identical rules, scoped under `:root[data-motion="reduced"]`, sits next to it. A parity test keeps the two rule sets equal.
- Every state change still lands, only instantly:
  - toggles still move;
  - popovers, dialogs and toasts still appear;
  - the recording lamp stays lit and only stops breathing;
  - dial segments still fill;
  - stale and pending dimming stays;
  - focus rings and the e-ink ghost are unchanged.

## G. 打开数据文件夹

- Rust command `open_data_folder`:
  - Opens the folder that contains the live database (`%APPDATA%\com.globalsoftwaretimer.app\`) in Explorer.
  - The path comes from the app state, never from the webview.
  - Uses the existing `explorer_path()`, with `raw_arg` quoting and `.spawn()` (explorer.exe exits with 1 even on success).
- No plugin is added, and no capability changes.
- On failure, a toast 「无法打开数据文件夹」.

## H. 从备份恢复

### Flow

1. **`选择备份…`** opens the native open dialog.
   - Filter `GST 数据备份` with the extensions `db`, `sqlite3` and `sqlite`, starting in Downloads.
   - Cancelling does nothing.
2. **Rust `pick_restore_backup`** is async and runs in `spawn_blocking`. It validates and stages the file. Nothing touches the live database.
   1. Refuse the live DB and its side files, the staging and restore names, and anything inside the app's own data folder that is not a `backups\` copy. Canonicalise the path like `ensure_not_database`.
   2. Header `SQLite format 3\0`; enough free space for a copy.
   3. Copy the file to `<datadir>\.gst-restore-<uuid>.tmp`, then clear the copy's read-only attribute (*amended*: a read-only backup would otherwise be refused as invalid), then validate **the copy** on a private connection:
      - `trusted_schema=OFF`, and defensive mode on;
      - reject the file if it has any trigger or view;
      - `quick_check` = `ok`;
      - `user_version` > 3 → "newer";
      - `user_version` 0 → require `apps`, `usage_sessions` and `run_events`;
      - `user_version` 1–2 → additionally require `app_settings` and `software_identities`.
   4. Run `Store::migrate()` on the copy, then switch it to `journal_mode=DELETE` and close it. The staged file is then one complete schema-3 file.
   5. Stash it under a single-use `restore_id`, like `pending_import`. Picking again, or cancelling, deletes the earlier staged file.
   6. Return a preview:
      - the file name;
      - the first and last recorded day;
      - the number of distinct software identities with at least one usage session;
      - the file size.
3. **The confirm dialog** 「从备份恢复」 uses the 导入设置 dialog language: scrim, inert background, focus trap, Esc. Its fact rows are:
   - `备份文件` (the name)
   - `记录范围` (`YYYY-MM-DD 至 YYYY-MM-DD`)
   - `软件` (`N 个`)
   - `文件大小`: integer `MB` from 10 MB up; one decimal below 10 MB; `KB` below 1 MB.

   Two plain paragraphs follow: 「当前数据会被这份备份替换，备份日期之后的记录将不再保留。」 and 「替换前，当前数据会自动另存到数据文件夹的 backups 里。」.

   The keys are `取消` and `恢复并重启` (primary, initial focus on `取消`).
4. **Error dialog.** Same dialog, with one paragraph and a single `关闭` key. The texts are:
   - not a GST backup, corrupt, or containing triggers or views: 「这个文件不是有效的 GST 备份。」
   - newer schema: 「这份备份来自更新版本的 GST，无法在当前版本恢复。」
   - the live database or one of its files picked: 「不能选择正在使用的数据库。」
   - not enough disk space: 「磁盘空间不足，无法恢复。」
   - anything else: 「恢复失败，当前数据没有改动。」
5. **Rust `apply_restore(restore_id)`:**
   - renames the staged file to `global-software-timer.sqlite3.restore-pending`, in the same folder;
   - sets a relaunch flag and exits the app normally, so `RunEvent::Exit` runs `tracker.shutdown()`;
   - after shutdown, spawns `current_exe()` with `--after-restore=<own pid>`.
   - Do **not** use `AppHandle::restart`. It spawns the child before the parent releases the single-instance mutex, so the child exits.

### Swap at startup

The swap happens before any connection opens, in `setup`, right after the data folder is created and before `AppState::new`.

- **Handover.** With `--after-restore=<pid>`, first wait up to about 15 s for that process to exit (`OpenProcess(SYNCHRONIZE)` + `WaitForSingleObject`). Then retry the single-instance lock for a few seconds instead of quitting on "already running".
- **Idempotent state machine.** Each step is safe to resume after a crash at any point:
  1. **Pending and live both exist.** Open live, run `wal_checkpoint(TRUNCATE)` and `journal_mode=DELETE`, and close it. If that fails, abort: keep live, and rename pending to `.restore-failed`.
  2. Rename live to `global-software-timer.sqlite3.before-restore`.
  3. Delete any `-wal` or `-shm` that still carries the live name. A stale WAL beside a new main file would be replayed into it.
  4. Rename pending to live.
  5. Run `AppState::new` (migrate, and recover open sessions).
     - **On success:** move `.before-restore` to `<datadir>\backups\GST-恢复前-YYYY-MM-DD-HHMMSS.db`, keep the newest 3 such files, and set a one-shot flag for the UI. *Amended:* pruning never deletes the copy it just moved, and that copy counts toward the 3, even when its name sorts oldest.
     - **On failure:** rename the restored file to `.restore-failed`, rename `.before-restore` back to live, retry `AppState::new`, and set a one-shot failure flag.
- **Crash recovery.**
  - Live missing, pending present: continue at step 4.
  - Live missing, `.before-restore` present: rename it back **before** `AppState::new`. Otherwise `Connection::open` would create an empty database.
  - Leftover `.gst-restore-*.tmp` files are deleted at startup.
- **Retries.** Renames retry briefly (about 10 × 200 ms) for antivirus or indexer handles. Every file stays in the data folder, which keeps every rename on one volume.
- **Stuck files (amended).** Before a rollback reports itself, the pending file must be gone. GST renames it to `.restore-failed` or, failing that, deletes it. Otherwise the next start would apply a restore that the UI reported as rolled back.
  - When the pending file stays, or the original cannot be put back under the live name, startup returns `StartupError::RestoreStuck` and opens no database. Opening the live name could create an empty one.
  - In the branch where pending → live fails, the original stays as `.before-restore`. The next start then finishes the restore and archives the original as its pre-restore copy.
  - The app shows this fatal message box, then exits:

    > 从备份恢复没有完成：数据文件暂时无法移动。
    >
    > 请关闭占用数据文件夹的程序（如杀毒或备份工具）后重新打开全局软件计时器，现有数据不会丢失。
    >
    > 数据文件夹：`<data folder path>`

  - The files stay as they are, and the next start resumes.
- **One-shot UI flags.** A command reports the one-shot flags to the UI:
  - toast 「已从备份恢复」 on success;
  - toast 「恢复没有完成，已保留原来的数据」 on rollback.
- **Guarding the files.** `ensure_not_database` and the backup and export guards also refuse the `.restore-pending`, `.before-restore` and `.restore-failed` names, and `backups\`.
- **Known effect.** The restored database's own settings apply after the restart, autostart included (pushed to the OS on load, as today), and the localStorage first-frame caches reconcile from them.
- **Stored paths (amended).** A restored database brings its own executable paths. Program paths therefore reach the file system only when they are absolute lettered-drive paths (`C:\…`, `C:/…`, `\\?\C:\…`). The guard is `src-tauri/src/local_path.rs`, used by the icon lookup and by `executable_path_score`. UNC, `\\?\UNC\`, `\\.\` and relative paths are never opened, so software that runs from a network share gets the letter tile instead of an icon. This side effect still waits for the user's confirmation.

### Tests

Tests run on temp directories only, never on a real profile. They cover:

- every validation rejection;
- a schema 2 → 3 migration of the staged copy;
- every startup state, including "live missing + before-restore present" and "a stale `-wal` is not applied to the restored file";
- rollback when the restored file fails to open;
- pruning to 3 pre-restore copies;
- the single-use `restore_id`.

## I. Persistence, import/export, first frame

- **Storage.** The new keys live in the existing `app_settings` table, so the schema does not change:
  - `ui.accent`
  - `ui.eink`
  - `ui.week_start`
  - `ui.start_page`
  - `ui.reduce_motion`
- **Rust.**
  - One enum per key, with `as_str` / `from_setting`. Unknown values count as "not configured".
  - `AppSettings` gains `x` and `x_configured` for each key.
  - One setter command, `set_ui_preference(key, value)`. It validates `value` through that key's enum and returns an error for an unknown key or value.
  - The existing setters stay.
- **Settings file.**
  - The format stays `kind:"gst-settings"`, `schema: 1`.
  - `SettingsSection` gains five `#[serde(default)] Option<String>` fields, and `plan_settings_import` gains five `plan_setting` calls.
  - Older files import unchanged. Unknown future values are dropped.
  - `SettingsImportDialog` labels:

    | Key | Label | Values |
    | --- | --- | --- |
    | `accent` | 主题色 | preset names; `system` → 跟随 Windows |
    | `eink` | 墨水屏配色 | palette names |
    | `week_start` | 每周起始日 | 周一 / 周日 |
    | `start_page` | 启动时打开 | page names |
    | `reduce_motion` | 减少动画 | `system` → 跟随系统, `reduce` → 开启 |

  - The dialog must still fit and scroll at a window height of 760 px.
- **First-frame cache.**
  - `paintInitialAppearance()` runs in `main.tsx` next to `paintInitialTheme()`. It reads one validated localStorage entry, `gst.appearance`, which holds the accent id, the last resolved accent pair (`#rrggbb` only), the e-ink id and the motion value.
  - It sets `data-accent`, the inline accent variables, `data-eink` and `data-motion` before React renders.
  - SQLite stays the source of truth. The cache is rewritten after every load, save, import and Windows read.
  - Every storage access sits in try/catch.
  - Tests clear localStorage after each test (`test-setup.ts`).
- **`reloadImportedSettings`** applies all five new settings.

## J. Preview mock (`scripts/ui-preview`)

- The mocked settings object gains the five settings.
- New query params:
  - `?accent=<id>`
  - `?eink=<id>`
  - `?weekstart=sun`
  - `?startpage=<id>`. This changes only the stored value: the probe still opens on 概览 unless `?page` is given.
    - *Amended:* on the first `get_app_settings` call, before it answers, the mock clicks 概览 the way a user would, unless `?page` names a page. That counts as the user having navigated, so App's one-time switch to the stored page (§E) never fires in the preview. The stored value still shows on 设置.
  - `?motion=reduce`
  - `?restore=ok|invalid|newer|live|space|fail`
  - *Amended, also built:*
    - `?restorestatus=restored|rolled_back` sets the one-shot restore status, so the toast shows.
    - `?dialog=restore` (with `?page=settings`) picks the demo backup and opens the confirm dialog.
    - `?export=fail` also makes 打开数据文件夹 fail.
- Commands to mock:
  - `get_windows_accent`, returning the sample pair `#0067c0` / `#4cc2ff`;
  - `set_ui_preference`;
  - `open_data_folder`;
  - `pick_restore_backup` and `apply_restore`, following the `pick_settings_import` single-use pattern;
  - the one-shot restore-status command.
- Every new command must be handled; an unknown command throws in the mock.

## K. Docs

Update the following to match:

- `CHANGELOG.md` (`Unreleased`)
- `README.md`: the settings section; replace the manual restore steps with the in-app flow, but keep a manual fallback note; tick the roadmap item.
- `PRIVACY.md`: the accent registry read; the `backups\` pre-restore copies; nothing leaves the machine.
- `docs/CURRENT_STATE.md`
- `DESIGN.md`: the accent and e-ink preset tables; the glow rule; reduced motion.
- `AGENTS.md`:
  - add a v0.4.4 scope block;
  - change "restore stays manual" to the in-app restore.
- `memory.md`

Release notes, the version bump and the README screenshots are done at release time.

## L. Out of scope, noted for later

- 玻璃透明度, and a real Mica or Acrylic window. Both need a spike for performance, resizing and WebView2 transparency.
- Posters following the accent or e-ink palette.
- Making the 统计 `本周` comparison compare against the previous calendar week.

## Acceptance

- `npm run check`, which is the full gate, passes, including Rust tests and clippy.
- New unit tests cover:
  - every new enum and normaliser;
  - the accent clamp, including real Windows palettes such as yellow, teal and orange, and a near-white or near-black accent;
  - the per-palette and per-accent contrast tables;
  - the week-start Sunday cases in all five places;
  - the start-page cache and reconcile;
  - motion parity;
  - the settings import round-trip and older-file import;
  - every restore validation and startup state.
- The default look, `blue` + `aurora`, is pixel-identical to v0.4.3 in the existing token tests.
- Visual QA renders, through the preview, in both themes:
  - the 设置 page;
  - every accent on 概览 and 设置;
  - every palette on 概览 readout and calendar;
  - the restore dialogs;
  - Sunday-start calendar and heatmap.
- The rendered result is reviewed against the mock sheets.
- Restore is exercised end-to-end only on a disposable test data folder (a debug-only data-dir override or a test harness), never on the production profile.
