# Global Software Timer v0.1 Design

Date: 2026-05-28

## 1. Product Summary

Global Software Timer v0.1 is a Windows 10/11 desktop tray application that quietly tracks how long the user runs desktop software. It is inspired by Steam's per-game playtime display, but focused on engineering, productivity, design, and office software.

The app runs in the background after startup, records local usage data, and opens a dashboard when the user clicks the tray icon. The first version prioritizes trust, low resource usage, clean default data, and a visually satisfying dark "software library" dashboard.

The Chinese product name displayed in the Chinese UI is:

> 全局软件计时器

## 2. v0.1 Scope

v0.1 will implement:

- Windows 10/11 support.
- System tray app that keeps tracking while the dashboard window is closed.
- Optional startup-at-login setting.
- Automatic detection of user-relevant desktop applications.
- Default filtering of system processes, driver processes, update helpers, sync helpers, and other noisy background processes.
- Per-application accumulated runtime.
- Today's recorded computer time.
- Today's active computer time, based on recent keyboard or mouse activity.
- Most Used application card.
- A dark Steam-like dashboard.
- Local SQLite storage.
- Event log plus summary tables for robustness.
- Application hide, unhide, rename, and later merge-friendly data model.
- Chinese and English UI readiness.
- GitHub-ready open-source project documentation, including privacy boundaries.

v0.1 will not implement:

- macOS support.
- Administrator-permission enhanced detection.
- Window-title tracking.
- Document-name tracking.
- Webpage-title tracking.
- Cloud sync.
- User accounts.
- Weekly, monthly, or yearly analytics dashboards.
- Window-level "where did I spend time" analysis.

These are future roadmap items, not first-version requirements.

## 3. Long-Term Direction

The long-term product should record both:

- Runtime: how long an application process exists.
- Active time: how long the user is actively working in or around that application.

v0.1 implements runtime tracking for applications, while the data model leaves room for future active-time and foreground-window tracking.

Later versions may add:

- macOS support with a more polished native-feeling UI.
- Optional enhanced detection that clearly explains why administrator or accessibility permissions are needed.
- Weekly, monthly, yearly, and all-time summaries.
- Application categories.
- Window-level or workspace-level time analysis, only if the user explicitly enables privacy-sensitive tracking.
- Data export and backup.
- Long-duration soak testing toward 5000+ hours of stable runtime.

## 4. Product Strategy

The product path is:

- Initial stage: open-source the core modules on GitHub, establish a developer community, and attract privacy advocates and technical enthusiasts.
- Middle stage: integrate with productivity tools such as Notion and Obsidian through import/export or plugin workflows.
- Long-term stage: launch companion mobile apps and move toward a full-device time-tracking loop.

This strategy affects technical design in three ways:

- The local tracking core must be understandable, auditable, and separable from paid product layers.
- Data export/import boundaries should stay clean so future integrations do not require rewriting the storage model.
- Privacy-sensitive capabilities must remain explicit and opt-in, because trust is central to adoption.

## 5. Monetization Direction

The intended monetization model is:

- Free core: local application runtime tracking, basic dashboard, local-only data storage, and privacy-first defaults remain free.
- One-time paid advanced features: weekly/monthly trends, scenario classification, richer analytics, and report export may be sold as a one-time upgrade around 4.99-9.99 USD to avoid subscription fatigue.
- Team/enterprise edition: small-team local server deployment with team-level summary analysis may be offered around 29-49 USD per month per team.

v0.1 will not implement payment, licensing, accounts, cloud services, or enterprise deployment. However, the architecture should avoid mixing the open-source tracker core with future paid analytics or team features.

## 6. Technology Stack

Recommended and approved stack:

- Tauri v2 for the desktop shell, system tray, and packaging.
- Rust for the background tracker, process scanner, data persistence layer, and native Windows integration.
- React with TypeScript for the dashboard UI.
- SQLite for local storage.

Rationale:

- Web UI gives strong visual design flexibility.
- Rust and Tauri keep the background app lighter than an Electron-first approach.
- The architecture can later support macOS without discarding the whole product.
- Tauri has official support for system tray and autostart workflows.

## 7. System Architecture

The app is split into five main modules.

### 7.1 Tracker

The Tracker is a Rust background engine. It periodically scans processes visible to the current user, detects application start and stop events, maintains in-memory running state, and writes durable events to SQLite.

v0.1 tracks process runtime, not foreground activity per application.

Default scan interval: about 5 seconds.

### 7.2 App Classifier

The App Classifier turns raw process data into user-facing applications.

Responsibilities:

- Convert process names and executable paths into readable app names.
- Prefer names such as "Visual Studio Code" over "Code.exe".
- Hide likely system and infrastructure processes by default.
- Hide noisy helper processes such as update helpers, background sync assistants, and installer helpers.
- Allow user-level overrides such as hide, unhide, and rename.
- Keep the data model compatible with future application merging.

The dashboard should feel like it intelligently surfaces software the user cares about, not a raw process explorer.

### 7.3 Local Store

SQLite stores all app data locally.

v0.1 uses event logging plus summary tables:

- The event log preserves what happened and supports recovery.
- Summary tables make the dashboard fast to query.

SQLite will use WAL mode for the main application database.

### 7.4 Dashboard

The dashboard is a React/TypeScript UI in a dark Steam-like style.

The first screen includes:

- Product title.
- Live tracking status.
- Most Used card.
- Today's recorded time.
- Today's active time.
- Application usage list.
- Today's usage mix.

Chinese UI copy rules:

- Product title: 全局软件计时器
- Time format: 8小时16分钟
- If below one hour: 42分钟

### 7.5 Tray And Startup

Tauri handles:

- System tray icon.
- Tray menu.
- Opening and focusing the dashboard.
- Quit action.
- Startup-at-login toggle.

v0.1 is a normal user-space app, not a Windows service.

## 8. Data Model

The implementation plan will turn the following concepts into the initial v0.1 schema.

### apps

Stores application identity and user-facing metadata.

Expected fields:

- id
- executable path
- process name
- display name
- normalized identity key
- hidden flag
- user-renamed flag
- created timestamp
- updated timestamp

### run_events

Stores durable event history.

Expected event types:

- tracker_started
- tracker_stopped
- app_seen_started
- app_seen_stopped
- app_heartbeat
- session_recovered
- scan_error
- database_error

### usage_sessions

Stores one detected application runtime session.

Expected fields:

- app id
- start timestamp
- end timestamp
- last heartbeat timestamp
- duration
- close reason
- recovery flag

### daily_app_usage

Stores fast daily per-app totals for dashboard queries.

Expected fields:

- date
- app id
- runtime seconds
- active seconds, reserved for future versions

### daily_system_usage

Stores daily machine-level totals.

Expected fields:

- date
- recorded seconds
- active seconds
- tracker uptime seconds

## 9. Robustness Strategy

Robustness is a core product requirement.

v0.1 will:

- Write a durable event when an application starts or stops.
- Periodically write heartbeats for active sessions.
- Periodically flush usage summaries.
- Recover unfinished sessions on next app startup.
- Close recovered sessions at their last heartbeat time, not at the new startup time.
- Continue scanning after a single scan error.
- Surface database write problems instead of silently losing data.
- Avoid corrupting historical data after app crashes or forced exits.

Expected v0.1 loss window:

- At most the latest scan or flush interval should be at risk after an abnormal exit.
- Historical data should remain intact.

## 10. Privacy And Security Boundaries

v0.1 is privacy-first.

It records:

- Application executable identity.
- User-facing application name.
- Application runtime.
- Daily recorded computer time.
- Daily active computer time.

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
- Require an account.
- Request administrator permission by default.
- Run as a Windows service.

Future privacy-sensitive features must be opt-in and clearly explained before enabling.

## 11. UI Direction

The approved visual direction is:

- Dark.
- Steam-like.
- Software library feel.
- Cool and satisfying, without directly copying Steam.
- Dashboard-first, not a marketing landing page.
- Data will feel like personal progress and accumulated craft hours.

v0.1 dashboard layout:

- Header with live status.
- Three primary cards: Most Used, Today Recorded, Today Active.
- Main app list table.
- Side panel for today's distribution.
- Minimal settings for startup, hidden apps, and naming.

## 12. Error Handling

Tracker errors:

- A failed process scan records an error event and retries on the next interval.
- A failed individual process read does not fail the whole scan.

Database errors:

- A failed write records or surfaces an error where possible.
- The UI shows a lightweight warning if tracking cannot persist data.

Recovery:

- On startup, the tracker checks unfinished sessions.
- Recovered sessions are marked explicitly.
- Session duration is calculated using the last reliable heartbeat timestamp.

Permission limits:

- If a process cannot be read under normal user permissions, v0.1 ignores it or records limited information.
- v0.1 does not prompt for UAC.

## 13. Open Source Requirements

The project will be GitHub-ready from the beginning.

Required documentation:

- README with product description and screenshots or mockups.
- Privacy statement explaining exactly what v0.1 records and does not record.
- LICENSE.
- Basic contribution notes.
- Build and run instructions.
- Windows packaging notes.
- A short note explaining which parts are intended to remain open-source core modules.

CI for the first public MVP will include:

- TypeScript checks.
- Rust checks.
- Formatting checks.
- Unit tests.
- Basic build validation.

## 14. v0.1 Acceptance Criteria

Functional:

- App starts on Windows 10/11.
- Tray icon appears.
- Tray click opens the dashboard.
- Startup-at-login can be enabled or disabled.
- Common apps such as VS Code, Word, browsers, and CAD tools can be detected.
- Dashboard displays accumulated app runtime.
- Dashboard displays Most Used.
- Dashboard displays today's recorded time.
- Dashboard displays today's active time.
- Dashboard filters obvious system and background noise by default.

Reliability:

- App can run for several hours without crashing during initial validation.
- App restart preserves historical data.
- Abnormal app exit does not destroy historical data.
- Unfinished sessions can be recovered.
- Single scan failures do not terminate the app.

Privacy:

- No network sync or telemetry.
- No window title collection.
- No document name collection.
- No webpage title collection.
- No administrator permission by default.

Performance:

- Default scan interval is about 5 seconds.
- Background CPU usage remains low during normal tracking.
- Dashboard rendering does not keep heavy work running when hidden.
- The app is acceptable on lower-spec Windows machines.

## 15. Out Of Scope For v0.1

- macOS implementation.
- Advanced charts.
- Weekly, monthly, yearly analytics.
- Window-level time tracking.
- Foreground-app active-time attribution.
- Cloud sync.
- Accounts.
- Plugin system.
- Enterprise deployment.
- Automatic public release pipeline.
- Payment or license activation.
- Notion, Obsidian, or other productivity-tool integrations.
- Mobile companion apps.

## 16. Approved Decisions

- Long-term design records both runtime and active usage; v0.1 implements runtime and reserves active-time fields.
- Windows 10/11 comes first.
- v0.1 is a tray app.
- Technology stack is Tauri v2, Rust, React/TypeScript, and SQLite.
- UI style is Steam-like dark library.
- Default app detection is smart and user-adjustable.
- Privacy model is opt-in for sensitive future features; v0.1 collects only app-level information.
- Data model uses event log plus summaries from the first version.
- v0.1 runs under normal user permissions.
- Later versions may add optional enhanced detection.
- "Today computer usage" includes both recorded time and active time.
- Project is GitHub-ready from the beginning.
- Product strategy starts with an open-source core, then adds productivity-tool integrations and eventually mobile companion apps.
- Monetization direction is free core plus one-time paid advanced analytics, with a future local-deployment team edition.
