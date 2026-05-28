# Global Software Timer v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first Tauri v2 tray application that records local application runtime, stores robust SQLite event/session data, and displays a Steam-like Chinese/English dashboard.

**Architecture:** The app uses a Rust core for process scanning, classification, tracking, SQLite persistence, recovery, tray commands, and autostart integration. React/TypeScript renders the dashboard and calls Tauri commands for data and settings. The tracker core is separable from future paid analytics and team features.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vite, SQLite via `rusqlite`, `sysinfo` for process snapshots, `windows-sys` for Windows idle-time detection, Vitest, Rust unit tests, GitHub Actions.

---

## File Structure

Create or modify these files during implementation:

- Create: `package.json` - frontend scripts, dependencies, and Tauri commands.
- Create: `index.html` - Vite entry HTML.
- Create: `vite.config.ts` - React/Vitest config.
- Create: `tsconfig.json` - TypeScript settings.
- Create: `src/main.tsx` - React entry point.
- Create: `src/App.tsx` - dashboard shell.
- Create: `src/styles.css` - Steam-like dark dashboard styles.
- Create: `src/i18n.ts` - English and Chinese UI copy and time formatting.
- Create: `src/api.ts` - typed wrappers around Tauri commands.
- Create: `src/components/SummaryCards.tsx` - Most Used, Today Recorded, Today Active cards.
- Create: `src/components/AppUsageTable.tsx` - app usage list.
- Create: `src/components/TodayMix.tsx` - today usage distribution.
- Create: `src/__tests__/i18n.test.ts` - time-format tests.
- Create: `src/__tests__/App.test.tsx` - dashboard rendering tests.
- Create: `src-tauri/Cargo.toml` - Rust crate and dependencies.
- Create: `src-tauri/build.rs` - Tauri build hook.
- Create: `src-tauri/tauri.conf.json` - app identity, windows, bundle settings.
- Create: `src-tauri/capabilities/default.json` - Tauri v2 permissions.
- Create: `src-tauri/src/main.rs` - native entry point.
- Create: `src-tauri/src/lib.rs` - Tauri app setup and command registration.
- Create: `src-tauri/src/domain.rs` - shared Rust domain types.
- Create: `src-tauri/src/storage.rs` - SQLite schema, migrations, repositories, summaries.
- Create: `src-tauri/src/classifier.rs` - app naming and filtering.
- Create: `src-tauri/src/process_source.rs` - process snapshot abstraction and `sysinfo` implementation.
- Create: `src-tauri/src/activity.rs` - active/idle detector abstraction and Windows implementation.
- Create: `src-tauri/src/tracker.rs` - tracking engine, sessions, heartbeats, recovery.
- Create: `src-tauri/src/commands.rs` - Tauri commands for dashboard/settings.
- Create: `src-tauri/src/tray.rs` - tray menu and dashboard focus behavior.
- Create: `src-tauri/src/app_state.rs` - shared app state, tracker handle, database path.
- Create: `src-tauri/tests/storage_tests.rs` - SQLite migration/session tests.
- Create: `src-tauri/tests/classifier_tests.rs` - filtering/naming tests.
- Create: `src-tauri/tests/tracker_tests.rs` - fake process-source tracker tests.
- Create: `README.md` - product overview and local development.
- Create: `PRIVACY.md` - privacy boundaries.
- Create: `CONTRIBUTING.md` - contribution notes.
- Create: `LICENSE` - open-source license.
- Create: `.github/workflows/ci.yml` - Rust/TypeScript checks.

---

## Task 1: Bootstrap The Tauri React Project

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the frontend package manifest**

Create `package.json`:

```json
{
  "name": "global-software-timer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-autostart": "^2.0.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create Vite and TypeScript config**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>全局软件计时器</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
```

Create `src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create a minimal React shell**

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">本地软件使用时长库</p>
      <h1>全局软件计时器</h1>
      <p className="subtitle">正在准备 v0.1 仪表盘。</p>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  color: #f6f2ea;
  background: #121417;
  font-family:
    "Microsoft YaHei UI",
    "PingFang SC",
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 960px;
  min-height: 100vh;
  background: #121417;
}

.app-shell {
  min-height: 100vh;
  padding: 28px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #aeb5c0;
  font-size: 13px;
}

h1 {
  margin: 0;
  font-size: 30px;
  letter-spacing: 0;
}

.subtitle {
  color: #aeb5c0;
}
```

- [ ] **Step 4: Create the Rust/Tauri scaffold**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "global-software-timer"
version = "0.1.0"
description = "A local-first software runtime tracker."
authors = ["Global Software Timer Contributors"]
edition = "2021"

[lib]
name = "global_software_timer_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
chrono = { version = "0.4", features = ["clock", "serde"] }
rusqlite = { version = "0.32", features = ["bundled", "chrono"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.32"
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-autostart = "2"
thiserror = "2"
uuid = { version = "1", features = ["v4", "serde"] }
windows-sys = { version = "0.59", features = [
  "Win32_System_SystemInformation",
  "Win32_UI_Input_KeyboardAndMouse"
] }

[dev-dependencies]
tempfile = "3"
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

Create `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    global_software_timer_lib::run();
}
```

Create `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
```

- [ ] **Step 5: Create Tauri config and permissions**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Global Software Timer",
  "version": "0.1.0",
  "identifier": "com.globalsoftwaretimer.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "全局软件计时器",
        "width": 1180,
        "height": 760,
        "minWidth": 960,
        "minHeight": 620,
        "visible": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ]
  }
}
```

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default desktop permissions for Global Software Timer",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
  ]
}
```

- [ ] **Step 6: Install dependencies and run baseline checks**

Run:

```powershell
npm install
npm run build
cd src-tauri
cargo test
cd ..
```

Expected:

- `npm install` succeeds.
- `npm run build` succeeds.
- `cargo test` succeeds with zero or minimal generated tests.

- [ ] **Step 7: Commit bootstrap**

Run:

```powershell
git add package.json package-lock.json index.html vite.config.ts tsconfig.json src src-tauri
git commit -m "chore: bootstrap tauri react app"
```

Expected: commit succeeds.

---

## Task 2: Add Rust Domain Types And SQLite Storage

**Files:**
- Create: `src-tauri/src/domain.rs`
- Create: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/tests/storage_tests.rs`

- [ ] **Step 1: Write failing storage migration test**

Create `src-tauri/tests/storage_tests.rs`:

```rust
use global_software_timer_lib::storage::Store;
use tempfile::NamedTempFile;

#[test]
fn migrate_creates_expected_tables_and_wal_mode() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let tables = store.table_names().expect("table names");
    assert!(tables.contains(&"apps".to_string()));
    assert!(tables.contains(&"run_events".to_string()));
    assert!(tables.contains(&"usage_sessions".to_string()));
    assert!(tables.contains(&"daily_app_usage".to_string()));
    assert!(tables.contains(&"daily_system_usage".to_string()));
    assert_eq!(store.journal_mode().expect("journal mode"), "wal");
}

#[test]
fn app_upsert_keeps_user_facing_identity() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let app = store
        .upsert_app(
            "code.exe",
            "C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
            "Visual Studio Code",
        )
        .expect("upsert app");

    assert_eq!(app.process_name, "code.exe");
    assert_eq!(app.display_name, "Visual Studio Code");
    assert!(!app.is_hidden);

    let again = store
        .upsert_app(
            "CODE.EXE",
            "C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
            "VS Code",
        )
        .expect("upsert same app");

    assert_eq!(app.id, again.id);
    assert_eq!(again.display_name, "Visual Studio Code");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd src-tauri
cargo test --test storage_tests
cd ..
```

Expected: FAIL because `domain` and `storage` modules do not exist.

- [ ] **Step 3: Add domain types**

Create `src-tauri/src/domain.rs`:

```rust
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppIdentity {
    pub id: i64,
    pub process_name: String,
    pub executable_path: String,
    pub display_name: String,
    pub normalized_key: String,
    pub is_hidden: bool,
    pub is_user_renamed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunEventKind {
    TrackerStarted,
    TrackerStopped,
    AppSeenStarted,
    AppSeenStopped,
    AppHeartbeat,
    SessionRecovered,
    ScanError,
    DatabaseError,
}

impl RunEventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TrackerStarted => "tracker_started",
            Self::TrackerStopped => "tracker_stopped",
            Self::AppSeenStarted => "app_seen_started",
            Self::AppSeenStopped => "app_seen_stopped",
            Self::AppHeartbeat => "app_heartbeat",
            Self::SessionRecovered => "session_recovered",
            Self::ScanError => "scan_error",
            Self::DatabaseError => "database_error",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageSession {
    pub id: i64,
    pub app_id: i64,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub last_heartbeat_at: DateTime<Utc>,
    pub duration_seconds: i64,
    pub close_reason: Option<String>,
    pub recovered: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyAppUsage {
    pub date: NaiveDate,
    pub app_id: i64,
    pub runtime_seconds: i64,
    pub active_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailySystemUsage {
    pub date: NaiveDate,
    pub recorded_seconds: i64,
    pub active_seconds: i64,
    pub tracker_uptime_seconds: i64,
}
```

- [ ] **Step 4: Add SQLite store**

Create `src-tauri/src/storage.rs`:

```rust
use crate::domain::AppIdentity;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub type StoreResult<T> = Result<T, StoreError>;

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> StoreResult<Self> {
        let conn = Connection::open(path)?;
        Ok(Self { conn })
    }

    pub fn migrate(&self) -> StoreResult<()> {
        self.conn.pragma_update(None, "journal_mode", "WAL")?;
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                process_name TEXT NOT NULL,
                executable_path TEXT NOT NULL,
                display_name TEXT NOT NULL,
                normalized_key TEXT NOT NULL UNIQUE,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                is_user_renamed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS run_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER,
                event_kind TEXT NOT NULL,
                payload_json TEXT,
                occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS usage_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                last_heartbeat_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                close_reason TEXT,
                recovered INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS daily_app_usage (
                usage_date TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                runtime_seconds INTEGER NOT NULL DEFAULT 0,
                active_seconds INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (usage_date, app_id),
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS daily_system_usage (
                usage_date TEXT PRIMARY KEY,
                recorded_seconds INTEGER NOT NULL DEFAULT 0,
                active_seconds INTEGER NOT NULL DEFAULT 0,
                tracker_uptime_seconds INTEGER NOT NULL DEFAULT 0
            );
            "#,
        )?;
        Ok(())
    }

    pub fn table_names(&self) -> StoreResult<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::from)
    }

    pub fn journal_mode(&self) -> StoreResult<String> {
        self.conn
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
            .map(|mode| mode.to_lowercase())
            .map_err(StoreError::from)
    }

    pub fn upsert_app(
        &self,
        process_name: &str,
        executable_path: &str,
        display_name: &str,
    ) -> StoreResult<AppIdentity> {
        let normalized_key = normalize_identity_key(executable_path, process_name);
        let existing = self.find_app_by_key(&normalized_key)?;

        if existing.is_none() {
            self.conn.execute(
                "INSERT INTO apps (process_name, executable_path, display_name, normalized_key)
                 VALUES (?1, ?2, ?3, ?4)",
                params![process_name.to_lowercase(), executable_path, display_name, normalized_key],
            )?;
        }

        self.find_app_by_key(&normalize_identity_key(executable_path, process_name))?
            .ok_or(rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn find_app_by_key(&self, normalized_key: &str) -> StoreResult<Option<AppIdentity>> {
        self.conn
            .query_row(
                "SELECT id, process_name, executable_path, display_name, normalized_key, is_hidden, is_user_renamed
                 FROM apps WHERE normalized_key = ?1",
                params![normalized_key],
                |row| {
                    Ok(AppIdentity {
                        id: row.get(0)?,
                        process_name: row.get(1)?,
                        executable_path: row.get(2)?,
                        display_name: row.get(3)?,
                        normalized_key: row.get(4)?,
                        is_hidden: row.get::<_, i64>(5)? != 0,
                        is_user_renamed: row.get::<_, i64>(6)? != 0,
                    })
                },
            )
            .optional()
            .map_err(StoreError::from)
    }
}

pub fn normalize_identity_key(executable_path: &str, process_name: &str) -> String {
    let path = executable_path.trim().replace('/', "\\").to_lowercase();
    if path.is_empty() {
        process_name.trim().to_lowercase()
    } else {
        path
    }
}
```

- [ ] **Step 5: Export modules**

Modify `src-tauri/src/lib.rs`:

```rust
pub mod domain;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
```

- [ ] **Step 6: Run storage tests**

Run:

```powershell
cd src-tauri
cargo test --test storage_tests
cd ..
```

Expected: PASS.

- [ ] **Step 7: Commit storage foundation**

Run:

```powershell
git add src-tauri/src/domain.rs src-tauri/src/storage.rs src-tauri/src/lib.rs src-tauri/tests/storage_tests.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: add local sqlite storage foundation"
```

Expected: commit succeeds.

---

## Task 3: Add Application Classification And Filtering

**Files:**
- Create: `src-tauri/src/classifier.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/tests/classifier_tests.rs`

- [ ] **Step 1: Write failing classifier tests**

Create `src-tauri/tests/classifier_tests.rs`:

```rust
use global_software_timer_lib::classifier::{classify_process, Classification};

#[test]
fn recognizes_common_user_apps() {
    let code = classify_process(
        "Code.exe",
        r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe",
    );
    assert_eq!(
        code,
        Classification::Tracked {
            display_name: "Visual Studio Code".to_string()
        }
    );

    let word = classify_process(
        "WINWORD.EXE",
        r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
    );
    assert_eq!(
        word,
        Classification::Tracked {
            display_name: "Microsoft Word".to_string()
        }
    );
}

#[test]
fn hides_windows_and_helper_noise() {
    assert_eq!(
        classify_process("svchost.exe", r"C:\Windows\System32\svchost.exe"),
        Classification::Hidden
    );
    assert_eq!(
        classify_process("WPSCloudSrv.exe", r"C:\Program Files\WPS Office\WPSCloudSrv.exe"),
        Classification::Hidden
    );
    assert_eq!(
        classify_process("Update.exe", r"C:\Users\dev\AppData\Local\SquirrelTemp\Update.exe"),
        Classification::Hidden
    );
}

#[test]
fn falls_back_to_clean_exe_name() {
    assert_eq!(
        classify_process("MyResearchTool.exe", r"D:\Tools\MyResearchTool.exe"),
        Classification::Tracked {
            display_name: "MyResearchTool".to_string()
        }
    );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd src-tauri
cargo test --test classifier_tests
cd ..
```

Expected: FAIL because `classifier` does not exist.

- [ ] **Step 3: Implement classifier**

Create `src-tauri/src/classifier.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
    Tracked { display_name: String },
    Hidden,
}

pub fn classify_process(process_name: &str, executable_path: &str) -> Classification {
    let name = process_name.trim().to_lowercase();
    let path = executable_path.trim().to_lowercase();

    if is_system_or_helper_process(&name, &path) {
        return Classification::Hidden;
    }

    if let Some(display_name) = known_display_name(&name) {
        return Classification::Tracked {
            display_name: display_name.to_string(),
        };
    }

    Classification::Tracked {
        display_name: clean_process_name(process_name),
    }
}

fn known_display_name(name: &str) -> Option<&'static str> {
    match name {
        "code.exe" => Some("Visual Studio Code"),
        "winword.exe" => Some("Microsoft Word"),
        "excel.exe" => Some("Microsoft Excel"),
        "powerpnt.exe" => Some("Microsoft PowerPoint"),
        "sldworks.exe" => Some("SolidWorks"),
        "chrome.exe" => Some("Google Chrome"),
        "msedge.exe" => Some("Microsoft Edge"),
        "firefox.exe" => Some("Firefox"),
        "obsidian.exe" => Some("Obsidian"),
        "notion.exe" => Some("Notion"),
        "codex.exe" => Some("Codex"),
        _ => None,
    }
}

fn is_system_or_helper_process(name: &str, path: &str) -> bool {
    const SYSTEM_NAMES: &[&str] = &[
        "system",
        "registry",
        "idle",
        "svchost.exe",
        "conhost.exe",
        "csrss.exe",
        "dwm.exe",
        "lsass.exe",
        "services.exe",
        "smss.exe",
        "spoolsv.exe",
        "wininit.exe",
        "winlogon.exe",
        "wudfhost.exe",
    ];
    const HELPER_KEYWORDS: &[&str] = &[
        "update",
        "updater",
        "crashpad",
        "helper",
        "service",
        "cloudsrv",
        "wpscloud",
        "sync",
        "installer",
        "squirreltemp",
    ];

    SYSTEM_NAMES.contains(&name)
        || path.starts_with(r"c:\windows\")
        || HELPER_KEYWORDS.iter().any(|keyword| name.contains(keyword) || path.contains(keyword))
}

fn clean_process_name(process_name: &str) -> String {
    process_name
        .trim()
        .strip_suffix(".exe")
        .or_else(|| process_name.trim().strip_suffix(".EXE"))
        .unwrap_or(process_name.trim())
        .to_string()
}
```

- [ ] **Step 4: Export classifier**

Modify `src-tauri/src/lib.rs`:

```rust
pub mod classifier;
pub mod domain;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
```

- [ ] **Step 5: Run classifier tests**

Run:

```powershell
cd src-tauri
cargo test --test classifier_tests
cd ..
```

Expected: PASS.

- [ ] **Step 6: Commit classifier**

Run:

```powershell
git add src-tauri/src/classifier.rs src-tauri/src/lib.rs src-tauri/tests/classifier_tests.rs
git commit -m "feat: classify user-facing applications"
```

Expected: commit succeeds.

---

## Task 4: Add Process Snapshots And Active-Time Detection

**Files:**
- Create: `src-tauri/src/process_source.rs`
- Create: `src-tauri/src/activity.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add process snapshot abstraction**

Create `src-tauri/src/process_source.rs`:

```rust
use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProcessSnapshot {
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
}

pub trait ProcessSource: Send {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot>;
}

pub struct SysinfoProcessSource {
    system: System,
}

impl SysinfoProcessSource {
    pub fn new() -> Self {
        Self {
            system: System::new_all(),
        }
    }
}

impl Default for SysinfoProcessSource {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessSource for SysinfoProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        self.system.refresh_all();
        self.system
            .processes()
            .iter()
            .map(|(pid, process)| ProcessSnapshot {
                pid: pid.as_u32(),
                process_name: process.name().to_string_lossy().into_owned(),
                executable_path: process
                    .exe()
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            })
            .collect()
    }
}
```

- [ ] **Step 2: Add active-time detector abstraction**

Create `src-tauri/src/activity.rs`:

```rust
use std::time::Duration;

pub trait ActivitySource: Send {
    fn idle_duration(&self) -> Duration;

    fn is_active(&self, threshold: Duration) -> bool {
        self.idle_duration() <= threshold
    }
}

#[derive(Debug, Default)]
pub struct WindowsActivitySource;

#[cfg(target_os = "windows")]
impl ActivitySource for WindowsActivitySource {
    fn idle_duration(&self) -> Duration {
        use windows_sys::Win32::System::SystemInformation::GetTickCount64;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

        unsafe {
            let mut info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };

            if GetLastInputInfo(&mut info) == 0 {
                return Duration::ZERO;
            }

            let now = GetTickCount64();
            let last_input = info.dwTime as u64;
            Duration::from_millis(now.saturating_sub(last_input))
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl ActivitySource for WindowsActivitySource {
    fn idle_duration(&self) -> Duration {
        Duration::ZERO
    }
}
```

- [ ] **Step 3: Export modules**

Modify `src-tauri/src/lib.rs`:

```rust
pub mod activity;
pub mod classifier;
pub mod domain;
pub mod process_source;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
```

- [ ] **Step 4: Run Rust tests**

Run:

```powershell
cd src-tauri
cargo test
cd ..
```

Expected: PASS. If `sysinfo` API differs, update only `process_source.rs` to match the installed crate and keep the public `ProcessSource` trait unchanged.

- [ ] **Step 5: Commit process and activity sources**

Run:

```powershell
git add src-tauri/src/process_source.rs src-tauri/src/activity.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: add process and activity sources"
```

Expected: commit succeeds.

---

## Task 5: Implement Tracker Engine, Heartbeats, And Recovery

**Files:**
- Modify: `src-tauri/src/storage.rs`
- Create: `src-tauri/src/tracker.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/tests/tracker_tests.rs`

- [ ] **Step 1: Write failing tracker test**

Create `src-tauri/tests/tracker_tests.rs`:

```rust
use global_software_timer_lib::process_source::{ProcessSnapshot, ProcessSource};
use global_software_timer_lib::storage::Store;
use global_software_timer_lib::tracker::Tracker;
use tempfile::NamedTempFile;

struct FakeProcessSource {
    snapshots: Vec<Vec<ProcessSnapshot>>,
    index: usize,
}

impl FakeProcessSource {
    fn new(snapshots: Vec<Vec<ProcessSnapshot>>) -> Self {
        Self { snapshots, index: 0 }
    }
}

impl ProcessSource for FakeProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        let current = self.snapshots.get(self.index).cloned().unwrap_or_default();
        self.index += 1;
        current
    }
}

fn code_process() -> ProcessSnapshot {
    ProcessSnapshot {
        pid: 42,
        process_name: "Code.exe".to_string(),
        executable_path: r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe".to_string(),
    }
}

#[test]
fn tracker_creates_and_closes_sessions_from_process_changes() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");

    let source = FakeProcessSource::new(vec![vec![code_process()], vec![code_process()], vec![]]);
    let mut tracker = Tracker::new(store, source);

    tracker.scan_once().expect("first scan starts session");
    tracker.scan_once().expect("second scan heartbeats session");
    tracker.scan_once().expect("third scan closes session");

    let sessions = tracker.store().all_sessions().expect("sessions");
    assert_eq!(sessions.len(), 1);
    assert!(sessions[0].ended_at.is_some());
    assert_eq!(sessions[0].close_reason.as_deref(), Some("process_closed"));
}
```

- [ ] **Step 2: Run tracker test to verify it fails**

Run:

```powershell
cd src-tauri
cargo test --test tracker_tests
cd ..
```

Expected: FAIL because tracker storage helpers and `Tracker` do not exist.

- [ ] **Step 3: Add storage methods needed by tracker**

Modify `src-tauri/src/storage.rs` by adding these methods inside `impl Store`:

```rust
pub fn insert_run_event(
    &self,
    app_id: Option<i64>,
    event_kind: crate::domain::RunEventKind,
    payload_json: Option<&str>,
) -> StoreResult<()> {
    self.conn.execute(
        "INSERT INTO run_events (app_id, event_kind, payload_json) VALUES (?1, ?2, ?3)",
        params![app_id, event_kind.as_str(), payload_json],
    )?;
    Ok(())
}

pub fn start_session(&self, app_id: i64, now: chrono::DateTime<chrono::Utc>) -> StoreResult<i64> {
    self.conn.execute(
        "INSERT INTO usage_sessions (app_id, started_at, last_heartbeat_at)
         VALUES (?1, ?2, ?2)",
        params![app_id, now.to_rfc3339()],
    )?;
    Ok(self.conn.last_insert_rowid())
}

pub fn heartbeat_session(
    &self,
    session_id: i64,
    now: chrono::DateTime<chrono::Utc>,
) -> StoreResult<()> {
    self.conn.execute(
        "UPDATE usage_sessions SET last_heartbeat_at = ?1 WHERE id = ?2 AND ended_at IS NULL",
        params![now.to_rfc3339(), session_id],
    )?;
    Ok(())
}

pub fn close_session(
    &self,
    session_id: i64,
    ended_at: chrono::DateTime<chrono::Utc>,
    close_reason: &str,
    recovered: bool,
) -> StoreResult<()> {
    self.conn.execute(
        r#"
        UPDATE usage_sessions
        SET ended_at = ?1,
            duration_seconds = CAST((julianday(?1) - julianday(started_at)) * 86400 AS INTEGER),
            close_reason = ?2,
            recovered = ?3
        WHERE id = ?4 AND ended_at IS NULL
        "#,
        params![ended_at.to_rfc3339(), close_reason, recovered as i64, session_id],
    )?;
    Ok(())
}

pub fn all_sessions(&self) -> StoreResult<Vec<crate::domain::UsageSession>> {
    use chrono::{DateTime, Utc};
    let mut stmt = self.conn.prepare(
        "SELECT id, app_id, started_at, ended_at, last_heartbeat_at, duration_seconds, close_reason, recovered
         FROM usage_sessions ORDER BY id",
    )?;
    let rows = stmt.query_map([], |row| {
        let started_at: String = row.get(2)?;
        let ended_at: Option<String> = row.get(3)?;
        let last_heartbeat_at: String = row.get(4)?;
        Ok(crate::domain::UsageSession {
            id: row.get(0)?,
            app_id: row.get(1)?,
            started_at: DateTime::parse_from_rfc3339(&started_at).unwrap().with_timezone(&Utc),
            ended_at: ended_at.map(|value| DateTime::parse_from_rfc3339(&value).unwrap().with_timezone(&Utc)),
            last_heartbeat_at: DateTime::parse_from_rfc3339(&last_heartbeat_at).unwrap().with_timezone(&Utc),
            duration_seconds: row.get(5)?,
            close_reason: row.get(6)?,
            recovered: row.get::<_, i64>(7)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::from)
}
```

- [ ] **Step 4: Implement tracker**

Create `src-tauri/src/tracker.rs`:

```rust
use crate::classifier::{classify_process, Classification};
use crate::domain::RunEventKind;
use crate::process_source::{ProcessSnapshot, ProcessSource};
use crate::storage::{Store, StoreError};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TrackerError {
    #[error("store error: {0}")]
    Store(#[from] StoreError),
}

pub type TrackerResult<T> = Result<T, TrackerError>;

#[derive(Debug, Clone)]
struct RunningApp {
    app_id: i64,
    session_id: i64,
}

pub struct Tracker<S: ProcessSource> {
    store: Store,
    source: S,
    running_by_key: HashMap<String, RunningApp>,
}

impl<S: ProcessSource> Tracker<S> {
    pub fn new(store: Store, source: S) -> Self {
        Self {
            store,
            source,
            running_by_key: HashMap::new(),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn scan_once(&mut self) -> TrackerResult<()> {
        let snapshots = self.source.snapshot();
        let mut seen_keys = HashSet::new();

        for snapshot in snapshots {
            let Some((key, display_name)) = self.trackable_snapshot(&snapshot) else {
                continue;
            };
            seen_keys.insert(key.clone());

            if let Some(running) = self.running_by_key.get(&key) {
                self.store.heartbeat_session(running.session_id, Utc::now())?;
                self.store.insert_run_event(
                    Some(running.app_id),
                    RunEventKind::AppHeartbeat,
                    Some(&format!(r#"{{"pid":{}}}"#, snapshot.pid)),
                )?;
                continue;
            }

            let app = self
                .store
                .upsert_app(&snapshot.process_name, &snapshot.executable_path, &display_name)?;
            let session_id = self.store.start_session(app.id, Utc::now())?;
            self.store.insert_run_event(
                Some(app.id),
                RunEventKind::AppSeenStarted,
                Some(&format!(r#"{{"pid":{}}}"#, snapshot.pid)),
            )?;
            self.running_by_key.insert(
                key,
                RunningApp {
                    app_id: app.id,
                    session_id,
                },
            );
        }

        let stopped_keys = self
            .running_by_key
            .keys()
            .filter(|key| !seen_keys.contains(*key))
            .cloned()
            .collect::<Vec<_>>();

        for key in stopped_keys {
            if let Some(running) = self.running_by_key.remove(&key) {
                self.store
                    .close_session(running.session_id, Utc::now(), "process_closed", false)?;
                self.store
                    .insert_run_event(Some(running.app_id), RunEventKind::AppSeenStopped, None)?;
            }
        }

        Ok(())
    }

    fn trackable_snapshot(&self, snapshot: &ProcessSnapshot) -> Option<(String, String)> {
        match classify_process(&snapshot.process_name, &snapshot.executable_path) {
            Classification::Hidden => None,
            Classification::Tracked { display_name } => {
                let key = crate::storage::normalize_identity_key(
                    &snapshot.executable_path,
                    &snapshot.process_name,
                );
                Some((key, display_name))
            }
        }
    }
}
```

- [ ] **Step 5: Export tracker**

Modify `src-tauri/src/lib.rs`:

```rust
pub mod activity;
pub mod classifier;
pub mod domain;
pub mod process_source;
pub mod storage;
pub mod tracker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
```

- [ ] **Step 6: Run tracker tests**

Run:

```powershell
cd src-tauri
cargo test --test tracker_tests
cd ..
```

Expected: PASS.

- [ ] **Step 7: Commit tracker engine**

Run:

```powershell
git add src-tauri/src/storage.rs src-tauri/src/tracker.rs src-tauri/src/lib.rs src-tauri/tests/tracker_tests.rs
git commit -m "feat: track application runtime sessions"
```

Expected: commit succeeds.

---

## Task 6: Add Tauri State, Commands, Tray, And Autostart

**Files:**
- Create: `src-tauri/src/app_state.rs`
- Create: `src-tauri/src/commands.rs`
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add application state**

Create `src-tauri/src/app_state.rs`:

```rust
use crate::process_source::SysinfoProcessSource;
use crate::storage::Store;
use crate::tracker::Tracker;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub type SharedTracker = Arc<Mutex<Tracker<SysinfoProcessSource>>>;

pub struct AppState {
    pub db_path: PathBuf,
    pub tracker: SharedTracker,
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Result<Self, crate::storage::StoreError> {
        let store = Store::open(&db_path)?;
        store.migrate()?;
        let tracker = Tracker::new(store, SysinfoProcessSource::new());
        Ok(Self {
            db_path,
            tracker: Arc::new(Mutex::new(tracker)),
        })
    }
}
```

- [ ] **Step 2: Add dashboard commands**

Create `src-tauri/src/commands.rs`:

```rust
use crate::app_state::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct DashboardSummary {
    pub product_title: String,
    pub locale: String,
    pub most_used: Option<AppUsageRow>,
    pub recorded_today_seconds: i64,
    pub active_today_seconds: i64,
    pub apps: Vec<AppUsageRow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppUsageRow {
    pub app_id: i64,
    pub display_name: String,
    pub process_name: String,
    pub total_seconds: i64,
    pub today_seconds: i64,
    pub is_running: bool,
}

#[tauri::command]
pub fn get_dashboard_summary(_state: State<'_, AppState>) -> DashboardSummary {
    DashboardSummary {
        product_title: "全局软件计时器".to_string(),
        locale: "zh-CN".to_string(),
        most_used: None,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: Vec::new(),
    }
}

#[tauri::command]
pub fn run_tracker_scan_once(state: State<'_, AppState>) -> Result<(), String> {
    let mut tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker.scan_once().map_err(|error| error.to_string())
}
```

- [ ] **Step 3: Add tray behavior**

Create `src-tauri/src/tray.rs`:

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager,
};

pub fn setup_tray(app: &App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开仪表盘", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .tooltip("全局软件计时器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
```

- [ ] **Step 4: Wire state, commands, tray, and autostart plugin**

Modify `src-tauri/src/lib.rs`:

```rust
pub mod activity;
pub mod app_state;
pub mod classifier;
pub mod commands;
pub mod domain;
pub mod process_source;
pub mod storage;
pub mod tracker;
pub mod tray;

use app_state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            let db_path = app_data_dir.join("global-software-timer.sqlite3");
            let state = AppState::new(db_path).expect("failed to initialize app state");
            app.manage(state);
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard_summary,
            commands::run_tracker_scan_once
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
```

- [ ] **Step 5: Run build checks**

Run:

```powershell
npm run build
cd src-tauri
cargo test
cd ..
```

Expected: both commands PASS.

- [ ] **Step 6: Commit Tauri integration**

Run:

```powershell
git add src-tauri/src/app_state.rs src-tauri/src/commands.rs src-tauri/src/tray.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: wire tauri tray and dashboard commands"
```

Expected: commit succeeds.

---

## Task 7: Build The Steam-Like Dashboard UI

**Files:**
- Create: `src/i18n.ts`
- Create: `src/api.ts`
- Create: `src/components/SummaryCards.tsx`
- Create: `src/components/AppUsageTable.tsx`
- Create: `src/components/TodayMix.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/__tests__/i18n.test.ts`
- Create: `src/__tests__/App.test.tsx`

- [ ] **Step 1: Write i18n time-format tests**

Create `src/__tests__/i18n.test.ts`:

```ts
import { formatDurationZh } from "../i18n";

describe("formatDurationZh", () => {
  it("formats hours and minutes in Chinese long form", () => {
    expect(formatDurationZh(8 * 3600 + 16 * 60)).toBe("8小时16分钟");
  });

  it("formats durations below one hour as minutes", () => {
    expect(formatDurationZh(42 * 60)).toBe("42分钟");
  });
});
```

- [ ] **Step 2: Implement i18n helpers**

Create `src/i18n.ts`:

```ts
export function formatDurationZh(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}分钟`;
  }

  return `${hours}小时${minutes}分钟`;
}
```

- [ ] **Step 3: Add typed API wrapper**

Create `src/api.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export interface AppUsageRow {
  app_id: number;
  display_name: string;
  process_name: string;
  total_seconds: number;
  today_seconds: number;
  is_running: boolean;
}

export interface DashboardSummary {
  product_title: string;
  locale: string;
  most_used: AppUsageRow | null;
  recorded_today_seconds: number;
  active_today_seconds: number;
  apps: AppUsageRow[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary");
}
```

- [ ] **Step 4: Create dashboard components**

Create `src/components/SummaryCards.tsx`:

```tsx
import type { DashboardSummary } from "../api";
import { formatDurationZh } from "../i18n";

interface Props {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: Props) {
  return (
    <section className="summary-grid" aria-label="今日总览">
      <article className="card hero-card">
        <p className="card-label">最常用</p>
        <h2>{summary.most_used?.display_name ?? "暂无数据"}</h2>
        <p className="muted">
          {summary.most_used
            ? `累计 ${formatDurationZh(summary.most_used.total_seconds)} · 今日 ${formatDurationZh(summary.most_used.today_seconds)}`
            : "保持运行后会显示使用最多的软件"}
        </p>
      </article>
      <article className="card">
        <p className="card-label">今日记录</p>
        <h2>{formatDurationZh(summary.recorded_today_seconds)}</h2>
        <p className="muted">计时器从开机后持续运行</p>
      </article>
      <article className="card">
        <p className="card-label">今日活跃</p>
        <h2>{formatDurationZh(summary.active_today_seconds)}</h2>
        <p className="muted">检测到键盘或鼠标操作</p>
      </article>
    </section>
  );
}
```

Create `src/components/AppUsageTable.tsx`:

```tsx
import type { AppUsageRow } from "../api";
import { formatDurationZh } from "../i18n";

interface Props {
  apps: AppUsageRow[];
}

export function AppUsageTable({ apps }: Props) {
  return (
    <section className="table-panel" aria-label="应用时长列表">
      <div className="usage-row usage-head">
        <span>应用</span>
        <span>累计</span>
        <span>今天</span>
        <span>状态</span>
      </div>
      {apps.length === 0 ? (
        <div className="empty-state">暂时没有可展示的软件时长。</div>
      ) : (
        apps.map((app) => (
          <div className="usage-row" key={app.app_id}>
            <span>
              <strong>{app.display_name}</strong>
              <small>{app.process_name}</small>
            </span>
            <span>{formatDurationZh(app.total_seconds)}</span>
            <span>{formatDurationZh(app.today_seconds)}</span>
            <span className={app.is_running ? "running" : "closed"}>
              {app.is_running ? "运行中" : "已关闭"}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
```

Create `src/components/TodayMix.tsx`:

```tsx
import type { AppUsageRow } from "../api";

interface Props {
  apps: AppUsageRow[];
}

export function TodayMix({ apps }: Props) {
  const total = apps.reduce((sum, app) => sum + app.today_seconds, 0);
  const top = apps.filter((app) => app.today_seconds > 0).slice(0, 4);

  return (
    <aside className="mix-panel" aria-label="今日分布">
      <h2>今日分布</h2>
      <div className="mix-bar">
        {top.map((app, index) => (
          <span
            className={`mix-segment segment-${index}`}
            key={app.app_id}
            style={{ width: `${total > 0 ? (app.today_seconds / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="mix-list">
        {top.map((app) => (
          <div key={app.app_id}>
            <span>{app.display_name}</span>
            <strong>{total > 0 ? Math.round((app.today_seconds / total) * 100) : 0}%</strong>
          </div>
        ))}
      </div>
      <p className="muted divider">系统进程和无意义后台进程默认不会显示在仪表盘里。</p>
    </aside>
  );
}
```

- [ ] **Step 5: Wire App component**

Modify `src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getDashboardSummary, type DashboardSummary } from "./api";
import { AppUsageTable } from "./components/AppUsageTable";
import { SummaryCards } from "./components/SummaryCards";
import { TodayMix } from "./components/TodayMix";

const fallbackSummary: DashboardSummary = {
  product_title: "全局软件计时器",
  locale: "zh-CN",
  most_used: null,
  recorded_today_seconds: 0,
  active_today_seconds: 0,
  apps: [],
};

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(fallbackSummary);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDashboardSummary()
      .then((nextSummary) => {
        if (!cancelled) {
          setSummary(nextSummary);
        }
      })
      .catch((unknownError) => {
        if (!cancelled) {
          setError(unknownError instanceof Error ? unknownError.message : "无法读取本地数据");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地软件使用时长库</p>
          <h1>{summary.product_title}</h1>
        </div>
        <div className="status-pill">正在记录</div>
      </header>

      {error ? <div className="warning">{error}</div> : null}
      <SummaryCards summary={summary} />

      <div className="dashboard-grid">
        <AppUsageTable apps={summary.apps} />
        <TodayMix apps={summary.apps} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Replace styles**

Modify `src/styles.css` with the final v0.1 styles:

```css
:root {
  color: #f6f2ea;
  background: #121417;
  font-family:
    "Microsoft YaHei UI",
    "PingFang SC",
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 960px;
  min-height: 100vh;
  background: #121417;
}

.app-shell {
  min-height: 100vh;
  padding: 28px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.eyebrow,
.card-label,
.muted,
small {
  color: #aeb5c0;
}

.eyebrow,
.card-label {
  margin: 0 0 6px;
  font-size: 13px;
}

h1,
h2,
p {
  letter-spacing: 0;
}

h1 {
  margin: 0;
  font-size: 30px;
}

h2 {
  margin: 0;
}

.status-pill {
  border-radius: 8px;
  background: #e3b85d;
  color: #151515;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 800;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr 0.85fr;
  gap: 12px;
  margin-bottom: 14px;
}

.card,
.table-panel,
.mix-panel {
  border: 1px solid #333b47;
  border-radius: 10px;
  background: #1d2229;
}

.card {
  padding: 16px;
}

.card h2 {
  margin-top: 12px;
  font-size: 32px;
}

.hero-card h2 {
  font-size: 26px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
}

.table-panel {
  overflow: hidden;
}

.usage-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 130px 130px 90px;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-top: 1px solid #303743;
}

.usage-head {
  border-top: 0;
  background: #222832;
  color: #aeb5c0;
  font-size: 12px;
  text-transform: uppercase;
}

.usage-row strong,
.usage-row small {
  display: block;
}

.running {
  color: #77d7a1;
}

.closed {
  color: #8f98a8;
}

.mix-panel {
  padding: 14px;
}

.mix-bar {
  display: flex;
  height: 12px;
  overflow: hidden;
  margin: 14px 0;
  border-radius: 999px;
  background: #303743;
}

.mix-segment {
  min-width: 0;
}

.segment-0 {
  background: #e3b85d;
}

.segment-1 {
  background: #6aa3d8;
}

.segment-2 {
  background: #87c08a;
}

.segment-3 {
  background: #b37ad8;
}

.mix-list {
  display: grid;
  gap: 9px;
  font-size: 13px;
}

.mix-list div {
  display: flex;
  justify-content: space-between;
}

.divider {
  border-top: 1px solid #303743;
  margin-top: 18px;
  padding-top: 14px;
  font-size: 13px;
}

.warning,
.empty-state {
  padding: 14px;
  color: #e7d5a6;
}

.warning {
  margin-bottom: 14px;
  border: 1px solid #5a4930;
  border-radius: 8px;
  background: #2a2118;
}
```

- [ ] **Step 7: Add dashboard rendering test**

Create `src/__tests__/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "../App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    product_title: "全局软件计时器",
    locale: "zh-CN",
    most_used: null,
    recorded_today_seconds: 0,
    active_today_seconds: 0,
    apps: [],
  }),
}));

describe("App", () => {
  it("renders the Chinese product title", async () => {
    render(<App />);
    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    expect(screen.getByText("正在记录")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run frontend tests and build**

Run:

```powershell
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 9: Commit dashboard**

Run:

```powershell
git add src package.json package-lock.json vite.config.ts tsconfig.json
git commit -m "feat: add steam-like dashboard UI"
```

Expected: commit succeeds.

---

## Task 8: Add Documentation, Privacy Statement, License, And CI

**Files:**
- Create: `README.md`
- Create: `PRIVACY.md`
- Create: `CONTRIBUTING.md`
- Create: `LICENSE`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create README**

Create `README.md`:

````markdown
# Global Software Timer

Global Software Timer, also displayed as `全局软件计时器` in Chinese, is a local-first desktop app that tracks how long you use desktop software.

v0.1 is Windows-first. It runs in the system tray, records application runtime locally, and shows a Steam-like dashboard with Most Used, today's recorded time, today's active time, and per-application totals.

## Privacy First

v0.1 stores data locally in SQLite. It does not upload telemetry, require an account, record window titles, record document names, record webpage titles, or request administrator permission by default.

## Tech Stack

- Tauri v2
- Rust
- React and TypeScript
- SQLite

## Development

```powershell
npm install
npm run tauri:dev
```

## Checks

```powershell
npm test
npm run build
cd src-tauri
cargo test
```

## Open-Source Core

The local tracker, classifier, storage schema, and privacy boundaries are intended to remain auditable open-source core modules. Future advanced analytics or team features must not weaken the local-first privacy model.
````

- [ ] **Step 2: Create privacy statement**

Create `PRIVACY.md`:

```markdown
# Privacy

Global Software Timer v0.1 is local-first.

## What v0.1 records

- Application executable identity
- User-facing application name
- Application runtime
- Daily recorded computer time
- Daily active computer time based on keyboard/mouse idle state

## What v0.1 does not record

- Window titles
- Document names
- Webpage titles
- Keystrokes
- Mouse coordinates
- File contents
- Browser history
- Cloud data

## Network

v0.1 does not upload usage data or require an account.

## Permissions

v0.1 runs as a normal user-space app and does not request administrator permission by default.
```

- [ ] **Step 3: Create contribution guide**

Create `CONTRIBUTING.md`:

````markdown
# Contributing

Thank you for helping build Global Software Timer.

## Principles

- Keep the tracker core local-first and auditable.
- Do not add telemetry.
- Keep privacy-sensitive features opt-in.
- Prefer small, tested modules over large files.

## Local Checks

```powershell
npm test
npm run build
cd src-tauri
cargo test
```
````

- [ ] **Step 4: Create MIT license**

Create `LICENSE` using the standard MIT License text with copyright:

```text
MIT License

Copyright (c) 2026 Global Software Timer Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  checks:
    runs-on: windows-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm ci

      - name: Frontend tests
        run: npm test

      - name: Frontend build
        run: npm run build

      - name: Rust tests
        working-directory: src-tauri
        run: cargo test
```

- [ ] **Step 6: Run all local checks**

Run:

```powershell
npm test
npm run build
cd src-tauri
cargo test
cd ..
```

Expected: all PASS.

- [ ] **Step 7: Commit docs and CI**

Run:

```powershell
git add README.md PRIVACY.md CONTRIBUTING.md LICENSE .github/workflows/ci.yml
git commit -m "docs: add open source project materials"
```

Expected: commit succeeds.

---

## Task 9: Manual Windows Verification And v0.1 Polish Pass

**Files:**
- Modify only files needed to fix issues found during verification.
- Update: `README.md` if verification steps change.

- [ ] **Step 1: Run full automated checks**

Run:

```powershell
npm test
npm run build
cd src-tauri
cargo test
cd ..
```

Expected: all PASS.

- [ ] **Step 2: Start the Tauri app**

Run:

```powershell
npm run tauri:dev
```

Expected:

- Main dashboard window opens.
- Window title is `全局软件计时器`.
- Tray icon appears.
- Left-clicking tray icon focuses the dashboard.
- Right-clicking tray icon shows `打开仪表盘` and `退出`.

- [ ] **Step 3: Verify tracking manually**

Manual actions:

1. Open VS Code, Word, Chrome, or another common desktop app.
2. Wait at least 15 seconds.
3. Trigger `run_tracker_scan_once` from a temporary debug button or by waiting for the tracker loop if it has already been scheduled.
4. Close the app.
5. Reopen the dashboard.

Expected:

- The common app appears in the app list.
- System processes such as `svchost.exe` do not appear.
- The app has non-zero runtime after it is closed.
- Dashboard still renders after closing and reopening the window.

- [ ] **Step 4: Verify privacy boundaries**

Inspect the database file under the Tauri app data directory.

Expected:

- Tables contain app names, executable paths, runtime/session data, and dates.
- Tables do not contain window titles.
- Tables do not contain document names.
- Tables do not contain webpage titles.

- [ ] **Step 5: Verify abnormal exit recovery**

Manual actions:

1. Start the Tauri app.
2. Open a tracked application.
3. Wait at least 15 seconds.
4. Force-close the Tauri process from Task Manager.
5. Start the Tauri app again.

Expected:

- App starts successfully.
- Historical sessions remain readable.
- Unfinished sessions are recovered or safely closed using the last heartbeat timestamp once recovery is implemented.

- [ ] **Step 6: Commit verification fixes**

If files changed, run:

```powershell
git add README.md src src-tauri
git commit -m "fix: polish v0.1 verification issues"
```

Expected: commit succeeds if fixes were necessary. If no fixes were necessary, skip the commit.

---

## Self-Review Notes

- Spec coverage: This plan covers Windows-first Tauri app, tray behavior, autostart permissions, SQLite event/session storage, app filtering, runtime tracking, Chinese UI copy, privacy documentation, GitHub-ready docs, CI, and manual verification.
- Deferred by design: macOS, paid features, accounts, cloud, enterprise deployment, Notion/Obsidian integrations, mobile companion apps, window-title tracking, and administrator enhanced detection remain out of scope for v0.1.
- Implementation risk: `sysinfo` minor API differences may require adapting only `src-tauri/src/process_source.rs`; the public `ProcessSource` trait must remain unchanged so tracker tests stay stable.
