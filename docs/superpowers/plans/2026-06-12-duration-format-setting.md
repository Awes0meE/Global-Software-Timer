# Duration Format Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings switch that persists a global Chinese duration display preference and applies it to every duration value in the app.

**Architecture:** Keep all backend dashboard/software APIs returning raw seconds. Store only the display preference in the existing `app_settings` table, normalize unknown values to `decimal_hours`, and pass the selected `DurationFormat` through React components that render durations.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vitest, SQLite-backed app settings.

---

## File Structure

- Modify: `src/i18n.ts` - shared Chinese duration formatter.
- Modify: `src/api.ts` - `DurationFormat` type, settings normalization, save wrapper.
- Modify: `src/App.tsx` - global duration format state, Settings switch, optimistic save/rollback, prop threading.
- Modify: `src/components/SummaryCards.tsx` - format prop for overview cards.
- Modify: `src/components/AppUsageTable.tsx` - format prop for software table durations.
- Modify: `src/components/TodayMix.tsx` - format prop for distribution durations.
- Modify: `src/components/RecentActivity.tsx` - format prop for current foreground panel.
- Modify: `src/components/SoftwarePage.tsx` - receives duration format and passes to panels.
- Modify: `src/components/SoftwarePanels.tsx` - format prop for focused software durations.
- Modify: `src/__tests__/i18n.test.ts` - formatter red/green coverage.
- Modify: `src/__tests__/App.test.tsx` - settings switch and representative UI coverage.
- Modify: `src/__tests__/TodayMix.test.tsx` - format prop behavior for distribution total.
- Modify: `src-tauri/src/commands.rs` - backend enum, DTO fields, save command, tests.
- Modify: `src-tauri/src/lib.rs` - register save command.
- Modify: `CHANGELOG.md` and `memory.md` - document current release state.

---

### Task 1: Formatter, API, And Backend Setting

**Files:**
- Modify: `src/i18n.ts`
- Modify: `src/api.ts`
- Modify: `src/__tests__/i18n.test.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing formatter tests**

Add tests:

```ts
expect(formatDurationZh(8 * 3600 + 35 * 60, "hours_minutes")).toBe("8小时35分钟");
expect(formatDurationZh(42 * 60, "hours_minutes")).toBe("42分钟");
expect(formatDurationZh(8 * 3600, "hours_minutes")).toBe("8小时");
expect(formatDurationZh(59, "hours_minutes")).toBe("0分钟");
expect(formatDurationZh(Number.NaN, "hours_minutes")).toBe("0分钟");
```

Run: `npm test -- src/__tests__/i18n.test.ts`

Expected: FAIL because the formatter does not accept the mode yet.

- [ ] **Step 2: Implement formatter and API normalization**

Add:

```ts
export type DurationFormat = "decimal_hours" | "hours_minutes";
```

Make `formatDurationZh(totalSeconds, durationFormat = "decimal_hours")` keep existing decimal-hour output by default and use floored whole minutes for `hours_minutes`.

Add `duration_format` and `duration_format_configured` to `AppSettings`, normalize unknown values to `decimal_hours`, and add:

```ts
export async function setDurationFormatPreference(durationFormat: DurationFormat): Promise<void>
```

- [ ] **Step 3: Write failing Rust settings tests**

Add tests in `src-tauri/src/commands.rs` for:

- Missing `ui.duration_format` defaults to `DurationFormat::DecimalHours` and unconfigured.
- Stored `hours_minutes` returns `DurationFormat::HoursMinutes` and configured.
- Invalid values fall back to `DurationFormat::DecimalHours` and unconfigured.

Run: `. .\scripts\dev-env.ps1; Push-Location src-tauri; cargo test commands::tests::app_settings_defaults_duration_format_to_decimal_hours; Pop-Location`

Expected: FAIL because the enum/fields do not exist yet.

- [ ] **Step 4: Implement Rust enum and save command**

Add `DurationFormat` with serde `snake_case` names, read/write key `ui.duration_format`, extend `AppSettings`, add `set_duration_format_preference`, and register it in `src-tauri/src/lib.rs`.

- [ ] **Step 5: Verify task**

Run:

```powershell
npm test -- src/__tests__/i18n.test.ts
. .\scripts\dev-env.ps1
Push-Location src-tauri
cargo test commands::tests::app_settings_defaults_duration_format_to_decimal_hours
Pop-Location
```

Expected: both PASS.

---

### Task 2: Settings Switch Behavior

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing Settings tests**

Add tests that:

- Render `显示分钟数` in Settings with `已关闭` by default.
- Toggle the switch and expect `set_duration_format_preference` with `{ durationFormat: "hours_minutes" }`.
- Reject the save and expect the switch to roll back plus `时间显示设置保存失败`.

Run: `npm test -- src/__tests__/App.test.tsx`

Expected: FAIL because the switch does not exist yet.

- [ ] **Step 2: Implement Settings state and switch**

In `App.tsx`, load `settings.duration_format`, keep `durationFormat` state, add `handleDurationFormatToggle`, and render:

- Title: `显示分钟数`
- Description: `开启后将会显示具体分钟数，如“8小时35分钟”`
- Off status text: `已关闭`
- On status text: `已开启`
- Error text: `时间显示设置保存失败`

- [ ] **Step 3: Verify task**

Run: `npm test -- src/__tests__/App.test.tsx`

Expected: PASS.

---

### Task 3: Apply Preference To Duration Displays

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SummaryCards.tsx`
- Modify: `src/components/AppUsageTable.tsx`
- Modify: `src/components/TodayMix.tsx`
- Modify: `src/components/RecentActivity.tsx`
- Modify: `src/components/SoftwarePage.tsx`
- Modify: `src/components/SoftwarePanels.tsx`
- Modify: `src/__tests__/App.test.tsx`
- Modify: `src/__tests__/TodayMix.test.tsx`

- [ ] **Step 1: Write failing representative UI tests**

Add coverage that when settings return `duration_format: "hours_minutes"`:

- Overview summary shows `8小时35分钟` for a raw seconds value.
- Software page focused list shows `1小时30分钟` for focused active time.
- Today distribution total can show `2分钟` when the component receives `hours_minutes`.

Run: `npm test -- src/__tests__/App.test.tsx src/__tests__/TodayMix.test.tsx`

Expected: FAIL because components still call the formatter without the mode.

- [ ] **Step 2: Thread `durationFormat` props**

Pass the selected format from `App.tsx` into overview components and `SoftwarePage`, then into `SoftwarePanels`. Keep default formatter argument for tests that do not opt into the new mode.

- [ ] **Step 3: Verify task**

Run: `npm test -- src/__tests__/App.test.tsx src/__tests__/TodayMix.test.tsx`

Expected: PASS.

---

### Task 4: Documentation, Full Checks, Reviews, Commit

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `memory.md`

- [ ] **Step 1: Update release notes and memory**

Add an Unreleased entry for the duration display setting. Update memory so the latest local development state mentions the new 2026-06-06 duration-format spec work.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
. .\scripts\dev-env.ps1
Push-Location src-tauri
cargo test
Pop-Location
```

Expected: all PASS.

- [ ] **Step 3: Review**

Run a spec-compliance review against `docs/superpowers/specs/2026-06-06-duration-format-setting-design.md` and a code-quality review of the changed files. Fix any findings and re-run affected checks.

- [ ] **Step 4: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-06-12-duration-format-setting.md CHANGELOG.md memory.md src src-tauri
git commit -m "feat(settings): add duration display preference"
```

Expected: commit succeeds after checks and reviews pass.

---

## Self-Review Notes

- Spec coverage: The plan covers the new Settings switch, app setting key, default/invalid fallback behavior, save failure rollback, shared formatter behavior, and applying the selected format to overview and software-page duration displays.
- Non-goals preserved: Raw seconds APIs, tracking logic, summary calculations, telemetry, network upload, relative date strings, and privacy-sensitive data collection stay unchanged.
- Risk: The largest frontend risk is missing a component that renders durations; the `rg formatDurationZh src` scan must be clean except for explicitly threaded props or default-compatible tests.
