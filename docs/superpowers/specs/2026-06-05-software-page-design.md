# Software Page v0.1.3 Design

Date: 2026-06-05
Status: Shipped in `v0.1.3`

## Goal

Add the first real `软件` page for Global Software Timer v0.1.3.

The page gives users a focused place to manage software they care about, hide always-on background tools from default summaries, and browse software GST has already discovered. This is a core product feature, so the implementation should prefer robust data modeling over saving a small amount of local database space.

## Scope

v0.1.3 includes:

- Enable the left navigation item `软件`.
- Add a `软件` page inside the existing app shell.
- Add a `特别关注` list.
- Add a `隐藏软件列表`.
- Add a read-only `已发现软件` directory.
- Add shared add dialogs for both managed lists.
- Add local search with English, Chinese, pinyin full spelling, and pinyin initials.
- Add per-software focused active time for the software page.
- Keep hidden software fully recorded in local storage while filtering it from default user-facing summaries.

v0.1.3 does not include:

- Manual `.exe` selection.
- A details drawer.
- Excel-style column sorting.
- User-configurable active-time logic in Settings.
- Window title, document name, webpage title, file content, browser history, keystroke, or mouse-coordinate collection.
- Telemetry, upload, accounts, sync, or administrator permission.

`GST` is an accepted shorthand for Global Software Timer in project discussions and docs.

## Product Decisions

### Page Layout

The `软件` page uses a dense tool layout, not a marketing or explanation page.

The page has no top explanatory paragraph. It directly shows:

- Left top: `特别关注`.
- Left bottom: `隐藏软件列表`.
- Right full-height column: `已发现软件`.

All three lists have their own scrollbars. The list containers and headers stay fixed while their list bodies scroll.

### 特别关注

`特别关注` is for software the user wants to watch closely.

Rows show:

- Software icon.
- Software name.
- `今日前台`.
- `今日后台`.
- `今日活跃`.
- `共计前台`.
- `共计后台`.
- `共计活跃`.
- `上次打开`.

The list is sorted by add time descending. Latest added software appears first.

If the list is empty, show:

- `还没有特别关注的软件`
- `添加你最想长期观察的软件，查看运行时长、活跃时长和最近打开时间。`

### 活跃时长 Help

Only the `今日活跃` column header has a small subtle circular `?` icon.

Clicking the icon opens a small popover explaining:

- `运行时长` means the time GST records the software as running.
- `活跃时长` means the time the software window has Windows foreground focus.

`共计活跃` does not get a second `?` icon.

The popover closes when the user clicks the icon again, clicks outside, or presses `Esc`.

### 隐藏软件列表

`隐藏软件列表` replaces the earlier working name `计时白名单`, because "white list" can imply the opposite of the intended behavior.

Hidden software:

- Still records runtime.
- Still records v0.1.3 software-page focused active time.
- Still appears in the `已发现软件` directory.
- Does not appear in default user-facing summaries.
- Does not participate in Most Used, rankings, distribution charts, or future default summary pages.

Rows show the software icon, name, and the short status:

`概览隐藏 · 不参与排行 · 仍正常记录`

The list is sorted by add time descending. Latest added software appears first.

If the list is empty, show:

- `还没有隐藏的软件`
- `把常驻后台但不想出现在概览里的软件放到这里。`

### 已发现软件

`已发现软件` is a read-only directory of user-facing software GST has discovered at least once.

It shows:

- Icon.
- Software name.
- Mark:
  - Orange-yellow `特别关注`.
  - Subtle `已隐藏`.
  - Empty if neither applies.
- `上次打开`.

It includes hidden software, marked with `已隐藏`.

It does not include:

- Default-filtered system processes.
- Browser/Electron helper child processes.
- Updaters, installers, services, daemons, or toolchain noise.
- GST itself.
- Software that has never been detected by GST.

The empty state is:

- `还没有发现软件`
- `打开软件并保持 GST 运行一会儿后，这里会自动出现。`

Empty search results show an empty list with no additional empty-state copy.

## Interaction Design

### Add Buttons

`特别关注` and `隐藏软件列表` each have an `添加` button.

Both buttons open the same add-dialog component:

- From `特别关注`: title `添加特别关注`.
- From `隐藏软件列表`: title `添加隐藏软件`.

The dialog data source is the discovered software directory. v0.1.3 does not offer manual `.exe` selection.

When the dialog opens, its search box receives focus automatically.

The dialog supports multi-select:

- Clicking a row toggles selection.
- Selected rows use a darker background.
- No checkbox is required.
- No search result is selected by default.

Footer behavior:

- No selection: primary button is disabled and says `添加`.
- One selected item: primary button says `添加 1 个`.
- N selected items: primary button says `添加 N 个`.

After a successful add:

- The dialog closes.
- The target list updates immediately.
- The discovered-software mark updates immediately.
- If software was added to hidden, default summary filtering applies immediately.

If add fails, the dialog remains open and shows the error or conflict prompt.

### Mutual Exclusion

The same software identity cannot be both focused and hidden.

The app does not silently move software between lists. The user must remove it first.

If a user tries to add hidden software to `特别关注`, show:

`该软件已加入隐藏列表哦！请先移出再尝试`

If a user tries to add focused software to `隐藏软件列表`, show:

`该软件已加入特别关注哦！请先移出再尝试`

The add dialog still shows mutually exclusive software, with its mark, but it is not selectable.

The backend must enforce this rule even if the frontend has a bug.

If corrupted or migrated data creates a conflict, hidden wins as the defensive fallback:

- The software is treated as hidden.
- It is filtered from default summaries.
- It is not shown in `特别关注`.
- It is shown in `已发现软件` with `已隐藏`.

### Edit Mode

Each managed list has independent edit mode.

If a managed list has rows, show a no-background text button `编辑` immediately to the left of `添加`.

If a managed list is empty, hide `编辑` and show only `添加`.

Clicking `编辑`:

- Changes the text to `完成`.
- Adds a no-background `×` control to the far left of each row.
- Pushes only the list body content to the right.
- Keeps the panel box and header fixed.
- Uses a short bezier ease-in/ease-out animation, for example `260ms cubic-bezier(.2,.8,.2,1)`.

Clicking `×`:

- Removes the software from that list immediately.
- Does not ask for confirmation.
- Does not delete historical usage data.
- Immediately updates marks in `已发现软件`.
- If removing from hidden, immediately restores the software to default summaries.

Clicking `完成`:

- Hides all `×` controls.
- Moves the list body back left with the same animation.

If the user clicks `添加` while that list is in edit mode, the app first exits edit mode for that list and then opens the add dialog.

## Search Design

Search applies to:

- The add dialog.
- The right-side `已发现软件` directory.

Both use the same local search engine.

The right-side `已发现软件` search box does not auto-focus on page entry.

Search behavior:

- Runs locally and instantly as the user types.
- Is case-insensitive.
- Supports Chinese display names.
- Supports pinyin full spelling.
- Supports pinyin initials.
- Supports built-in aliases for common software.
- Shows English and Chinese original-text highlights.
- Does not force highlight mapping for pinyin matches.
- Empty search sorts by last opened time descending.
- Non-empty search sorts by relevance, then last opened time descending.

Ranking priority:

1. Exact match.
2. Display name starts with query.
3. Alias or pinyin key starts with query.
4. Display name contains query.
5. Alias or pinyin key contains query.
6. Weak fuzzy match.
7. Last opened time descending as tie-breaker.

Examples:

- Query `c`: `Chrome` ranks high, and `Visual Studio Code` can also appear because it contains `c`.
- Query `ch`: `Chrome` and `WeChat` rank above `Visual Studio Code`.
- Query `微`: `微信` matches and highlights `微`.
- Query `wx`: `微信` matches through pinyin initials, without forced Chinese-character highlighting.
- Query `weixin`: `微信` matches through pinyin full spelling.

### Pinyin Dependency

Use a bundled, offline frontend dependency for pinyin conversion. The dependency must not perform network calls.

Current recommended candidate: [`pinyin-pro`](https://www.npmjs.com/package/pinyin-pro), installed from npm and bundled with the frontend. The npm package currently has built-in TypeScript declarations and zero runtime dependencies according to npm metadata checked during design research.

The implementation must not use CDN script loading.

Each software search index should include:

- Original display name.
- Lowercase display name.
- Pinyin full spelling for Chinese text.
- Pinyin initials for Chinese text.
- Built-in aliases.

New Chinese software names discovered by GST should automatically receive generated pinyin search keys.

## Time And Date Formatting

All duration values use the existing project-wide Chinese decimal-hour format with one fractional digit:

- `8.3小时`
- `0.7小时`
- `0.0小时`

This applies to:

- `今日前台`.
- `今日后台`.
- `今日活跃`.
- `共计前台`.
- `共计后台`.
- `共计活跃`.

`上次打开` uses:

- Within 1 hour: `10分钟前`.
- Today: `今天 13:42`.
- Yesterday: `昨天 21:18`.
- Two days ago: `前天 15:09`.
- Earlier than the day before yesterday but within 14 days: `这周二` or `上周三`.
- More than 14 days ago: `2026-06-01`.

The `这周二` / `上周三` and older date formats do not include time in v0.1.3.

`上次打开` means the latest session start time: the most recent time GST recognized that software identity as starting to run.

## Runtime And Active-Time Semantics

### Existing Runtime Status

The visible status labels keep the current GST semantics:

- `前台运行`
- `后台运行`
- `未运行`

These labels are current runtime status indicators. They are not historical foreground/background duration buckets.

### Software-Page Active Time

v0.1.3 adds a software-page active-time metric with this definition:

`活跃时长` = the time a software identity has the Windows foreground focused window.

Keyboard/mouse idle state does not matter for v0.1.3 software-page active time.

Reason: Some software, such as simulation, rendering, analysis, training, or build tools, may legitimately need to stay focused while the user waits.

This new active-time metric applies only to the `软件` page in v0.1.3.

The existing `概览` page `今日活跃` card keeps its current machine-level keyboard/mouse-active semantics. The current overview distribution behavior also stays unchanged in v0.1.3, except that hidden software is filtered from default summaries.

Future Settings work may add a switch:

- On: foreground focus counts only when keyboard/mouse activity is recent.
- Off: foreground focus counts whenever the window is focused.

That setting is out of scope for v0.1.3.

### Historical Data

Old releases did not store per-software focused active time. Therefore:

- `共计活跃` starts accumulating from v0.1.3.
- Old sessions are not backfilled.
- Existing runtime totals remain intact.

## Data Model

Use an explicit software identity layer because the user manages merged software, not raw executables.

### Software Identity

A software identity represents what the user sees as one software row.

Examples:

- `WPS Office` represents `wps.exe`, `et.exe`, `wpp.exe`, and `wpspdf.exe`.
- Normal single-executable apps map to one identity.

The identity key must be stable enough for user rules:

- Known merged apps should use explicit keys such as `known:wps-office`.
- Regular single-app identities should inherit the existing normalized app identity, for example `app:<normalized_key>`, so two unrelated apps with the same display name do not collide.
- Display-name grouping should be used only when the classifier intentionally defines a merged user-facing identity.
- User renaming, if expanded later, must not change the identity key.

### Recommended Tables

Add a cached identity layer for robustness:

```sql
CREATE TABLE software_identities (
  identity_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  process_name TEXT NOT NULL,
  representative_executable_path TEXT NOT NULL,
  last_opened_at TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```sql
CREATE TABLE software_identity_members (
  identity_key TEXT NOT NULL,
  app_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (identity_key, app_id),
  FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key),
  FOREIGN KEY(app_id) REFERENCES apps(id)
);
```

```sql
CREATE TABLE focused_software_identities (
  identity_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
);
```

```sql
CREATE TABLE hidden_software_identities (
  identity_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
);
```

For software-page focused active time:

```sql
CREATE TABLE daily_software_focus_usage (
  usage_date TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  focused_seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, identity_key),
  FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
);
```

This table is separate from existing overview active-time storage so v0.1.3 does not accidentally change overview semantics.

### Data Updates

During scans and dashboard/software queries, GST should keep the identity cache current:

- Upsert identities for tracked software.
- Upsert identity membership rows.
- Update `last_seen_at`.
- Update `last_opened_at` when a new session starts.
- Keep representative executable path aligned with existing best-path/icon logic.

For merged identities, aggregate:

- Runtime intervals across all member app IDs for legacy foreground-runtime fallback.
- Software-page foreground/background runtime seconds by identity key.
- Last opened as the maximum session start across all members.
- Runtime status as the highest current status across members, using the existing foreground > background > closed rank.
- Focused active seconds by identity key.

## Backend Commands

Add Tauri commands:

- `get_software_page_summary`
- `add_focused_software_identities(identity_keys: Vec<String>)`
- `remove_focused_software_identity(identity_key: String)`
- `add_hidden_software_identities(identity_keys: Vec<String>)`
- `remove_hidden_software_identity(identity_key: String)`

`get_software_page_summary` returns:

- Focused list rows.
- Hidden list rows.
- Discovered software rows.

Each row should include:

- `identity_key`.
- `display_name`.
- `process_name`.
- `icon_data_url`.
- `status`.
- `today_runtime_seconds`.
- `today_foreground_seconds`.
- `today_background_seconds`.
- `today_focused_seconds`.
- `total_runtime_seconds`.
- `total_foreground_seconds`.
- `total_background_seconds`.
- `total_focused_seconds`.
- `last_opened_at`.
- `mark`: `focused`, `hidden`, or `none`.

For rows where a metric does not apply, frontend can ignore the extra fields.

Backend conflict errors should be structured enough for frontend to show the exact mutual-exclusion copy.

Add/remove commands should perform mutual-exclusion checks and writes in a transaction, preferably `BEGIN IMMEDIATE`, so two near-simultaneous requests cannot put the same identity in both managed lists.

## Dashboard Filtering

The existing `get_dashboard_summary` path must filter hidden software identities.

Filtering applies to:

- `most_used`.
- Main app usage list.
- Today's distribution.
- Any future default summary queries.

Filtering does not apply to:

- Raw SQLite sessions.
- Run events.
- The `已发现软件` directory.

Adding or removing hidden software must be reflected immediately when dashboard data is reloaded. The frontend should trigger a dashboard/software summary refresh after hidden-list changes instead of waiting only for the periodic refresh.

## Frontend Structure

Suggested components:

- `SoftwarePage`
- `FocusedAppsPanel`
- `HiddenAppsPanel`
- `DiscoveredAppsPanel`
- `AddSoftwareDialog`
- `SoftwareSearchInput`
- `ActiveTimeHelpPopover`
- `SoftwareMark`

Suggested pure helpers:

- `formatDurationZhDecimalHours(seconds)`
- `formatLastOpenedAt(value, now)`
- `buildSoftwareSearchIndex(row)`
- `rankSoftwareSearchResult(row, query)`
- `highlightDisplayName(displayName, query)`
- `isSelectableForTarget(row, target)`

Keep search ranking and date formatting testable as pure TypeScript functions.

## Privacy And Security

v0.1.3 continues the existing privacy boundary.

It records:

- Software identity.
- Executable identity already used by GST.
- Runtime sessions.
- Focused-window active seconds by software identity.
- Local list membership and timestamps.

It does not record:

- Window titles.
- Document names.
- Webpage titles.
- Keystrokes.
- Mouse coordinates.
- File contents.
- Browser history.
- Cloud data.

It does not:

- Upload data.
- Add telemetry.
- Require an account.
- Request administrator permission.
- Use network lookup for pinyin or software names.

The pinyin search dependency must be bundled locally and used offline.

## Acceptance Criteria

Functional:

- `软件` navigation item is clickable.
- `软件` page appears inside the existing app shell.
- Page layout has left stacked managed lists and right full-height discovered list.
- All three lists scroll independently.
- `特别关注` can add multiple discovered software identities.
- `隐藏软件列表` can add multiple discovered software identities.
- Add dialogs auto-focus their search input.
- Add dialogs support multi-select with dark selected-row backgrounds.
- Primary add button is disabled with `添加` when nothing is selected.
- Primary add button shows `添加 N 个` when N rows are selected.
- Add success closes the dialog and updates the page immediately.
- Add failure keeps the dialog open and shows the relevant prompt.
- Managed lists can enter independent edit mode.
- Edit mode shows no-background `×` controls and `完成`.
- Removing a row is immediate and does not delete history.
- Empty managed lists hide `编辑`.
- Clicking `添加` while editing exits edit mode first.
- Right-side discovered list shows focused and hidden marks.
- Hidden software remains visible in discovered list with `已隐藏`.
- Focused software appears with orange-yellow `特别关注`.
- Hidden software is filtered from overview summaries immediately.
- Removing hidden software restores it to overview summaries immediately.
- Search supports English, Chinese, pinyin full spelling, and pinyin initials.
- Search highlights English and Chinese original-text matches.
- Search does not force pinyin-to-Chinese highlight mapping.
- Empty search results show no extra message.
- Time formats match the approved one-decimal-hour style.
- `上次打开` uses the approved relative/date format.

Reliability:

- Backend enforces mutual exclusion.
- If focused and hidden conflict exists in storage, hidden wins.
- WPS-style merged identities behave as one user-visible software identity.
- Existing runtime sessions remain readable after migration.
- Old data is not deleted or backfilled incorrectly.
- Overview active-time semantics stay unchanged.

Privacy:

- No telemetry.
- No network upload.
- No admin permission.
- No window-title, document-name, webpage-title, file-content, browser-history, keystroke, or mouse-coordinate collection.
- Pinyin search is fully local.

Checks:

- `npm test` passes.
- `npm run build` passes.
- `cargo test` passes after loading `. .\scripts\dev-env.ps1` in PowerShell.

## Test Plan

Rust tests:

- Migration creates identity, membership, focused, hidden, and daily focus usage tables.
- Identity grouping maps WPS components to one identity.
- Focused and hidden list rows sort by `created_at DESC`.
- Backend rejects adding hidden identities to focused.
- Backend rejects adding focused identities to hidden.
- Conflict read fallback treats hidden as winning.
- Hidden identities are excluded from dashboard summary.
- Removing hidden restores dashboard summary.
- `last_opened_at` uses latest session start.
- `daily_software_focus_usage` increments for the Windows foreground identity without keyboard/mouse activity gating.
- Existing overview daily system active semantics remain unchanged.

Frontend tests:

- Software nav renders as enabled.
- Software page renders three panels.
- Empty states render approved Chinese copy.
- Add dialog titles change by target.
- Add dialog supports multi-select and button text rules.
- Mutually exclusive rows show marks and are not selectable.
- Conflict prompts show exact approved copy.
- Edit mode changes `编辑` to `完成`, shows `×`, and removes rows without confirmation.
- Search ranking handles `c`, `ch`, Chinese characters, pinyin full spelling, and pinyin initials.
- Search highlighter highlights visible English/Chinese matches only.
- `formatLastOpenedAt` covers minutes, today, yesterday, day before yesterday, this week, last week, and older dates.

Manual verification:

- Add a common app to `特别关注`.
- Add BitDock-like always-on software to `隐藏软件列表`.
- Confirm hidden software leaves overview immediately.
- Confirm hidden software still appears in `已发现软件` with `已隐藏`.
- Confirm removing hidden restores overview immediately.
- Confirm the software page does not expose executable paths, command lines, or window titles.
