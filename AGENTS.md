# AGENTS.md

## Project

Global Software Timer is a Windows-first, local-first desktop tray application for tracking software runtime.

Read these files before implementation work:

- `docs/superpowers/specs/2026-05-28-global-software-timer-design.md`
- `docs/superpowers/plans/2026-05-28-global-software-timer-v01.md`
- `memory.md`

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
- Commit after each completed task or coherent checkpoint.

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
- Chinese time format: `8小时16分钟`, or `42分钟` below one hour.

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
- Do not collect window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, or browser history.
- Keep privacy-sensitive future features explicit and opt-in.

## Windows And Encoding

This repository may contain BOM-less UTF-8 and Chinese text.

- In PowerShell, use `Get-Content -Encoding UTF8` for Markdown, source, config, and docs.
- Use `Select-String -Encoding UTF8` when searching with PowerShell.
- Prefer `rg` for search.
- Keep new files UTF-8.

## Review Gates

For each implementation task:

1. Implement according to the plan.
2. Run the task's specified checks.
3. Self-review the diff.
4. Run a spec-compliance review.
5. Run a code-quality review.
6. Fix review findings before moving to the next task.

## Source References

The approved spec and implementation plan are the source of truth. If they conflict, stop and ask the coordinating agent rather than guessing.
