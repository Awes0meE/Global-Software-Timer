# Duration Format Setting Design

Date: 2026-06-06
Status: Draft

## Goal

Add a Settings page switch that lets users choose how all Chinese duration values are displayed.

The switch is off by default. When off, the app keeps the current decimal-hour format, such as `8.3小时` and `0.7小时`. When on, every duration in the app shows concrete minutes, such as `8小时35分钟`.

This is a display preference only. It must not change tracked seconds, daily summaries, runtime sessions, software marks, or historical data.

## User-Facing Behavior

The Settings page adds a third switch below the existing startup and close-window switches.

- Title: `显示分钟数`
- Description: `开启后将会显示具体分钟数，如“8小时35分钟”`
- Off status text: `已关闭`
- On status text: `已开启`
- Default: off

The preference applies globally to every duration display:

- Overview summary cards.
- Most-used and recorded/active time values.
- Software usage table.
- Today distribution panel.
- Current foreground-running panel.
- Software page focused, hidden, and discovered panels where durations are shown.
- Any future component that uses the shared duration formatter.

## Duration Formatting Rules

The default mode remains decimal hours:

- `0` seconds -> `0.0小时`
- `59` seconds -> `0.0小时`
- `42 * 60` seconds -> `0.7小时`
- `8 * 3600 + 16 * 60` seconds -> `8.3小时`

The minute-display mode uses floored whole minutes:

- Negative or invalid values are normalized to zero before formatting.
- `0` seconds -> `0分钟`
- `59` seconds -> `0分钟`
- `42 * 60` seconds -> `42分钟`
- `8 * 3600` seconds -> `8小时`
- `8 * 3600 + 35 * 60` seconds -> `8小时35分钟`

The mode does not affect percentages, dates, relative time strings such as `10分钟前`, or status labels.

## Data Model

Reuse the existing local SQLite `app_settings` table.

Add one setting key:

```text
ui.duration_format
```

Allowed values:

```text
decimal_hours
hours_minutes
```

Default behavior:

- Missing setting defaults to `decimal_hours`.
- Invalid setting values default to `decimal_hours` and are treated as not configured.

## Implementation Shape

Rust:

- Add a `DurationFormat` enum with `decimal_hours` and `hours_minutes` serde names.
- Extend `AppSettings` with `duration_format` and `duration_format_configured`.
- Read `ui.duration_format` in `app_settings_from_store`.
- Add a Tauri command to save the duration format preference.
- Keep all dashboard and software summary APIs returning raw seconds.

TypeScript:

- Add a matching `DurationFormat` type in `src/api.ts`.
- Normalize `getAppSettings()` so unknown or missing values become `decimal_hours`.
- Add a wrapper for the new save command.
- Update `formatDurationZh(totalSeconds, durationFormat)` to support both formats.
- Keep the current decimal-hour behavior as the default argument where useful for test compatibility.

React:

- Store `durationFormat` in `App.tsx` after settings load.
- Add the `显示分钟数` switch to the existing `SettingsPage`.
- Save the setting optimistically and roll back on failure.
- Show `时间显示设置保存失败` if saving fails.
- Pass the selected format to every component that renders durations.

## Error Handling

If reading settings fails, the app should:

- Keep the decimal-hour display.
- Keep existing settings error behavior.

If saving the duration format fails, the app should:

- Roll the switch and `durationFormat` state back to the previous value.
- Show `时间显示设置保存失败`.
- Leave stored seconds and summaries untouched.

## Testing

Frontend tests should cover:

- Decimal-hour mode remains the default.
- `hours_minutes` formats `8小时35分钟`, `42分钟`, `8小时`, and `0分钟`.
- The Settings page renders `显示分钟数` with off/default state.
- Toggling the switch saves `hours_minutes`.
- A save failure rolls back and shows `时间显示设置保存失败`.
- Representative overview and software-page duration values change when the preference is on.

Rust tests should cover:

- `app_settings_from_store` defaults duration format to `decimal_hours`.
- Stored `hours_minutes` is returned correctly.
- Invalid stored values fall back to `decimal_hours`.
- The save command writes `ui.duration_format`.

Verification commands:

```powershell
npm test
npm run build
. .\scripts\dev-env.ps1
cd src-tauri
cargo test
cd ..
```

## Non-Goals

- Do not change tracking logic.
- Do not change database summary calculations.
- Do not add telemetry or network upload.
- Do not add new language support.
- Do not change relative timestamps such as `10分钟前`.
- Do not add per-page or per-component duration display overrides.

## Acceptance Criteria

- The Settings page contains the new `显示分钟数` switch with the approved copy.
- The switch defaults off.
- Off mode shows all durations as decimal hours with one fractional digit.
- On mode shows all durations as hours and minutes.
- The preference persists locally through app restart.
- All app duration displays use the same selected format.
- Automated frontend and Rust checks pass.
