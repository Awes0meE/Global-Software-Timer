# Reliability Fixes Implementation Plan

**Goal:** Repair verified long-gap accounting, excessive heartbeat writes, summary contention, and release error handling without losing historical data or changing the approved activity definitions.

**Architecture:** Keep the existing tracker and SQLite schema semantics. Inject timestamps at tracker boundaries for deterministic tests, transact each scan/tick with nested-safe savepoints, and move identity cache maintenance to startup/writes so summaries can use a separate read connection. Preserve historical aggregates and heartbeat records until a separately validated cleanup migration exists.

**Tech Stack:** Rust, rusqlite, chrono, Tauri v2, React/TypeScript, PowerShell.

## Task 1: Tracker correctness and atomic writes

Files: `src-tauri/src/tracker.rs`, `storage.rs`, `lib.rs`, `tests/tracker_tests.rs`, `tests/storage_tests.rs`.

- [ ] Add deterministic regression tests, demonstrate failures, implement and rerun.
- [ ] Restore the 60-second maximum tick credit. Break sessions at their last reliable heartbeat for gaps over twice the five-second scan interval or backwards wall time; resume with a fresh session without charging sleep gaps.
- [ ] Split credited daily counters at local midnight. Preserve five-minute idle and software-focus semantics.
- [ ] Stop creating heartbeat events; heartbeat the session once per executable per scan, retaining PID attribution for all eligible processes.
- [ ] Make each scan/tick atomic, including restoration of tracker maps on database failure; existing transaction helpers must compose safely.
- [ ] Close sessions at their last reliable heartbeat on normal Tauri exit.
- [ ] Run Rust tests and formatting; spec review, then quality review; commit a coherent fix.

## Task 2: Read path and migration foundation

Files: `src-tauri/src/storage.rs`, `app_state.rs`, `commands.rs`, backend tests.

- [ ] Add a versioned, atomic, idempotent migration baseline with forward-version rejection and query indexes; retain old data and the legacy split-runtime fallback.
- [ ] Move identity-cache writes out of summary queries; maintain them during startup/migration and write paths.
- [ ] Query through a separate read-only connection; snapshot live status under a short tracker lock. Keep lifetime interval-union totals correct.
- [ ] Test legacy migration, repeated migration, read-only summaries, historical totals and hidden/WPS behavior.
- [ ] Run relevant checks; spec review, then quality review; commit.

## Task 3: Release and frontend polling

Files: `scripts/release-build.ps1`, PowerShell regression test, `src/App.tsx`, `src/components/SoftwarePage.tsx`, frontend tests.

- [ ] Make release commands fail immediately on nonzero npm exit codes before staging artifacts; test both failure points with fake commands.
- [ ] Suspend summary polling when the document is hidden and reload when visible; retain refresh on mutations.
- [ ] Verify frontend tests/build and script regression test; review and commit.

## Finish

- [ ] Run available full project checks; report any environment/network blockers separately from code failures.
- [ ] Reconcile README/workflow/changelog/memory/current state with actual fixes and remaining design work.
- [ ] Commit, push the repair branch, verify remote commit, and leave both worktrees clean. Preserve the supplied report and all production data.

Deferred: destructive historical-heartbeat cleanup/VACUUM, retention policy, backup/recovery UI, rewriting the accounting model, Windows event-hook collector, identity merge UI, rule editor, automatic updates, signing, and product redesign. These require separate designs or real-device validation; they are not prerequisites for these targeted fixes.
