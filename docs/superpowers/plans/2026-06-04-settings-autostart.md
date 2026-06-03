# Settings And Autostart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Settings page with startup-at-login and close-window behavior switches.

**Architecture:** Keep the current single React app shell and switch the main content between Overview and Settings. Use the existing Tauri autostart plugin from the frontend, and keep close behavior plus autostart preference persistence in Rust/SQLite.

**Tech Stack:** React, TypeScript, Vitest, Tauri v2, Rust, SQLite.

---

### Task 1: Frontend Settings Page

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/api.ts`
- Modify: `src/styles.css`
- Modify: `src/__tests__/App.test.tsx`

- [x] Write failing Vitest tests for opening Settings, default startup enable without a permission dialog, startup disable persistence, and close behavior switching.
- [x] Run `npm test` and verify the new tests fail for missing UI/API.
- [x] Add typed API wrappers for autostart and app settings.
- [x] Add the Settings content view and animated switch controls.
- [x] Sync startup at login to the default-on local preference without requesting administrator permission.
- [x] Replace the old first-close choice dialog with stored/default close behavior.
- [x] Run `npm test` and verify all frontend tests pass.

### Task 2: Rust Settings DTO

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Write a failing Rust unit test for default settings DTO behavior, including default-on startup preference.
- [x] Run `cargo test commands::tests::app_settings`.
- [x] Add `get_app_settings` returning close behavior with default `minimize_to_tray` and startup preference with default `true`.
- [x] Register the command in Tauri.
- [x] Run `cargo test`.

### Task 3: Verification And Review

**Files:**
- Review all changed files.

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `. .\scripts\dev-env.ps1; Push-Location src-tauri; cargo test; Pop-Location`.
- [x] Self-review the diff for privacy, UI state, and command coverage.
- [x] Commit the coherent checkpoint.
