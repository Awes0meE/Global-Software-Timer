# Software Page v0.1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1.3 `软件` page with focused software, hidden software, discovered software, local search, and software-page focused active time.

**Architecture:** Add a robust software identity layer in Rust/SQLite so user rules apply to merged user-visible software, not raw executable rows. Expose dedicated Tauri commands for the software page and keep hidden software filtered from default summaries while retaining raw history. Implement the React page as focused components with shared local search utilities and a shared add dialog.

**Tech Stack:** Tauri v2, Rust, rusqlite, React, TypeScript, Vitest, Testing Library, SQLite, local offline `pinyin-pro`.

---

## Source References

- Spec: `docs/superpowers/specs/2026-06-05-software-page-design.md`
- Project memory: `memory.md`
- Current UI shell: `src/App.tsx`
- Current API wrappers: `src/api.ts`
- Current dashboard table: `src/components/AppUsageTable.tsx`
- Current storage: `src-tauri/src/storage.rs`
- Current commands: `src-tauri/src/commands.rs`
- Current tracker: `src-tauri/src/tracker.rs`
- Current classifier: `src-tauri/src/classifier.rs`
- Current storage tests: `src-tauri/tests/storage_tests.rs`
- Current tracker tests: `src-tauri/tests/tracker_tests.rs`
- Current frontend tests: `src/__tests__/App.test.tsx`

Before Rust/Tauri commands in PowerShell, run:

```powershell
. .\scripts\dev-env.ps1
```

---

## File Structure

Modify:

- `package.json` - add local pinyin search dependency.
- `package-lock.json` - lock the new dependency.
- `src/api.ts` - add software page DTOs and commands.
- `src/App.tsx` - make `软件` navigation available and render `SoftwarePage`.
- `src/styles.css` - add software page, dialog, search, badge, edit-mode, and popover styles.
- `src-tauri/src/domain.rs` - add software identity, software mark, software page row DTO support types if useful.
- `src-tauri/src/storage.rs` - add schema, identity cache, focus/hidden list operations, focused active storage, and hidden filtering.
- `src-tauri/src/tracker.rs` - increment software-page focused active time when a foreground identity exists.
- `src-tauri/src/commands.rs` - add software page Tauri commands and dashboard hidden filtering.
- `src-tauri/src/lib.rs` - register new Tauri commands.
- `src-tauri/tests/storage_tests.rs` - add identity, list, filter, and focus usage tests.
- `src-tauri/tests/tracker_tests.rs` - add software-page focused active time tests.
- `src/__tests__/App.test.tsx` - update navigation expectations and add software-page integration tests.

Create:

- `src/softwareSearch.ts` - pure search index, ranking, highlighting, and last-opened formatting helpers.
- `src/__tests__/softwareSearch.test.ts` - pure helper tests.
- `src/components/SoftwarePage.tsx` - top-level software page.
- `src/components/SoftwarePanels.tsx` - focused, hidden, and discovered panels.
- `src/components/AddSoftwareDialog.tsx` - shared add dialog.
- `src/components/ActiveTimeHelpPopover.tsx` - active-time help popover.

Do not create:

- Any network service.
- Any window-title/document-title/browser-history collection code.
- Any manual `.exe` picker.

---

## Task 1: Add Software Identity Storage

**Files:**
- Modify: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/tests/storage_tests.rs`

### Goal

Create the robust database foundation for user-visible software identities, focused list, hidden list, membership cache, last-opened time, and conflict-safe list updates.

- [ ] **Step 1: Add failing migration and identity tests**

Append these tests to `src-tauri/tests/storage_tests.rs`:

```rust
#[test]
fn migrate_creates_software_identity_tables() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let tables = store.table_names().expect("table names");
    assert!(tables.contains(&"software_identities".to_string()));
    assert!(tables.contains(&"software_identity_members".to_string()));
    assert!(tables.contains(&"focused_software_identities".to_string()));
    assert!(tables.contains(&"hidden_software_identities".to_string()));
    assert!(tables.contains(&"daily_software_focus_usage".to_string()));
}

#[test]
fn software_identity_groups_wps_components_under_one_key() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let wps = store
        .upsert_app("wps.exe", r"C:\Kingsoft\WPS Office\office6\wps.exe", "wps")
        .expect("wps");
    let sheet = store
        .upsert_app("et.exe", r"C:\Kingsoft\WPS Office\office6\et.exe", "et")
        .expect("sheet");

    let first = store
        .upsert_software_identity_for_app(wps.id)
        .expect("first identity");
    let second = store
        .upsert_software_identity_for_app(sheet.id)
        .expect("second identity");

    assert_eq!(first.identity_key, "known:wps-office");
    assert_eq!(second.identity_key, first.identity_key);
    assert_eq!(first.display_name, "WPS Office");
    assert_eq!(
        store
            .software_identity_member_ids("known:wps-office")
            .expect("members"),
        vec![wps.id, sheet.id]
    );
}

#[test]
fn focused_and_hidden_identity_lists_are_mutually_exclusive_and_sorted_newest_first() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app("Code.exe", r"C:\Tools\VS Code\Code.exe", "Visual Studio Code")
        .expect("code");
    let chrome = store
        .upsert_app("chrome.exe", r"C:\Chrome\chrome.exe", "Google Chrome")
        .expect("chrome");
    let code_identity = store
        .upsert_software_identity_for_app(code.id)
        .expect("code identity");
    let chrome_identity = store
        .upsert_software_identity_for_app(chrome.id)
        .expect("chrome identity");

    store
        .add_focused_software_identities(&[code_identity.identity_key.clone()])
        .expect("focus code");
    store
        .add_focused_software_identities(&[chrome_identity.identity_key.clone()])
        .expect("focus chrome");

    let focused = store.focused_software_identity_keys().expect("focused rows");
    assert_eq!(
        focused,
        vec![chrome_identity.identity_key.clone(), code_identity.identity_key.clone()]
    );

    let hidden_result = store.add_hidden_software_identities(&[code_identity.identity_key]);
    assert!(hidden_result.is_err());
}

#[test]
fn hidden_conflict_wins_when_reading_identity_mark() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app("Code.exe", r"C:\Tools\VS Code\Code.exe", "Visual Studio Code")
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");

    store
        .force_insert_focused_identity_for_test(&identity.identity_key)
        .expect("force focus");
    store
        .force_insert_hidden_identity_for_test(&identity.identity_key)
        .expect("force hidden");

    assert_eq!(
        store
            .software_identity_mark(&identity.identity_key)
            .expect("mark"),
        "hidden"
    );
}
```

- [ ] **Step 2: Run failing storage tests**

Run:

```powershell
. .\scripts\dev-env.ps1
cd src-tauri
cargo test --test storage_tests software_identity -- --nocapture
cd ..
```

Expected: FAIL because the new tables and methods do not exist.

- [ ] **Step 3: Add domain structs**

In `src-tauri/src/domain.rs`, add:

```rust
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct SoftwareIdentity {
    pub identity_key: String,
    pub display_name: String,
    pub process_name: String,
    pub representative_executable_path: String,
    pub last_opened_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SoftwareMark {
    None,
    Focused,
    Hidden,
}
```

- [ ] **Step 4: Add schema tables**

Extend `Store::migrate()` in `src-tauri/src/storage.rs` with:

```rust
CREATE TABLE IF NOT EXISTS software_identities (
    identity_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    process_name TEXT NOT NULL,
    representative_executable_path TEXT NOT NULL,
    last_opened_at TEXT,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS software_identity_members (
    identity_key TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (identity_key, app_id),
    FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key),
    FOREIGN KEY(app_id) REFERENCES apps(id)
);

CREATE TABLE IF NOT EXISTS focused_software_identities (
    identity_key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
);

CREATE TABLE IF NOT EXISTS hidden_software_identities (
    identity_key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
);

CREATE TABLE IF NOT EXISTS daily_software_focus_usage (
    usage_date TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    focused_seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date, identity_key),
    FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
);
```

- [ ] **Step 5: Add identity helper methods**

In `src-tauri/src/storage.rs`, add methods with these signatures:

```rust
pub fn software_identity_key_for_app(
    &self,
    app_id: i64,
) -> StoreResult<Option<String>>;

pub fn upsert_software_identity_for_app(
    &self,
    app_id: i64,
) -> StoreResult<SoftwareIdentity>;

pub fn upsert_software_identity_for_app_started_at(
    &self,
    app_id: i64,
    started_at: DateTime<Utc>,
) -> StoreResult<SoftwareIdentity>;

pub fn software_identity_member_ids(
    &self,
    identity_key: &str,
) -> StoreResult<Vec<i64>>;

pub fn focused_software_identity_keys(&self) -> StoreResult<Vec<String>>;

pub fn hidden_software_identity_keys(&self) -> StoreResult<Vec<String>>;

pub fn software_identity_mark(&self, identity_key: &str) -> StoreResult<&'static str>;
```

Implementation notes:

- Use classifier display-name logic to produce identity.
- Known WPS suite components must return `known:wps-office`.
- Other identities should use `app:<normalized_key>`.
- Do not use display name alone as the identity key.
- `software_identity_mark()` returns `hidden` if both tables contain the key.

- [ ] **Step 6: Add conflict-safe list methods**

In `src-tauri/src/storage.rs`, add:

```rust
pub fn add_focused_software_identities(&self, identity_keys: &[String]) -> StoreResult<()>;
pub fn remove_focused_software_identity(&self, identity_key: &str) -> StoreResult<()>;
pub fn add_hidden_software_identities(&self, identity_keys: &[String]) -> StoreResult<()>;
pub fn remove_hidden_software_identity(&self, identity_key: &str) -> StoreResult<()>;
```

Implementation notes:

- Wrap each add call in `BEGIN IMMEDIATE` / `COMMIT`.
- If adding focused and any key already exists in hidden, return a `StoreError`.
- If adding hidden and any key already exists in focused, return a `StoreError`.
- Use `INSERT OR IGNORE` for repeated add of an already-present key in the same target list.
- Remove calls should be idempotent.

For the test-only conflict setup, add under `#[cfg(test)]`:

```rust
pub fn force_insert_focused_identity_for_test(&self, identity_key: &str) -> StoreResult<()>;
pub fn force_insert_hidden_identity_for_test(&self, identity_key: &str) -> StoreResult<()>;
```

- [ ] **Step 7: Update session start identity cache**

Update `start_session_with_event()` or the tracker path that calls it so a session start updates:

- `software_identities`.
- `software_identity_members`.
- `last_opened_at`.

Minimal safe implementation: after a session starts successfully, call `upsert_software_identity_for_app_started_at(app_id, now)`.

- [ ] **Step 8: Run storage tests**

Run:

```powershell
. .\scripts\dev-env.ps1
cd src-tauri
cargo test --test storage_tests
cd ..
```

Expected: PASS.

- [ ] **Step 9: Self-review and commit**

Run:

```powershell
git diff --check
git diff -- src-tauri/src/domain.rs src-tauri/src/storage.rs src-tauri/tests/storage_tests.rs
git status --short
git add src-tauri/src/domain.rs src-tauri/src/storage.rs src-tauri/tests/storage_tests.rs
git commit -m "feat(storage): add software identity rules"
```

---

## Task 2: Track Software-Page Focused Active Time

**Files:**
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/tracker.rs`
- Modify: `src-tauri/tests/tracker_tests.rs`
- Modify: `src-tauri/tests/storage_tests.rs`

### Goal

Record software-page active time when a tracked app owns the Windows foreground focused window, without keyboard/mouse idle gating and without changing overview active-time semantics.

- [ ] **Step 1: Add failing storage test for focus usage**

Append to `src-tauri/tests/storage_tests.rs`:

```rust
#[test]
fn daily_software_focus_usage_accumulates_by_identity() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app("Code.exe", r"C:\Tools\VS Code\Code.exe", "Visual Studio Code")
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");
    let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 5).unwrap();

    store
        .increment_daily_software_focus_usage(date, &identity.identity_key, 5)
        .expect("first increment");
    store
        .increment_daily_software_focus_usage(date, &identity.identity_key, 7)
        .expect("second increment");

    assert_eq!(
        store
            .software_focus_seconds_for_date(date)
            .expect("focus seconds")
            .get(&identity.identity_key)
            .copied(),
        Some(12)
    );
}
```

- [ ] **Step 2: Add failing tracker test for no idle gating**

Append to `src-tauri/tests/tracker_tests.rs`:

```rust
#[test]
fn tracker_records_software_focus_time_even_when_machine_is_idle() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(3600),
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let now = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();

    run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        now.date_naive(),
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .expect("tick");

    let identity = tracker
        .store()
        .upsert_software_identity_for_app(
            tracker.store().all_sessions().expect("sessions")[0].app_id,
        )
        .expect("identity");
    assert_eq!(
        tracker
            .store()
            .software_focus_seconds_for_date(now.date_naive())
            .expect("focus seconds")
            .get(&identity.identity_key)
            .copied(),
        Some(5)
    );

    let overview_usage = tracker
        .store()
        .daily_system_usage(now.date_naive())
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(overview_usage.active_seconds, 0);
}
```

- [ ] **Step 3: Run failing tests**

Run:

```powershell
. .\scripts\dev-env.ps1
cd src-tauri
cargo test --test storage_tests daily_software_focus_usage
cargo test --test tracker_tests tracker_records_software_focus_time_even_when_machine_is_idle
cd ..
```

Expected: FAIL because focus usage methods and tracker increment do not exist.

- [ ] **Step 4: Implement focus usage storage**

In `src-tauri/src/storage.rs`, add:

```rust
pub fn increment_daily_software_focus_usage(
    &self,
    date: NaiveDate,
    identity_key: &str,
    focused_seconds: i64,
) -> StoreResult<()> {
    self.conn.execute(
        r#"
        INSERT INTO daily_software_focus_usage (
            usage_date,
            identity_key,
            focused_seconds
        )
        VALUES (?1, ?2, ?3)
        ON CONFLICT(usage_date, identity_key) DO UPDATE SET
            focused_seconds = focused_seconds + excluded.focused_seconds
        "#,
        params![date.to_string(), identity_key, focused_seconds.max(0)],
    )?;
    Ok(())
}

pub fn software_focus_seconds_for_date(
    &self,
    date: NaiveDate,
) -> StoreResult<HashMap<String, i64>> {
    let mut stmt = self.conn.prepare(
        "SELECT identity_key, focused_seconds FROM daily_software_focus_usage WHERE usage_date = ?1",
    )?;
    let mut rows = stmt.query(params![date.to_string()])?;
    let mut seconds = HashMap::new();

    while let Some(row) = rows.next()? {
        seconds.insert(row.get::<_, String>(0)?, row.get::<_, i64>(1)?);
    }

    Ok(seconds)
}
```

- [ ] **Step 5: Update tracker tick**

In `src-tauri/src/tracker.rs`, after `foreground_app_id` is calculated, add a software-page focus increment independent of `active_seconds`:

```rust
if let Some(app_id) = foreground_app_id {
    let identity = tracker.store().upsert_software_identity_for_app(app_id)?;
    tracker.store().increment_daily_software_focus_usage(
        usage_date,
        &identity.identity_key,
        seconds,
    )?;
}
```

Keep existing overview behavior unchanged:

```rust
if active_seconds > 0 {
    if let Some(app_id) = foreground_app_id {
        tracker
            .store()
            .increment_daily_app_usage(usage_date, app_id, 0, active_seconds)?;
    }
}
```

- [ ] **Step 6: Run tracker and storage tests**

Run:

```powershell
. .\scripts\dev-env.ps1
cd src-tauri
cargo test --test storage_tests daily_software_focus_usage
cargo test --test tracker_tests
cd ..
```

Expected: PASS.

- [ ] **Step 7: Self-review and commit**

Run:

```powershell
git diff --check
git diff -- src-tauri/src/storage.rs src-tauri/src/tracker.rs src-tauri/tests/storage_tests.rs src-tauri/tests/tracker_tests.rs
git add src-tauri/src/storage.rs src-tauri/src/tracker.rs src-tauri/tests/storage_tests.rs src-tauri/tests/tracker_tests.rs
git commit -m "feat(tracker): record focused software active time"
```

---

## Task 3: Add Software Page Backend Commands And Hidden Filtering

**Files:**
- Modify: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tests/storage_tests.rs`

### Goal

Expose a software page summary DTO, support add/remove commands, and filter hidden software from the dashboard summary immediately.

- [ ] **Step 1: Add failing storage tests for hidden dashboard filtering and summary rows**

Append to `src-tauri/tests/storage_tests.rs`:

```rust
#[test]
fn app_usage_summary_excludes_hidden_software_identities() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app("Code.exe", r"C:\Tools\VS Code\Code.exe", "Visual Studio Code")
        .expect("code");
    let bitdock = store
        .upsert_app("BitDock.exe", r"C:\Tools\BitDock\BitDock.exe", "BitDock")
        .expect("bitdock");
    let hidden_identity = store
        .upsert_software_identity_for_app(bitdock.id)
        .expect("hidden identity");
    store
        .add_hidden_software_identities(&[hidden_identity.identity_key])
        .expect("hide bitdock");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    for app_id in [code.id, bitdock.id] {
        let session = store.start_session(app_id, start).expect("start");
        store
            .close_session(session, end, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary_for_date(start, end, start.date_naive())
        .expect("summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "Visual Studio Code");
}

#[test]
fn software_page_summary_rows_include_marks_and_last_opened() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app("Code.exe", r"C:\Tools\VS Code\Code.exe", "Visual Studio Code")
        .expect("code");
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let session = store.start_session(code.id, start).expect("start");
    store
        .close_session(session, end, "process_closed", false)
        .expect("close");
    let identity = store
        .upsert_software_identity_for_app_started_at(code.id, start)
        .expect("identity");
    store
        .add_focused_software_identities(&[identity.identity_key.clone()])
        .expect("focus");

    let rows = store
        .software_page_rows(start, end, start.date_naive(), &Default::default())
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.focused.len(), 1);
    assert_eq!(rows.hidden.len(), 0);
    assert_eq!(rows.discovered[0].mark, "focused");
    assert_eq!(rows.discovered[0].last_opened_at, Some(start));
}
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
. .\scripts\dev-env.ps1
cd src-tauri
cargo test --test storage_tests hidden_software
cargo test --test storage_tests software_page_summary_rows
cd ..
```

Expected: FAIL because summary/filter methods do not exist.

- [ ] **Step 3: Add software page domain structs**

In `src-tauri/src/domain.rs`, add:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct SoftwarePageRows {
    pub focused: Vec<SoftwarePageRow>,
    pub hidden: Vec<SoftwarePageRow>,
    pub discovered: Vec<SoftwarePageRow>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SoftwarePageRow {
    pub identity_key: String,
    pub display_name: String,
    pub process_name: String,
    pub executable_path: String,
    pub app_ids: Vec<i64>,
    pub total_runtime_seconds: i64,
    pub today_runtime_seconds: i64,
    pub total_focused_seconds: i64,
    pub today_focused_seconds: i64,
    pub last_opened_at: Option<DateTime<Utc>>,
    pub mark: String,
}
```

- [ ] **Step 4: Implement hidden filtering in app usage summary**

In `Store::app_usage_summary_for_date`, skip rows whose identity is hidden:

```rust
let hidden_identity_keys = self.hidden_software_identity_keys()?;
let hidden_identity_keys = hidden_identity_keys.into_iter().collect::<HashSet<_>>();
```

For each row, before adding it to totals:

```rust
let identity = self.upsert_software_identity_for_app(app_id)?;
if hidden_identity_keys.contains(&identity.identity_key) {
    continue;
}
```

Keep raw sessions unchanged.

- [ ] **Step 5: Implement software page rows query**

In `src-tauri/src/storage.rs`, add:

```rust
pub fn software_page_rows(
    &self,
    day_start_utc: DateTime<Utc>,
    now_utc: DateTime<Utc>,
    usage_date: NaiveDate,
    runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
) -> StoreResult<SoftwarePageRows>;
```

Implementation requirements:

- Aggregate all non-classifier-hidden software identities, including hidden identities.
- Sort `discovered` by `last_opened_at DESC`, with missing values last.
- Sort `focused` by `focused_software_identities.created_at DESC`.
- Sort `hidden` by `hidden_software_identities.created_at DESC`.
- Use merged intervals for runtime totals.
- Use `daily_software_focus_usage` for today focus.
- Use all rows in `daily_software_focus_usage` summed by identity for total focus.
- Mark hidden over focused if conflict exists.

- [ ] **Step 6: Add command DTOs and Tauri commands**

In `src-tauri/src/commands.rs`, add DTOs:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct SoftwarePageSummary {
    pub focused: Vec<SoftwarePageRowDto>,
    pub hidden: Vec<SoftwarePageRowDto>,
    pub discovered: Vec<SoftwarePageRowDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwarePageRowDto {
    pub identity_key: String,
    pub display_name: String,
    pub process_name: String,
    pub icon_data_url: Option<String>,
    pub today_runtime_seconds: i64,
    pub today_focused_seconds: i64,
    pub total_runtime_seconds: i64,
    pub total_focused_seconds: i64,
    pub last_opened_at: Option<String>,
    pub status: AppRuntimeStatus,
    pub mark: String,
}
```

Add commands:

```rust
#[tauri::command]
pub fn get_software_page_summary(state: State<'_, AppState>) -> Result<SoftwarePageSummary, String>;

#[tauri::command]
pub fn add_focused_software_identities(
    state: State<'_, AppState>,
    identity_keys: Vec<String>,
) -> Result<(), String>;

#[tauri::command]
pub fn remove_focused_software_identity(
    state: State<'_, AppState>,
    identity_key: String,
) -> Result<(), String>;

#[tauri::command]
pub fn add_hidden_software_identities(
    state: State<'_, AppState>,
    identity_keys: Vec<String>,
) -> Result<(), String>;

#[tauri::command]
pub fn remove_hidden_software_identity(
    state: State<'_, AppState>,
    identity_key: String,
) -> Result<(), String>;
```

- [ ] **Step 7: Register commands**

In `src-tauri/src/lib.rs`, add the new commands to `tauri::generate_handler!`.

- [ ] **Step 8: Run Rust tests**

Run:

```powershell
. .\scripts\dev-env.ps1
cd src-tauri
cargo test
cd ..
```

Expected: PASS.

- [ ] **Step 9: Self-review and commit**

Run:

```powershell
git diff --check
git add src-tauri/src/domain.rs src-tauri/src/storage.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/tests/storage_tests.rs
git commit -m "feat: add software page backend commands"
```

---

## Task 4: Add Frontend API Types And Search Helpers

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/api.ts`
- Create: `src/softwareSearch.ts`
- Create: `src/__tests__/softwareSearch.test.ts`

### Goal

Add typed frontend API wrappers and pure search/date formatting helpers before building UI.

- [ ] **Step 1: Install local pinyin dependency**

Run:

```powershell
npm install pinyin-pro
```

Expected:

- `package.json` includes `pinyin-pro`.
- `package-lock.json` updates.
- No CDN or runtime network code is added.

- [ ] **Step 2: Add failing search tests**

Create `src/__tests__/softwareSearch.test.ts`:

```ts
import {
  formatLastOpenedAt,
  highlightDisplayName,
  rankSoftwareRows,
  type SearchableSoftwareRow,
} from "../softwareSearch";

function row(overrides: Partial<SearchableSoftwareRow>): SearchableSoftwareRow {
  return {
    identity_key: "app:test",
    display_name: "Test App",
    mark: "none",
    last_opened_at: "2026-06-05T01:00:00Z",
    ...overrides,
  };
}

describe("softwareSearch", () => {
  it("ranks starts-with matches above contains matches", () => {
    const rows = [
      row({ identity_key: "vscode", display_name: "Visual Studio Code" }),
      row({ identity_key: "chrome", display_name: "Chrome" }),
    ];

    expect(rankSoftwareRows(rows, "c").map((item) => item.identity_key)).toEqual([
      "chrome",
      "vscode",
    ]);
  });

  it("supports pinyin full spelling and initials for Chinese names", () => {
    const rows = [row({ identity_key: "wechat", display_name: "微信" })];

    expect(rankSoftwareRows(rows, "weixin")).toHaveLength(1);
    expect(rankSoftwareRows(rows, "wx")).toHaveLength(1);
    expect(rankSoftwareRows(rows, "微")).toHaveLength(1);
  });

  it("highlights visible English and Chinese matches only", () => {
    expect(highlightDisplayName("Chrome", "ch")).toEqual([
      { text: "Ch", highlighted: true },
      { text: "rome", highlighted: false },
    ]);
    expect(highlightDisplayName("微信", "微")).toEqual([
      { text: "微", highlighted: true },
      { text: "信", highlighted: false },
    ]);
    expect(highlightDisplayName("微信", "wx")).toEqual([
      { text: "微信", highlighted: false },
    ]);
  });

  it("formats last opened times with approved Chinese copy", () => {
    const now = new Date("2026-06-05T12:00:00+08:00");

    expect(formatLastOpenedAt("2026-06-05T11:50:00+08:00", now)).toBe("10分钟前");
    expect(formatLastOpenedAt("2026-06-05T09:42:00+08:00", now)).toBe("今天 09:42");
    expect(formatLastOpenedAt("2026-06-04T21:18:00+08:00", now)).toBe("昨天 21:18");
    expect(formatLastOpenedAt("2026-06-03T15:09:00+08:00", now)).toBe("前天 15:09");
    expect(formatLastOpenedAt("2026-06-02T08:00:00+08:00", now)).toBe("这周二");
    expect(formatLastOpenedAt("2026-05-27T08:00:00+08:00", now)).toBe("上周三");
    expect(formatLastOpenedAt("2026-05-01T08:00:00+08:00", now)).toBe("2026-05-01");
  });
});
```

- [ ] **Step 3: Run failing frontend tests**

Run:

```powershell
npm test -- src/__tests__/softwareSearch.test.ts
```

Expected: FAIL because `src/softwareSearch.ts` does not exist.

- [ ] **Step 4: Implement search helpers**

Create `src/softwareSearch.ts` with exported types and functions:

```ts
import { pinyin } from "pinyin-pro";

export type SoftwareMark = "none" | "focused" | "hidden";

export interface SearchableSoftwareRow {
  identity_key: string;
  display_name: string;
  mark: SoftwareMark;
  last_opened_at: string | null;
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export function rankSoftwareRows<T extends SearchableSoftwareRow>(rows: T[], query: string): T[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...rows].sort(compareLastOpenedDesc);
  }

  return rows
    .map((row) => ({ row, score: scoreRow(row, normalizedQuery) }))
    .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || compareLastOpenedDesc(left.row, right.row))
    .map((entry) => entry.row);
}

export function highlightDisplayName(displayName: string, query: string): HighlightSegment[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [{ text: displayName, highlighted: false }];
  }

  const lower = displayName.toLocaleLowerCase();
  const index = lower.indexOf(normalizedQuery);
  if (index < 0) {
    return [{ text: displayName, highlighted: false }];
  }

  return [
    { text: displayName.slice(0, index), highlighted: false },
    { text: displayName.slice(index, index + query.length), highlighted: true },
    { text: displayName.slice(index + query.length), highlighted: false },
  ].filter((segment) => segment.text.length > 0);
}

export function formatLastOpenedAt(value: string | null, now = new Date()): string {
  if (!value) {
    return "从未打开";
  }

  const date = new Date(value);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `今天 ${formatTime(date)}`;
  }

  const dayDiff = calendarDayDiff(date, now);
  if (dayDiff === 1) {
    return `昨天 ${formatTime(date)}`;
  }
  if (dayDiff === 2) {
    return `前天 ${formatTime(date)}`;
  }
  if (dayDiff < 14) {
    return `${dayDiff < 7 ? "这周" : "上周"}${weekdayZh(date)}`;
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function scoreRow(row: SearchableSoftwareRow, query: string): number {
  const keys = searchKeys(row);
  const display = normalize(row.display_name);

  if (display === query) return 0;
  if (display.startsWith(query)) return 1;
  if (keys.some((key) => key !== display && key.startsWith(query))) return 2;
  if (display.includes(query)) return 3;
  if (keys.some((key) => key.includes(query))) return 4;
  if (isSubsequence(query, display) || keys.some((key) => isSubsequence(query, key))) return 5;

  return Number.POSITIVE_INFINITY;
}

function searchKeys(row: SearchableSoftwareRow): string[] {
  const display = row.display_name;
  const fullPinyin = pinyin(display, { toneType: "none", type: "array" }).join("");
  const initials = pinyin(display, { pattern: "first", toneType: "none", type: "array" }).join("");
  return Array.from(new Set([display, fullPinyin, initials].map(normalize).filter(Boolean)));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compareLastOpenedDesc(left: SearchableSoftwareRow, right: SearchableSoftwareRow): number {
  return (Date.parse(right.last_opened_at ?? "") || 0) - (Date.parse(left.last_opened_at ?? "") || 0);
}

function isSubsequence(query: string, value: string): boolean {
  let index = 0;
  for (const char of value) {
    if (char === query[index]) index += 1;
    if (index === query.length) return true;
  }
  return false;
}

function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function calendarDayDiff(date: Date, now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor((start - target) / 86400000);
}

function weekdayZh(date: Date): string {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
```

- [ ] **Step 5: Add API DTOs and wrappers**

In `src/api.ts`, add:

```ts
export type SoftwareMark = "none" | "focused" | "hidden";

export interface SoftwarePageRow {
  identity_key: string;
  display_name: string;
  process_name: string;
  icon_data_url: string | null;
  today_runtime_seconds: number;
  today_focused_seconds: number;
  total_runtime_seconds: number;
  total_focused_seconds: number;
  last_opened_at: string | null;
  status: AppRuntimeStatus;
  mark: SoftwareMark;
}

export interface SoftwarePageSummary {
  focused: SoftwarePageRow[];
  hidden: SoftwarePageRow[];
  discovered: SoftwarePageRow[];
}

export async function getSoftwarePageSummary(): Promise<SoftwarePageSummary> {
  return invoke<SoftwarePageSummary>("get_software_page_summary");
}

export async function addFocusedSoftwareIdentities(identityKeys: string[]): Promise<void> {
  return invoke("add_focused_software_identities", { identityKeys });
}

export async function removeFocusedSoftwareIdentity(identityKey: string): Promise<void> {
  return invoke("remove_focused_software_identity", { identityKey });
}

export async function addHiddenSoftwareIdentities(identityKeys: string[]): Promise<void> {
  return invoke("add_hidden_software_identities", { identityKeys });
}

export async function removeHiddenSoftwareIdentity(identityKey: string): Promise<void> {
  return invoke("remove_hidden_software_identity", { identityKey });
}
```

Verify Tauri argument casing at implementation time. Existing wrappers use camelCase object keys.

- [ ] **Step 6: Run helper tests and build**

Run:

```powershell
npm test -- src/__tests__/softwareSearch.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Self-review and commit**

Run:

```powershell
git diff --check
git add package.json package-lock.json src/api.ts src/softwareSearch.ts src/__tests__/softwareSearch.test.ts
git commit -m "feat(ui): add software search helpers"
```

---

## Task 5: Build Software Page UI Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/SoftwarePage.tsx`
- Create: `src/components/SoftwarePanels.tsx`
- Create: `src/components/ActiveTimeHelpPopover.tsx`
- Modify: `src/__tests__/App.test.tsx`

### Goal

Make the `软件` nav item available and render the three-panel software page with empty states, independent scrolling, active-time help, and edit-mode remove UI.

- [ ] **Step 1: Add failing App tests for software nav and empty panels**

In `src/__tests__/App.test.tsx`, update the unavailable-control test so `软件` is no longer expected to be unavailable.

Add:

```tsx
it("opens the software page with three panels", async () => {
  mockInvoke.mockImplementation((command) => {
    if (command === "get_software_page_summary") {
      return Promise.resolve({ focused: [], hidden: [], discovered: [] });
    }

    if (command === "get_app_settings") {
      return Promise.resolve({
        close_behavior: "minimize_to_tray",
        close_behavior_configured: false,
        autostart_enabled: true,
        autostart_configured: false,
      });
    }

    return Promise.resolve({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
    });
  });

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "软件" }));

  expect(screen.getByRole("heading", { name: "特别关注" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "隐藏软件列表" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "已发现软件" })).toBeInTheDocument();
  expect(screen.getByText("还没有特别关注的软件")).toBeInTheDocument();
  expect(screen.getByText("还没有隐藏的软件")).toBeInTheDocument();
  expect(screen.getByText("还没有发现软件")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
});

it("shows active time help from the software page", async () => {
  mockInvoke.mockImplementation((command) => {
    if (command === "get_software_page_summary") {
      return Promise.resolve({
        focused: [
          {
            identity_key: "app:code",
            display_name: "Visual Studio Code",
            process_name: "Code.exe",
            icon_data_url: null,
            today_runtime_seconds: 3600,
            today_focused_seconds: 1800,
            total_runtime_seconds: 7200,
            total_focused_seconds: 3600,
            last_opened_at: "2026-06-05T09:00:00Z",
            status: "foreground",
            mark: "focused",
          },
        ],
        hidden: [],
        discovered: [],
      });
    }

    return Promise.resolve({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
    });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "软件" }));
  fireEvent.click(await screen.findByRole("button", { name: "什么是活跃时长" }));

  expect(screen.getByRole("dialog", { name: "什么是活跃时长？" })).toBeInTheDocument();
  expect(screen.getByText(/运行时长表示软件被 GST 记录为正在运行的时间/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing App tests**

Run:

```powershell
npm test -- src/__tests__/App.test.tsx
```

Expected: FAIL because `软件` is unavailable and components do not exist.

- [ ] **Step 3: Create active-time help popover**

Create `src/components/ActiveTimeHelpPopover.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

export function ActiveTimeHelpPopover() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="active-help">
      <button
        ref={buttonRef}
        className="active-help-button"
        type="button"
        aria-label="什么是活跃时长"
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="active-help-popover"
          role="dialog"
          aria-label="什么是活跃时长？"
        >
          <strong>什么是活跃时长？</strong>
          <p>运行时长表示软件被 GST 记录为正在运行的时间。</p>
          <p>活跃时长表示这个软件窗口真正获得 Windows 焦点的时间。</p>
        </div>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 4: Create software panel components**

Create `src/components/SoftwarePanels.tsx` with props and layout:

```tsx
import type { SoftwarePageRow } from "../api";
import { formatDurationZh } from "../i18n";
import { formatLastOpenedAt } from "../softwareSearch";
import { ActiveTimeHelpPopover } from "./ActiveTimeHelpPopover";
import { SoftwareIcon } from "./SoftwareIcon";

interface ManagedPanelProps {
  rows: SoftwarePageRow[];
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  editing: boolean;
  kind: "focused" | "hidden";
  onAdd: () => void;
  onEditToggle: () => void;
  onRemove: (identityKey: string) => void;
}

export function FocusedSoftwarePanel(props: Omit<ManagedPanelProps, "kind" | "title" | "emptyTitle" | "emptyDescription">) {
  return (
    <ManagedSoftwarePanel
      {...props}
      kind="focused"
      title="特别关注"
      emptyTitle="还没有特别关注的软件"
      emptyDescription="添加你最想长期观察的软件，查看运行时长、活跃时长和最近打开时间。"
    />
  );
}

export function HiddenSoftwarePanel(props: Omit<ManagedPanelProps, "kind" | "title" | "emptyTitle" | "emptyDescription">) {
  return (
    <ManagedSoftwarePanel
      {...props}
      kind="hidden"
      title="隐藏软件列表"
      emptyTitle="还没有隐藏的软件"
      emptyDescription="把常驻后台但不想出现在概览里的软件放到这里。"
    />
  );
}

function ManagedSoftwarePanel({
  rows,
  title,
  emptyTitle,
  emptyDescription,
  editing,
  kind,
  onAdd,
  onEditToggle,
  onRemove,
}: ManagedPanelProps) {
  return (
    <section className={`software-panel software-panel-${kind}`} aria-labelledby={`${kind}-software-title`}>
      <div className="software-panel-head">
        <h2 id={`${kind}-software-title`}>{title}</h2>
        <div className="software-panel-actions">
          {rows.length > 0 ? (
            <button className="text-action" type="button" onClick={onEditToggle}>
              {editing ? "完成" : "编辑"}
            </button>
          ) : null}
          <button className="panel-add-button" type="button" onClick={onAdd}>
            添加
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="software-empty">
          <h3>{emptyTitle}</h3>
          <p>{emptyDescription}</p>
          <button className="panel-add-button" type="button" onClick={onAdd}>
            添加
          </button>
        </div>
      ) : kind === "focused" ? (
        <FocusedTable rows={rows} editing={editing} onRemove={onRemove} />
      ) : (
        <HiddenList rows={rows} editing={editing} onRemove={onRemove} />
      )}
    </section>
  );
}

function FocusedTable({
  rows,
  editing,
  onRemove,
}: {
  rows: SoftwarePageRow[];
  editing: boolean;
  onRemove: (identityKey: string) => void;
}) {
  return (
    <div className="software-scroll-x">
      <div className={`focused-table${editing ? " is-editing" : ""}`}>
        <span />
        <strong>软件</strong>
        <strong>状态</strong>
        <strong>今日运行</strong>
        <strong>
          今日活跃 <ActiveTimeHelpPopover />
        </strong>
        <strong>共计运行</strong>
        <strong>共计活跃</strong>
        <strong>上次打开</strong>
        {rows.map((row) => (
          <FocusedTableRow key={row.identity_key} row={row} editing={editing} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function FocusedTableRow({
  row,
  editing,
  onRemove,
}: {
  row: SoftwarePageRow;
  editing: boolean;
  onRemove: (identityKey: string) => void;
}) {
  return (
    <>
      <button
        className="row-remove"
        type="button"
        aria-label={`移出 ${row.display_name}`}
        onClick={() => onRemove(row.identity_key)}
        tabIndex={editing ? 0 : -1}
      >
        ×
      </button>
      <span className="software-name-cell">
        <SoftwareIcon app={row} />
        {row.display_name}
      </span>
      <span>{statusLabel(row.status)}</span>
      <span>{formatDurationZh(row.today_runtime_seconds)}</span>
      <span>{formatDurationZh(row.today_focused_seconds)}</span>
      <span>{formatDurationZh(row.total_runtime_seconds)}</span>
      <span>{formatDurationZh(row.total_focused_seconds)}</span>
      <span>{formatLastOpenedAt(row.last_opened_at)}</span>
    </>
  );
}

function HiddenList({
  rows,
  editing,
  onRemove,
}: {
  rows: SoftwarePageRow[];
  editing: boolean;
  onRemove: (identityKey: string) => void;
}) {
  return (
    <div className={`hidden-list${editing ? " is-editing" : ""}`}>
      {rows.map((row) => (
        <div className="hidden-row" key={row.identity_key}>
          <button
            className="row-remove"
            type="button"
            aria-label={`移出 ${row.display_name}`}
            onClick={() => onRemove(row.identity_key)}
            tabIndex={editing ? 0 : -1}
          >
            ×
          </button>
          <SoftwareIcon app={row} />
          <span>
            <strong>{row.display_name}</strong>
            <small>概览隐藏 · 不参与排行 · 仍正常记录</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: SoftwarePageRow["status"]): string {
  if (status === "foreground") return "前台运行";
  if (status === "background") return "后台运行";
  return "未运行";
}
```

- [ ] **Step 5: Create SoftwarePage shell**

Create `src/components/SoftwarePage.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  getSoftwarePageSummary,
  removeFocusedSoftwareIdentity,
  removeHiddenSoftwareIdentity,
  type SoftwarePageSummary,
} from "../api";
import { DiscoveredSoftwarePanel } from "./SoftwarePanels";
import { FocusedSoftwarePanel, HiddenSoftwarePanel } from "./SoftwarePanels";

const emptySummary: SoftwarePageSummary = {
  focused: [],
  hidden: [],
  discovered: [],
};

export function SoftwarePage() {
  const [summary, setSummary] = useState<SoftwarePageSummary>(emptySummary);
  const [error, setError] = useState<string | null>(null);
  const [focusedEditing, setFocusedEditing] = useState(false);
  const [hiddenEditing, setHiddenEditing] = useState(false);

  const loadSummary = () => {
    getSoftwarePageSummary()
      .then((nextSummary) => {
        setSummary(nextSummary);
        setError(null);
      })
      .catch(() => setError("无法读取软件列表"));
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const removeFocused = async (identityKey: string) => {
    await removeFocusedSoftwareIdentity(identityKey);
    loadSummary();
  };

  const removeHidden = async (identityKey: string) => {
    await removeHiddenSoftwareIdentity(identityKey);
    loadSummary();
  };

  return (
    <main className="software-page" id="software-content">
      {error ? <div className="warning">{error}</div> : null}
      <div className="software-layout">
        <div className="software-managed-column">
          <FocusedSoftwarePanel
            rows={summary.focused}
            editing={focusedEditing}
            onAdd={() => setFocusedEditing(false)}
            onEditToggle={() => setFocusedEditing((current) => !current)}
            onRemove={(identityKey) => void removeFocused(identityKey)}
          />
          <HiddenSoftwarePanel
            rows={summary.hidden}
            editing={hiddenEditing}
            onAdd={() => setHiddenEditing(false)}
            onEditToggle={() => setHiddenEditing((current) => !current)}
            onRemove={(identityKey) => void removeHidden(identityKey)}
          />
        </div>
        <DiscoveredSoftwarePanel rows={summary.discovered} />
      </div>
    </main>
  );
}
```

This step intentionally leaves add dialog wiring for Task 6. The `onAdd` handlers only exit edit mode for now.

- [ ] **Step 6: Add discovered panel**

In `src/components/SoftwarePanels.tsx`, add:

```tsx
import { highlightDisplayName, rankSoftwareRows } from "../softwareSearch";

export function DiscoveredSoftwarePanel({ rows }: { rows: SoftwarePageRow[] }) {
  const [query, setQuery] = useState("");
  const rankedRows = rankSoftwareRows(rows, query);

  return (
    <section className="software-panel discovered-panel" aria-labelledby="discovered-software-title">
      <div className="software-panel-head discovered-head">
        <h2 id="discovered-software-title">已发现软件</h2>
        <span>只读 · 上次打开从近到远</span>
      </div>
      <input
        className="software-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索已发现软件"
      />
      {rows.length === 0 ? (
        <div className="software-empty">
          <h3>还没有发现软件</h3>
          <p>打开软件并保持 GST 运行一会儿后，这里会自动出现。</p>
        </div>
      ) : (
        <div className="discovered-list">
          {rankedRows.map((row) => (
            <div className="discovered-row" key={row.identity_key}>
              <SoftwareIcon app={row} />
              <span>{highlightDisplayName(row.display_name, query).map((segment, index) =>
                segment.highlighted ? <mark key={index}>{segment.text}</mark> : segment.text,
              )}</span>
              <SoftwareMarkBadge mark={row.mark} />
              <span>{formatLastOpenedAt(row.last_opened_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SoftwareMarkBadge({ mark }: { mark: SoftwarePageRow["mark"] }) {
  if (mark === "focused") {
    return <span className="software-mark software-mark-focused">特别关注</span>;
  }
  if (mark === "hidden") {
    return <span className="software-mark software-mark-hidden">已隐藏</span>;
  }
  return <span />;
}
```

Make sure `useState` is imported.

- [ ] **Step 7: Wire App navigation**

In `src/App.tsx`:

- Change `PageId` to include `"software"`.
- Set nav item `{ id: "software", label: "软件", icon: Monitor, available: true }`.
- Set `contentId` for software page.
- Render `<SoftwarePage />` when `activePage === "software"`.

Import:

```tsx
import { SoftwarePage } from "./components/SoftwarePage";
```

- [ ] **Step 8: Add styles**

Add focused styles to `src/styles.css`. Keep page dense and avoid nested cards:

```css
.software-page {
  min-width: 0;
  min-height: 0;
  padding: 18px;
}

.software-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(460px, 1.1fr);
  gap: 14px;
  height: calc(100vh - 150px);
  min-height: 520px;
}

.software-managed-column {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
}

.software-panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
}

.software-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.software-panel-head h2 {
  margin: 0;
  font-size: 16px;
}

.software-panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.text-action,
.row-remove {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.text-action:hover,
.row-remove:hover {
  color: var(--gold);
}

.panel-add-button {
  border: 0;
  border-radius: 7px;
  background: var(--blue);
  color: white;
  cursor: pointer;
  font-weight: 800;
  padding: 8px 11px;
}

.software-empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  padding: 22px;
  text-align: center;
}

.software-empty h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.software-empty p {
  max-width: 320px;
  margin: 0 0 14px;
  color: var(--muted);
}

.software-scroll-x {
  overflow: auto;
  height: calc(100% - 57px);
}

.focused-table {
  display: grid;
  grid-template-columns: 0 170px 86px 92px 112px 92px 92px 130px;
  gap: 10px;
  align-items: center;
  min-width: 790px;
  padding: 12px;
  transition: grid-template-columns 260ms cubic-bezier(.2,.8,.2,1);
}

.focused-table.is-editing {
  grid-template-columns: 24px 170px 86px 92px 112px 92px 92px 130px;
}

.row-remove {
  opacity: 0;
  pointer-events: none;
  color: #ff786e;
  font-size: 18px;
}

.is-editing .row-remove {
  opacity: 1;
  pointer-events: auto;
}

.software-name-cell,
.hidden-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hidden-list {
  display: grid;
  gap: 12px;
  height: calc(100% - 57px);
  overflow-y: auto;
  padding: 12px;
}

.hidden-row {
  display: grid;
  grid-template-columns: 0 34px minmax(0, 1fr);
  transition: grid-template-columns 260ms cubic-bezier(.2,.8,.2,1);
}

.hidden-list.is-editing .hidden-row {
  grid-template-columns: 24px 34px minmax(0, 1fr);
}

.hidden-row small {
  display: block;
  color: var(--muted);
}

.software-search {
  width: calc(100% - 28px);
  margin: 12px 14px;
}

.discovered-list {
  display: grid;
  gap: 8px;
  height: calc(100% - 116px);
  overflow-y: auto;
  padding: 0 14px 14px;
}

.discovered-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 96px 128px;
  gap: 10px;
  align-items: center;
  min-height: 42px;
}

.software-mark {
  width: fit-content;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 800;
}

.software-mark-focused {
  background: #f0b84f;
  color: #1a1204;
}

.software-mark-hidden {
  border: 1px solid rgba(220, 230, 240, 0.2);
  color: rgba(220, 230, 240, 0.55);
}

.active-help {
  position: relative;
}

.active-help-button {
  width: 16px;
  height: 16px;
  margin-left: 4px;
  border: 1px solid rgba(220, 230, 240, 0.35);
  border-radius: 999px;
  background: transparent;
  color: rgba(220, 230, 240, 0.65);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.active-help-popover {
  position: absolute;
  z-index: 20;
  top: 24px;
  left: 0;
  width: 260px;
  padding: 14px;
  border: 1px solid rgba(180, 200, 220, 0.25);
  border-radius: 8px;
  background: #101923;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.36);
}
```

Adjust CSS variable names to match existing `src/styles.css` if needed. Do not introduce a one-hue palette.

- [ ] **Step 9: Run frontend tests**

Run:

```powershell
npm test -- src/__tests__/App.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 10: Self-review and commit**

Run:

```powershell
git diff --check
git add src/App.tsx src/styles.css src/components/SoftwarePage.tsx src/components/SoftwarePanels.tsx src/components/ActiveTimeHelpPopover.tsx src/__tests__/App.test.tsx
git commit -m "feat(ui): add software page shell"
```

---

## Task 6: Add Shared Add Dialog And Live Mutations

**Files:**
- Modify: `src/components/SoftwarePage.tsx`
- Modify: `src/components/SoftwarePanels.tsx`
- Create: `src/components/AddSoftwareDialog.tsx`
- Modify: `src/styles.css`
- Modify: `src/__tests__/App.test.tsx`

### Goal

Implement shared add dialog, multi-select, conflict prompts, successful close behavior, immediate refresh, and discovered-list mark synchronization.

- [ ] **Step 1: Add failing App tests for dialog behavior**

Add to `src/__tests__/App.test.tsx`:

```tsx
it("opens a shared add dialog with target-specific title and multi-selects rows", async () => {
  mockInvoke.mockImplementation((command, args) => {
    if (command === "get_software_page_summary") {
      return Promise.resolve({
        focused: [],
        hidden: [],
        discovered: [
          {
            identity_key: "app:bitdock",
            display_name: "BitDock",
            process_name: "BitDock.exe",
            icon_data_url: null,
            today_runtime_seconds: 3600,
            today_focused_seconds: 0,
            total_runtime_seconds: 7200,
            total_focused_seconds: 0,
            last_opened_at: "2026-06-05T08:10:00Z",
            status: "background",
            mark: "none",
          },
          {
            identity_key: "app:wallpaper",
            display_name: "Wallpaper Engine",
            process_name: "wallpaper64.exe",
            icon_data_url: null,
            today_runtime_seconds: 3600,
            today_focused_seconds: 0,
            total_runtime_seconds: 7200,
            total_focused_seconds: 0,
            last_opened_at: "2026-06-05T08:08:00Z",
            status: "background",
            mark: "none",
          },
        ],
      });
    }

    if (command === "add_hidden_software_identities") {
      expect(args).toEqual({ identityKeys: ["app:bitdock", "app:wallpaper"] });
      return Promise.resolve(undefined);
    }

    return Promise.resolve({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
    });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "软件" }));
  fireEvent.click(await screen.findByRole("button", { name: "添加隐藏软件" }));

  expect(screen.getByRole("dialog", { name: "添加隐藏软件" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("搜索已发现软件")).toHaveFocus();
  fireEvent.click(screen.getByText("BitDock"));
  fireEvent.click(screen.getByText("Wallpaper Engine"));
  expect(screen.getByRole("button", { name: "添加 2 个" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "添加 2 个" }));

  await waitFor(() => expect(screen.queryByRole("dialog", { name: "添加隐藏软件" })).not.toBeInTheDocument());
});

it("shows a conflict prompt for mutually exclusive software in the add dialog", async () => {
  mockInvoke.mockImplementation((command) => {
    if (command === "get_software_page_summary") {
      return Promise.resolve({
        focused: [],
        hidden: [],
        discovered: [
          {
            identity_key: "app:bitdock",
            display_name: "BitDock",
            process_name: "BitDock.exe",
            icon_data_url: null,
            today_runtime_seconds: 3600,
            today_focused_seconds: 0,
            total_runtime_seconds: 7200,
            total_focused_seconds: 0,
            last_opened_at: "2026-06-05T08:10:00Z",
            status: "background",
            mark: "hidden",
          },
        ],
      });
    }

    return Promise.resolve({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
    });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "软件" }));
  fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
  fireEvent.click(screen.getByText("BitDock"));

  expect(screen.getByText("该软件已加入隐藏列表哦！请先移出再尝试")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
});
```

- [ ] **Step 2: Run failing App tests**

Run:

```powershell
npm test -- src/__tests__/App.test.tsx
```

Expected: FAIL because add dialog is not implemented.

- [ ] **Step 3: Create shared add dialog**

Create `src/components/AddSoftwareDialog.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoftwarePageRow } from "../api";
import { formatLastOpenedAt, highlightDisplayName, rankSoftwareRows } from "../softwareSearch";
import { SoftwareIcon } from "./SoftwareIcon";

type AddTarget = "focused" | "hidden";

interface Props {
  rows: SoftwarePageRow[];
  target: AddTarget;
  onClose: () => void;
  onSubmit: (identityKeys: string[]) => Promise<void>;
}

export function AddSoftwareDialog({ rows, target, onClose, onSubmit }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const title = target === "focused" ? "添加特别关注" : "添加隐藏软件";
  const rankedRows = useMemo(() => rankSoftwareRows(rows, query), [rows, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleRow = (row: SoftwarePageRow) => {
    const conflict = conflictMessage(row, target);
    if (conflict) {
      setMessage(conflict);
      return;
    }

    setMessage(null);
    setSelected((current) =>
      current.includes(row.identity_key)
        ? current.filter((key) => key !== row.identity_key)
        : [...current, row.identity_key],
    );
  };

  const submit = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSubmit(selected);
      onClose();
    } catch {
      setMessage("添加失败，请重试。");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="add-software-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="text-action" type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <input
          ref={inputRef}
          className="software-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索已发现软件"
        />
        {message ? <p className="dialog-error">{message}</p> : null}
        <div className="add-software-results">
          {rankedRows.map((row) => {
            const isSelected = selected.includes(row.identity_key);
            const conflict = Boolean(conflictMessage(row, target));
            return (
              <button
                className={`add-software-row${isSelected ? " is-selected" : ""}`}
                type="button"
                key={row.identity_key}
                aria-pressed={isSelected}
                aria-disabled={conflict}
                onClick={() => toggleRow(row)}
              >
                <SoftwareIcon app={row} />
                <span>
                  {highlightDisplayName(row.display_name, query).map((segment, index) =>
                    segment.highlighted ? <mark key={index}>{segment.text}</mark> : segment.text,
                  )}
                </span>
                <SoftwareMarkBadge mark={row.mark} />
                <span>{formatLastOpenedAt(row.last_opened_at)}</span>
              </button>
            );
          })}
        </div>
        <footer>
          <span>{selected.length > 0 ? `已选择 ${selected.length} 个软件` : ""}</span>
          <div>
            <button className="dialog-secondary" type="button" onClick={onClose}>
              取消
            </button>
            <button
              className="dialog-primary"
              type="button"
              disabled={selected.length === 0 || busy}
              onClick={() => void submit()}
            >
              {selected.length > 0 ? `添加 ${selected.length} 个` : "添加"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function conflictMessage(row: SoftwarePageRow, target: AddTarget): string | null {
  if (target === "focused" && row.mark === "hidden") {
    return "该软件已加入隐藏列表哦！请先移出再尝试";
  }
  if (target === "hidden" && row.mark === "focused") {
    return "该软件已加入特别关注哦！请先移出再尝试";
  }
  if (target === "focused" && row.mark === "focused") {
    return "该软件已加入特别关注哦！请先移出再尝试";
  }
  if (target === "hidden" && row.mark === "hidden") {
    return "该软件已加入隐藏列表哦！请先移出再尝试";
  }
  return null;
}
```

Reuse or export `SoftwareMarkBadge` from `SoftwarePanels.tsx`, or move it into a small shared component if duplication appears.

- [ ] **Step 4: Wire dialog in SoftwarePage**

In `src/components/SoftwarePage.tsx`:

- Track dialog target: `const [addTarget, setAddTarget] = useState<"focused" | "hidden" | null>(null);`
- `onAdd` for focused: `setFocusedEditing(false); setAddTarget("focused");`
- `onAdd` for hidden: `setHiddenEditing(false); setAddTarget("hidden");`
- Submit focused calls `addFocusedSoftwareIdentities`.
- Submit hidden calls `addHiddenSoftwareIdentities`.
- After submit, call `loadSummary()`.

Also pass a callback from `App` or refresh dashboard after hidden mutations in a later task if needed. Minimal first step: software page summary refresh.

- [ ] **Step 5: Add dialog styles**

Add to `src/styles.css`:

```css
.add-software-dialog {
  width: min(720px, calc(100vw - 48px));
  max-height: min(620px, calc(100vh - 48px));
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #101923;
  color: var(--text);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.42);
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
}

.add-software-dialog header,
.add-software-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.add-software-dialog h2 {
  margin: 0;
  font-size: 18px;
}

.add-software-results {
  display: grid;
  gap: 6px;
  overflow-y: auto;
  padding: 0 14px 14px;
}

.add-software-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 96px 128px;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.add-software-row:hover,
.add-software-row.is-selected {
  background: rgba(4, 10, 16, 0.54);
}
```

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
npm test -- src/__tests__/App.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Self-review and commit**

Run:

```powershell
git diff --check
git add src/components/AddSoftwareDialog.tsx src/components/SoftwarePage.tsx src/components/SoftwarePanels.tsx src/styles.css src/__tests__/App.test.tsx
git commit -m "feat(ui): add software list management dialog"
```

---

## Task 7: Integration Refresh, Full Verification, And Docs Sync

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SoftwarePage.tsx`
- Modify: `src/__tests__/App.test.tsx`
- Modify: `memory.md`
- Modify: `CHANGELOG.md` if the repo already maintains unreleased notes for v0.1.3.

### Goal

Ensure hidden changes immediately refresh overview data, all checks pass, and project memory reflects the implementation state.

- [ ] **Step 1: Add failing integration test for hidden refresh**

In `src/__tests__/App.test.tsx`, add a test that hides software then verifies `get_dashboard_summary` is called again:

```tsx
it("refreshes overview data after hidden software changes", async () => {
  let softwareCalls = 0;
  let dashboardCalls = 0;
  mockInvoke.mockImplementation((command) => {
    if (command === "get_software_page_summary") {
      softwareCalls += 1;
      return Promise.resolve({
        focused: [],
        hidden: [],
        discovered: [
          {
            identity_key: "app:bitdock",
            display_name: "BitDock",
            process_name: "BitDock.exe",
            icon_data_url: null,
            today_runtime_seconds: 3600,
            today_focused_seconds: 0,
            total_runtime_seconds: 7200,
            total_focused_seconds: 0,
            last_opened_at: "2026-06-05T08:10:00Z",
            status: "background",
            mark: "none",
          },
        ],
      });
    }

    if (command === "add_hidden_software_identities") {
      return Promise.resolve(undefined);
    }

    if (command === "get_dashboard_summary") {
      dashboardCalls += 1;
      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    }

    return Promise.resolve({
      close_behavior: "minimize_to_tray",
      close_behavior_configured: false,
      autostart_enabled: true,
      autostart_configured: false,
    });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "软件" }));
  fireEvent.click(await screen.findByRole("button", { name: "添加隐藏软件" }));
  fireEvent.click(await screen.findByText("BitDock"));
  fireEvent.click(screen.getByRole("button", { name: "添加 1 个" }));

  await waitFor(() => expect(softwareCalls).toBeGreaterThan(1));
  expect(dashboardCalls).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Implement cross-page refresh**

In `src/App.tsx`:

- Extract `loadDashboard` into a stable callback.
- Pass an `onDefaultSummariesChanged` prop to `SoftwarePage`.
- After hidden add/remove, `SoftwarePage` calls that prop.

In `src/components/SoftwarePage.tsx`:

```tsx
interface SoftwarePageProps {
  onDefaultSummariesChanged: () => void;
}
```

Call `onDefaultSummariesChanged()` after:

- `addHiddenSoftwareIdentities`.
- `removeHiddenSoftwareIdentity`.

No need to call it for focused-only changes.

- [ ] **Step 3: Run full checks**

Run:

```powershell
npm test
npm run build
. .\scripts\dev-env.ps1
cd src-tauri
cargo test
cd ..
```

Expected: all PASS.

- [ ] **Step 4: Manual browser/UI verification**

Start the dev app:

```powershell
. .\scripts\dev-env.ps1
npm run tauri:dev
```

Manual checks:

1. `软件` nav opens.
2. Three panels render.
3. Lists have independent scrollbars.
4. Add dialog opens with focused search input.
5. Multi-select rows darken.
6. Conflict prompts show exact Chinese copy.
7. `编辑` changes to `完成`.
8. `×` removes without confirmation.
9. Hidden marks update immediately.
10. Hidden software leaves overview after refresh.
11. Search works for English, Chinese, pinyin full spelling, and pinyin initials.
12. No executable paths, command lines, or window titles appear in UI.

- [ ] **Step 5: Update memory and changelog if appropriate**

If implementation has completed, update `memory.md`:

```markdown
- v0.1.3 implements the `软件` page with `特别关注`, `隐藏软件列表`, read-only `已发现软件`, local pinyin-capable search, and software-page focused active time.
```

If `CHANGELOG.md` has an unreleased section, add:

```markdown
## Unreleased

- Added the `软件` page with focused software, hidden software, discovered software, and local search.
```

- [ ] **Step 6: Self-review and commit**

Run:

```powershell
git diff --check
git status --short
git add src/App.tsx src/components/SoftwarePage.tsx src/__tests__/App.test.tsx memory.md CHANGELOG.md
git commit -m "feat: finalize software page integration"
```

If `CHANGELOG.md` was not changed because the repo has no suitable unreleased section, omit it from `git add`.

---

## Final Review Gate

After Task 7:

- [ ] Run `git log --oneline -8` and confirm commits use accurate Conventional Commit types.
- [ ] Run `git status --short --branch` and confirm only intentional files remain.
- [ ] Re-read `docs/superpowers/specs/2026-06-05-software-page-design.md` and confirm each acceptance criterion is implemented.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `. .\scripts\dev-env.ps1; cd src-tauri; cargo test; cd ..`.
- [ ] Do a short code-quality review of the changed files.
- [ ] Do a spec-compliance review of the changed behavior.
- [ ] Fix any findings before release/version commits.

Suggested release-prep commit only after all feature/fix/test/docs commits already exist:

```powershell
git commit -m "chore(release): prepare v0.1.3"
```

Use this only for version/package metadata and release notes, not for feature implementation.

---

## Plan Self-Review

Spec coverage:

- Software nav enablement: Task 5.
- Three-panel software page: Task 5.
- Focused list and hidden list: Tasks 1, 3, 5, 6.
- Discovered list: Tasks 3, 5.
- Add dialog: Task 6.
- Mutual exclusion: Tasks 1, 3, 6.
- Edit mode: Task 5.
- Search, pinyin, highlight, date formatting: Task 4 and Task 6.
- Software-page focused active time: Task 2.
- Hidden global filtering: Task 3 and Task 7.
- Privacy boundaries: Task 7 manual verification and final review gate.

Placeholder scan:

- This plan intentionally avoids `TBD` and open-ended implementation placeholders.
- Each task includes exact files, concrete test names or snippets, exact commands, and commit messages.

Type consistency:

- Backend uses `identity_key` and frontend uses `identity_key`.
- Backend commands use `focused_software_identities` and `hidden_software_identities`.
- Frontend API wrapper names mirror backend command names.
