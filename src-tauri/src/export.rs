//! File exports, the settings file (export and import) and the full data
//! backup. Native dialogs run here in Rust; the webview gets no dialog or
//! file-system permission. Files are written only to the path the user picks.

use crate::app_state::{lock_recovering, lock_tracker, AppState};
use crate::commands::{
    app_settings_from_store, CloseBehavior, DurationFormat, ThemePreference,
    CLOSE_BEHAVIOR_SETTING_KEY, DURATION_FORMAT_SETTING_KEY, THEME_SETTING_KEY,
};
use crate::storage::{Store, StoreError};
use chrono::{Local, SecondsFormat};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

pub const SETTINGS_FILE_KIND: &str = "gst-settings";
pub const SETTINGS_FILE_SCHEMA: u32 = 1;
pub const SETTINGS_IMPORT_MAX_BYTES: u64 = 1024 * 1024;

const SETTINGS_IMPORT_INVALID: &str = "settings_import_invalid";
const SETTINGS_IMPORT_TOO_LARGE: &str = "settings_import_too_large";
const SETTINGS_IMPORT_EXPIRED: &str = "settings_import_expired";
const EXPORT_UNKNOWN_PATH: &str = "export_unknown_path";
const EXPORT_INVALID_REQUEST: &str = "export_invalid_request";
const EXPORT_TARGET_IS_DATABASE: &str = "export_target_is_database";

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

/// Session-only export state: paths saved since launch (the only ones
/// `reveal_saved_file` opens) and the one settings import awaiting confirmation.
#[derive(Default)]
pub struct ExportSession {
    saved_paths: Mutex<HashSet<String>>,
    pending_import: Mutex<Option<PendingImport>>,
}

struct PendingImport {
    id: String,
    file: SettingsFile,
}

impl ExportSession {
    pub fn remember_saved(&self, path: &str) {
        lock_recovering(&self.saved_paths).insert(path.to_string());
    }

    pub fn was_saved(&self, path: &str) -> bool {
        lock_recovering(&self.saved_paths).contains(path)
    }

    /// Replaces any earlier pending import; returns the new import id.
    pub fn stash_import(&self, file: SettingsFile) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        *lock_recovering(&self.pending_import) = Some(PendingImport {
            id: id.clone(),
            file,
        });
        id
    }

    /// Single use: a second call with the same id returns `None`.
    pub fn take_import(&self, import_id: &str) -> Option<SettingsFile> {
        let mut pending = lock_recovering(&self.pending_import);
        if pending.as_ref().is_some_and(|item| item.id == import_id) {
            pending.take().map(|item| item.file)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SettingsFile {
    pub kind: String,
    pub schema: u32,
    #[serde(default)]
    pub app_version: String,
    #[serde(default)]
    pub exported_at: String,
    #[serde(default)]
    pub settings: SettingsSection,
    #[serde(default)]
    pub focused: Vec<SettingsListEntry>,
    #[serde(default)]
    pub hidden: Vec<SettingsListEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SettingsSection {
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub duration_format: Option<String>,
    #[serde(default)]
    pub close_behavior: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SettingsListEntry {
    #[serde(default)]
    pub identity_key: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SettingChange {
    pub key: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SettingsImportPreview {
    pub import_id: String,
    pub changes: Vec<SettingChange>,
    pub focused_added: u32,
    pub hidden_added: u32,
    pub unmatched: u32,
    pub conflicts: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SettingsImportResult {
    pub focused_added: u32,
    pub hidden_added: u32,
    pub unmatched: u32,
    pub conflicts: u32,
}

/// What applying a settings file to the current store would change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportPlan {
    /// `(setting key in the file, from, to, storage key)`.
    changes: Vec<(&'static str, &'static str, &'static str, &'static str)>,
    /// Identity keys to add, in file order.
    focused_keys: Vec<String>,
    hidden_keys: Vec<String>,
    unmatched: u32,
    conflicts: u32,
}

impl ImportPlan {
    pub fn setting_changes(&self) -> Vec<SettingChange> {
        self.changes
            .iter()
            .map(|(key, from, to, _)| SettingChange {
                key: (*key).to_string(),
                from: (*from).to_string(),
                to: (*to).to_string(),
            })
            .collect()
    }

    pub fn result(&self) -> SettingsImportResult {
        SettingsImportResult {
            focused_added: count(self.focused_keys.len()),
            hidden_added: count(self.hidden_keys.len()),
            unmatched: self.unmatched,
            conflicts: self.conflicts,
        }
    }

    pub fn preview(&self, import_id: String) -> SettingsImportPreview {
        let result = self.result();
        SettingsImportPreview {
            import_id,
            changes: self.setting_changes(),
            focused_added: result.focused_added,
            hidden_added: result.hidden_added,
            unmatched: result.unmatched,
            conflicts: result.conflicts,
        }
    }
}

fn count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// The settings file for the current store: effective settings (defaults
/// included) and both lists in their on-screen order. No autostart, no usage
/// history, no executable paths.
pub fn build_settings_file(
    store: &Store,
    app_version: &str,
    exported_at: &str,
) -> Result<SettingsFile, StoreError> {
    let settings = app_settings_from_store(store)?;
    let names: HashMap<String, (String, String)> = store
        .software_identity_names()?
        .into_iter()
        .map(|(key, display_name, process_name)| (key, (display_name, process_name)))
        .collect();
    let entries = |keys: Vec<String>| -> Vec<SettingsListEntry> {
        keys.into_iter()
            .filter_map(|key| {
                let (display_name, process_name) = names.get(&key)?.clone();
                Some(SettingsListEntry {
                    identity_key: key,
                    display_name,
                    process_name,
                })
            })
            .collect()
    };

    Ok(SettingsFile {
        kind: SETTINGS_FILE_KIND.to_string(),
        schema: SETTINGS_FILE_SCHEMA,
        app_version: app_version.to_string(),
        exported_at: exported_at.to_string(),
        settings: SettingsSection {
            theme: Some(settings.theme.as_str().to_string()),
            duration_format: Some(settings.duration_format.as_str().to_string()),
            close_behavior: Some(settings.close_behavior.as_str().to_string()),
        },
        focused: entries(store.focused_software_identity_keys()?),
        hidden: entries(store.hidden_software_identity_keys()?),
    })
}

/// Parses and validates a settings file. Unknown fields are ignored; a leading
/// BOM is tolerated. Any other problem is `settings_import_invalid`.
pub fn parse_settings_file(bytes: &[u8]) -> Result<SettingsFile, String> {
    let bytes = bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes);
    let file: SettingsFile =
        serde_json::from_slice(bytes).map_err(|_| SETTINGS_IMPORT_INVALID.to_string())?;
    if file.kind != SETTINGS_FILE_KIND || file.schema != SETTINGS_FILE_SCHEMA {
        return Err(SETTINGS_IMPORT_INVALID.to_string());
    }
    Ok(file)
}

/// Reads at most `SETTINGS_IMPORT_MAX_BYTES` from `path`.
pub fn read_settings_import(path: &Path) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.take(SETTINGS_IMPORT_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > SETTINGS_IMPORT_MAX_BYTES {
        return Err(SETTINGS_IMPORT_TOO_LARGE.to_string());
    }
    Ok(bytes)
}

/// Matches the file against the current store without writing anything.
///
/// An entry matches a known identity by `identity_key`, else by `process_name`
/// (case-insensitive; the most recently seen identity wins). Unmatched entries
/// are skipped. An identity already on the opposite list locally, or listed in
/// both lists of the file, is a conflict and is skipped. Entries already on
/// their list change nothing. Settings with unknown values are ignored.
pub fn plan_settings_import(store: &Store, file: &SettingsFile) -> Result<ImportPlan, StoreError> {
    let current = app_settings_from_store(store)?;
    let mut changes = Vec::new();
    if let Some(theme) = file
        .settings
        .theme
        .as_deref()
        .and_then(ThemePreference::from_setting)
    {
        if theme != current.theme {
            changes.push((
                "theme",
                current.theme.as_str(),
                theme.as_str(),
                THEME_SETTING_KEY,
            ));
        }
    }
    if let Some(format) = file
        .settings
        .duration_format
        .as_deref()
        .and_then(DurationFormat::from_setting)
    {
        if format != current.duration_format {
            changes.push((
                "duration_format",
                current.duration_format.as_str(),
                format.as_str(),
                DURATION_FORMAT_SETTING_KEY,
            ));
        }
    }
    if let Some(behavior) = file
        .settings
        .close_behavior
        .as_deref()
        .and_then(CloseBehavior::from_setting)
    {
        if behavior != current.close_behavior {
            changes.push((
                "close_behavior",
                current.close_behavior.as_str(),
                behavior.as_str(),
                CLOSE_BEHAVIOR_SETTING_KEY,
            ));
        }
    }

    let identities = store.software_identity_names()?;
    let known_keys: HashSet<&str> = identities.iter().map(|(key, _, _)| key.as_str()).collect();
    let mut by_process: HashMap<String, &str> = HashMap::new();
    for (key, _, process_name) in &identities {
        by_process
            .entry(process_name.to_lowercase())
            .or_insert(key.as_str());
    }
    let mut unmatched = 0u32;
    let mut resolve = |entries: &[SettingsListEntry]| -> Vec<String> {
        let mut resolved: Vec<String> = Vec::new();
        for entry in entries {
            let key = if known_keys.contains(entry.identity_key.as_str()) {
                Some(entry.identity_key.as_str())
            } else if entry.process_name.trim().is_empty() {
                None
            } else {
                by_process
                    .get(&entry.process_name.trim().to_lowercase())
                    .copied()
            };
            match key {
                Some(key) if !resolved.iter().any(|item| item == key) => {
                    resolved.push(key.to_string())
                }
                Some(_) => {}
                None => unmatched += 1,
            }
        }
        resolved
    };
    let file_focused = resolve(&file.focused);
    let file_hidden = resolve(&file.hidden);

    let local_focused: HashSet<String> = store
        .focused_software_identity_keys()?
        .into_iter()
        .collect();
    let local_hidden: HashSet<String> =
        store.hidden_software_identity_keys()?.into_iter().collect();
    let mut conflicts = 0u32;
    let mut additions = |wanted: &[String],
                         same_list: &HashSet<String>,
                         opposite_list: &HashSet<String>,
                         opposite_file: &[String]|
     -> Vec<String> {
        let mut added = Vec::new();
        for key in wanted {
            if same_list.contains(key) {
                continue;
            }
            if opposite_list.contains(key) || opposite_file.contains(key) {
                conflicts += 1;
                continue;
            }
            added.push(key.clone());
        }
        added
    };
    let focused_keys = additions(&file_focused, &local_focused, &local_hidden, &file_hidden);
    let hidden_keys = additions(&file_hidden, &local_hidden, &local_focused, &file_focused);

    Ok(ImportPlan {
        changes,
        focused_keys,
        hidden_keys,
        unmatched,
        conflicts,
    })
}

/// Re-plans against the current store and writes settings and list additions
/// in one transaction. Never removes local entries.
pub fn apply_settings_file(
    store: &Store,
    file: &SettingsFile,
) -> Result<SettingsImportResult, StoreError> {
    let transaction = store.savepoint()?;
    let plan = plan_settings_import(store, file)?;
    for (_, _, to, storage_key) in &plan.changes {
        store.set_setting_value(storage_key, to)?;
    }
    // Lists show the newest entry first, so insert in reverse file order to
    // keep the file's order on screen.
    let reversed = |keys: &[String]| keys.iter().rev().cloned().collect::<Vec<_>>();
    store.add_focused_software_identities(&reversed(&plan.focused_keys))?;
    store.add_hidden_software_identities(&reversed(&plan.hidden_keys))?;
    transaction.commit()?;
    Ok(plan.result())
}

/// Keeps Windows-reserved characters and path separators out of a suggested
/// file name.
pub fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect();
    let cleaned = cleaned
        .trim_matches(|ch| ch == '.' || ch == ' ')
        .to_string();
    if cleaned.is_empty() {
        "GST-export".to_string()
    } else {
        cleaned
    }
}

/// Extensions are short ASCII alphanumerics such as `csv`.
pub fn valid_extension(extension: &str) -> bool {
    (1..=10).contains(&extension.len()) && extension.chars().all(|ch| ch.is_ascii_alphanumeric())
}

pub fn with_utf8_bom(contents: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(UTF8_BOM.len() + contents.len());
    bytes.extend_from_slice(UTF8_BOM);
    bytes.extend_from_slice(contents.as_bytes());
    bytes
}

/// Refuses a target that is the live database or one of its side files, so
/// a save dialog can never overwrite the data the tracker is writing.
pub fn ensure_not_database(target: &Path, db_path: &Path) -> Result<(), String> {
    let (Some(target_name), Some(db_name)) = (target.file_name(), db_path.file_name()) else {
        return Ok(());
    };
    let target_name = target_name.to_string_lossy().to_lowercase();
    let db_name = db_name.to_string_lossy().to_lowercase();
    let is_db_file = [
        db_name.clone(),
        format!("{db_name}-wal"),
        format!("{db_name}-shm"),
        format!("{db_name}-journal"),
    ]
    .contains(&target_name);
    if !is_db_file {
        return Ok(());
    }
    let canonical_dir = |path: &Path| {
        path.parent()
            .and_then(|dir| std::fs::canonicalize(dir).ok())
            .map(|dir| dir.to_string_lossy().to_lowercase())
    };
    match (canonical_dir(target), canonical_dir(db_path)) {
        (Some(target_dir), Some(db_dir)) if target_dir != db_dir => Ok(()),
        _ => Err(EXPORT_TARGET_IS_DATABASE.to_string()),
    }
}

/// `VACUUM INTO` a temporary file next to `target`, then renames it over
/// `target`. The live database file is only read.
pub fn backup_database(db_path: &Path, target: &Path) -> Result<(), String> {
    ensure_not_database(target, db_path)?;
    let folder = target.parent().unwrap_or(Path::new("."));
    let temp = folder.join(format!(".gst-backup-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let store = Store::open_read_only(db_path).map_err(|error| error.to_string())?;
        store
            .vacuum_into(&temp)
            .map_err(|error| error.to_string())?;
        drop(store);
        std::fs::rename(&temp, target).map_err(|error| error.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

fn local_today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Blocking: call only from a worker thread.
fn pick_save_path<R: Runtime>(
    app: &AppHandle<R>,
    suggested_name: &str,
    filter_name: &str,
    extension: &str,
) -> Option<PathBuf> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(suggested_name)
        .add_filter(filter_name, &[extension]);
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    dialog.blocking_save_file()?.into_path().ok()
}

/// Blocking: call only from a worker thread.
fn pick_open_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let mut dialog = app.dialog().file().add_filter("JSON", &["json"]);
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    dialog.blocking_pick_file()?.into_path().ok()
}

/// Runs a blocking job (dialogs, file writes) off the async runtime's workers.
async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| error.to_string())?
}

/// Writes UTF-8 with a BOM; returns the saved path, `None` when cancelled.
#[tauri::command]
pub async fn save_text_export(
    app: AppHandle,
    suggested_name: String,
    filter_name: String,
    extension: String,
    contents: String,
) -> Result<Option<String>, String> {
    if !valid_extension(&extension) {
        return Err(EXPORT_INVALID_REQUEST.to_string());
    }
    blocking(move || {
        let suggested_name = sanitize_file_name(&suggested_name);
        let Some(path) = pick_save_path(&app, &suggested_name, &filter_name, &extension) else {
            return Ok(None);
        };
        let state = app.state::<AppState>();
        ensure_not_database(&path, &state.db_path)?;
        std::fs::write(&path, with_utf8_bom(&contents)).map_err(|error| error.to_string())?;
        let saved = path_string(&path);
        state.export_session.remember_saved(&saved);
        Ok(Some(saved))
    })
    .await
}

/// Opens Explorer with the file selected, only for a path saved this session.
#[tauri::command(async)]
pub fn reveal_saved_file(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    if !state.export_session.was_saved(&path) {
        return Err(EXPORT_UNKNOWN_PATH.to_string());
    }
    let mut command = std::process::Command::new("explorer");
    #[cfg(windows)]
    {
        // Explorer parses its own command line; quote only the path part.
        use std::os::windows::process::CommandExt;
        command.raw_arg(format!("/select,\"{path}\""));
    }
    #[cfg(not(windows))]
    command.arg(&path);
    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_settings_file(app: AppHandle) -> Result<Option<String>, String> {
    blocking(move || {
        let suggested_name = format!("GST-设置-{}.json", local_today());
        let Some(path) = pick_save_path(&app, &suggested_name, "JSON", "json") else {
            return Ok(None);
        };
        let state = app.state::<AppState>();
        ensure_not_database(&path, &state.db_path)?;
        let exported_at = Local::now().to_rfc3339_opts(SecondsFormat::Secs, false);
        let file = {
            let tracker = lock_tracker(&state.tracker);
            build_settings_file(tracker.store(), env!("CARGO_PKG_VERSION"), &exported_at)
                .map_err(|error| error.to_string())?
        };
        let json = serde_json::to_string_pretty(&file).map_err(|error| error.to_string())?;
        std::fs::write(&path, json).map_err(|error| error.to_string())?;
        let saved = path_string(&path);
        state.export_session.remember_saved(&saved);
        Ok(Some(saved))
    })
    .await
}

#[tauri::command]
pub async fn pick_settings_import(app: AppHandle) -> Result<Option<SettingsImportPreview>, String> {
    blocking(move || {
        let Some(path) = pick_open_path(&app) else {
            return Ok(None);
        };
        let file = parse_settings_file(&read_settings_import(&path)?)?;
        let state = app.state::<AppState>();
        let plan = {
            let tracker = lock_tracker(&state.tracker);
            plan_settings_import(tracker.store(), &file).map_err(|error| error.to_string())?
        };
        let import_id = state.export_session.stash_import(file);
        Ok(Some(plan.preview(import_id)))
    })
    .await
}

#[tauri::command(async)]
pub fn apply_settings_import(
    state: tauri::State<'_, AppState>,
    import_id: String,
) -> Result<SettingsImportResult, String> {
    let file = state
        .export_session
        .take_import(&import_id)
        .ok_or_else(|| SETTINGS_IMPORT_EXPIRED.to_string())?;
    let tracker = lock_tracker(&state.tracker);
    apply_settings_file(tracker.store(), &file).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn backup_all_data(app: AppHandle) -> Result<Option<String>, String> {
    blocking(move || {
        let suggested_name = format!("GST-数据备份-{}.db", local_today());
        let Some(path) = pick_save_path(&app, &suggested_name, "SQLite", "db") else {
            return Ok(None);
        };
        let state = app.state::<AppState>();
        backup_database(&state.db_path, &path)?;
        let saved = path_string(&path);
        state.export_session.remember_saved(&saved);
        Ok(Some(saved))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::{NamedTempFile, TempDir};

    fn migrated_store() -> (NamedTempFile, Store) {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        (db_file, store)
    }

    fn software(store: &Store, process_name: &str) -> String {
        let app_id = store
            .upsert_app(
                process_name,
                &format!(r"X:\Fixtures\{process_name}\{process_name}"),
                process_name,
            )
            .expect("app")
            .id;
        store
            .upsert_software_identity_for_app(app_id)
            .expect("identity")
            .identity_key
    }

    fn entry(identity_key: &str, process_name: &str) -> SettingsListEntry {
        SettingsListEntry {
            identity_key: identity_key.to_string(),
            display_name: process_name.to_string(),
            process_name: process_name.to_string(),
        }
    }

    fn file_with(focused: Vec<SettingsListEntry>, hidden: Vec<SettingsListEntry>) -> SettingsFile {
        SettingsFile {
            kind: SETTINGS_FILE_KIND.to_string(),
            schema: SETTINGS_FILE_SCHEMA,
            app_version: "0.4.1".to_string(),
            exported_at: "2026-11-24T10:00:00+08:00".to_string(),
            settings: SettingsSection::default(),
            focused,
            hidden,
        }
    }

    #[test]
    fn settings_file_holds_effective_settings_and_lists_without_paths() {
        let (_db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        let excel = software(&store, "EXCEL.EXE");
        let drive = software(&store, "OneDrive.exe");
        store
            .add_focused_software_identities(std::slice::from_ref(&code))
            .unwrap();
        store
            .add_focused_software_identities(std::slice::from_ref(&excel))
            .unwrap();
        store
            .add_hidden_software_identities(std::slice::from_ref(&drive))
            .unwrap();
        store.set_setting_value(THEME_SETTING_KEY, "dark").unwrap();
        store
            .set_setting_value("startup.autostart_enabled", "false")
            .unwrap();

        let file = build_settings_file(&store, "0.4.1", "2026-11-24T10:00:00+08:00").unwrap();
        let json: serde_json::Value = serde_json::to_value(&file).unwrap();

        assert_eq!(file.kind, "gst-settings");
        assert_eq!(file.schema, 1);
        assert_eq!(file.settings.theme.as_deref(), Some("dark"));
        assert_eq!(
            file.settings.duration_format.as_deref(),
            Some("decimal_hours")
        );
        assert_eq!(
            file.settings.close_behavior.as_deref(),
            Some("minimize_to_tray")
        );
        let focused: Vec<_> = file
            .focused
            .iter()
            .map(|item| item.identity_key.clone())
            .collect();
        assert_eq!(focused.len(), 2);
        assert!(focused.contains(&code) && focused.contains(&excel));
        assert_eq!(file.hidden.len(), 1);
        assert_eq!(file.hidden[0].identity_key, drive);
        assert_eq!(file.hidden[0].process_name, "onedrive.exe");
        let mut top: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        top.sort();
        assert_eq!(
            top,
            [
                "app_version",
                "exported_at",
                "focused",
                "hidden",
                "kind",
                "schema",
                "settings"
            ]
        );
        let mut settings: Vec<_> = json["settings"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        settings.sort();
        assert_eq!(settings, ["close_behavior", "duration_format", "theme"]);
        let mut fields: Vec<_> = json["hidden"][0]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        fields.sort();
        assert_eq!(fields, ["display_name", "identity_key", "process_name"]);
    }

    #[test]
    fn settings_file_round_trips_through_json() {
        let (_db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        store.add_focused_software_identities(&[code]).unwrap();
        let file = build_settings_file(&store, "0.4.1", "now").unwrap();
        let json = serde_json::to_vec_pretty(&file).unwrap();
        assert_eq!(parse_settings_file(&json).unwrap(), file);
    }

    #[test]
    fn parse_accepts_bom_and_unknown_fields_and_missing_sections() {
        let text = "\u{feff}{\"kind\":\"gst-settings\",\"schema\":1,\"future\":{\"x\":1},\"settings\":{\"theme\":\"light\",\"accent\":\"red\"}}";
        let file = parse_settings_file(text.as_bytes()).unwrap();
        assert_eq!(file.settings.theme.as_deref(), Some("light"));
        assert!(file.focused.is_empty() && file.hidden.is_empty());
    }

    #[test]
    fn parse_rejects_wrong_kind_schema_or_shape() {
        for text in [
            "not json",
            "{}",
            "{\"kind\":\"other\",\"schema\":1}",
            "{\"kind\":\"gst-settings\",\"schema\":2}",
            "{\"kind\":\"gst-settings\",\"schema\":\"1\"}",
            "{\"kind\":\"gst-settings\",\"schema\":1,\"focused\":\"Code.exe\"}",
            "[1,2]",
        ] {
            assert_eq!(
                parse_settings_file(text.as_bytes()),
                Err("settings_import_invalid".to_string()),
                "{text}"
            );
        }
    }

    #[test]
    fn read_settings_import_caps_the_size() {
        let dir = TempDir::new().unwrap();
        let big = dir.path().join("big.json");
        std::fs::write(&big, vec![b' '; SETTINGS_IMPORT_MAX_BYTES as usize + 1]).unwrap();
        assert_eq!(
            read_settings_import(&big),
            Err("settings_import_too_large".to_string())
        );
        let exact = dir.path().join("exact.json");
        std::fs::write(&exact, vec![b' '; SETTINGS_IMPORT_MAX_BYTES as usize]).unwrap();
        assert_eq!(
            read_settings_import(&exact).unwrap().len(),
            SETTINGS_IMPORT_MAX_BYTES as usize
        );
    }

    #[test]
    fn plan_lists_only_changed_valid_settings() {
        let (_db, store) = migrated_store();
        store.set_setting_value(THEME_SETTING_KEY, "dark").unwrap();
        let mut file = file_with(vec![], vec![]);
        file.settings = SettingsSection {
            theme: Some("light".to_string()),
            duration_format: Some("decimal_hours".to_string()),
            close_behavior: Some("sideways".to_string()),
        };

        let plan = plan_settings_import(&store, &file).unwrap();

        assert_eq!(
            plan.setting_changes(),
            vec![SettingChange {
                key: "theme".to_string(),
                from: "dark".to_string(),
                to: "light".to_string(),
            }]
        );
    }

    #[test]
    fn plan_matches_by_key_then_process_name_and_counts_unmatched_and_conflicts() {
        let (_db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        let excel = software(&store, "EXCEL.EXE");
        let drive = software(&store, "OneDrive.exe");
        let snip = software(&store, "Snipaste.exe");
        store
            .add_hidden_software_identities(std::slice::from_ref(&drive))
            .unwrap();
        store
            .add_focused_software_identities(std::slice::from_ref(&snip))
            .unwrap();

        let file = file_with(
            vec![
                entry(&code, "Code.exe"),
                entry("other-machine-key", "excel.exe"),
                entry("gone", "Gone.exe"),
                entry(&drive, "OneDrive.exe"),
                entry(&snip, "Snipaste.exe"),
                entry(&code, "Code.exe"),
            ],
            vec![entry("", "")],
        );

        let plan = plan_settings_import(&store, &file).unwrap();

        assert_eq!(plan.focused_keys, vec![code, excel]);
        assert!(plan.hidden_keys.is_empty());
        assert_eq!(plan.unmatched, 2);
        assert_eq!(plan.conflicts, 1);
        let preview = plan.preview("id-1".to_string());
        assert_eq!(preview.import_id, "id-1");
        assert_eq!((preview.focused_added, preview.hidden_added), (2, 0));
    }

    #[test]
    fn identity_in_both_file_lists_is_a_conflict_on_each() {
        let (_db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        let file = file_with(
            vec![entry(&code, "Code.exe")],
            vec![entry(&code, "Code.exe")],
        );
        let plan = plan_settings_import(&store, &file).unwrap();
        assert!(plan.focused_keys.is_empty() && plan.hidden_keys.is_empty());
        assert_eq!(plan.conflicts, 2);
    }

    #[test]
    fn apply_merges_lists_and_settings_without_removing_local_entries() {
        let (_db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        let excel = software(&store, "EXCEL.EXE");
        let typora = software(&store, "Typora.exe");
        let drive = software(&store, "OneDrive.exe");
        store
            .add_focused_software_identities(std::slice::from_ref(&typora))
            .unwrap();
        let mut file = file_with(
            vec![entry(&code, "Code.exe"), entry(&excel, "EXCEL.EXE")],
            vec![entry(&drive, "OneDrive.exe"), entry(&typora, "Typora.exe")],
        );
        file.settings.duration_format = Some("hours_minutes".to_string());
        file.settings.close_behavior = Some("exit".to_string());

        let result = apply_settings_file(&store, &file).unwrap();

        assert_eq!(
            result,
            SettingsImportResult {
                focused_added: 2,
                hidden_added: 1,
                unmatched: 0,
                conflicts: 1,
            }
        );
        let focused = store.focused_software_identity_keys().unwrap();
        assert_eq!(focused.len(), 3);
        assert!(focused.contains(&typora));
        // The file's order is kept on screen (newest first).
        let code_at = focused.iter().position(|key| *key == code).unwrap();
        let excel_at = focused.iter().position(|key| *key == excel).unwrap();
        assert!(code_at < excel_at, "{focused:?}");
        assert_eq!(store.hidden_software_identity_keys().unwrap(), vec![drive]);
        assert_eq!(
            store
                .setting_value(DURATION_FORMAT_SETTING_KEY)
                .unwrap()
                .as_deref(),
            Some("hours_minutes")
        );
        assert_eq!(
            store
                .setting_value(CLOSE_BEHAVIOR_SETTING_KEY)
                .unwrap()
                .as_deref(),
            Some("exit")
        );

        // A second apply of the same file changes nothing.
        let again = apply_settings_file(&store, &file).unwrap();
        assert_eq!((again.focused_added, again.hidden_added), (0, 0));
    }

    #[test]
    fn pending_import_is_single_use_and_replaced_by_a_newer_one() {
        let session = ExportSession::default();
        let first = session.stash_import(file_with(vec![], vec![]));
        let second = session.stash_import(file_with(vec![], vec![]));
        assert_ne!(first, second);
        assert!(session.take_import(&first).is_none());
        assert!(session.take_import(&second).is_some());
        assert!(session.take_import(&second).is_none());
    }

    #[test]
    fn saved_paths_are_remembered_exactly() {
        let session = ExportSession::default();
        session.remember_saved(r"C:\Users\demo\Downloads\GST-日报-2026-11-24.csv");
        assert!(session.was_saved(r"C:\Users\demo\Downloads\GST-日报-2026-11-24.csv"));
        assert!(!session.was_saved(r"C:\Windows\System32\cmd.exe"));
    }

    #[test]
    fn text_exports_start_with_a_bom() {
        assert_eq!(with_utf8_bom("a,b\r\n"), b"\xEF\xBB\xBFa,b\r\n".to_vec());
    }

    #[test]
    fn file_names_and_extensions_are_sanitized() {
        assert_eq!(
            sanitize_file_name("GST-统计-2026-11-01至2026-11-24.csv"),
            "GST-统计-2026-11-01至2026-11-24.csv"
        );
        assert_eq!(
            sanitize_file_name(r"..\..\evil:name?.csv"),
            "_.._evil_name_.csv"
        );
        assert_eq!(sanitize_file_name("  .. "), "GST-export");
        assert!(valid_extension("csv"));
        assert!(!valid_extension(""));
        assert!(!valid_extension("c.sv"));
        assert!(!valid_extension("exe\\x"));
    }

    #[test]
    fn targets_naming_the_live_database_are_refused() {
        let dir = TempDir::new().unwrap();
        let db = dir.path().join("global-software-timer.sqlite3");
        std::fs::write(&db, b"").unwrap();
        for name in [
            "global-software-timer.sqlite3",
            "GLOBAL-SOFTWARE-TIMER.SQLITE3",
            "global-software-timer.sqlite3-wal",
        ] {
            assert_eq!(
                ensure_not_database(&dir.path().join(name), &db),
                Err("export_target_is_database".to_string()),
                "{name}"
            );
        }
        assert!(ensure_not_database(&dir.path().join("GST-数据备份-2026-11-24.db"), &db).is_ok());
        let other = TempDir::new().unwrap();
        assert!(
            ensure_not_database(&other.path().join("global-software-timer.sqlite3"), &db).is_ok()
        );
    }

    #[test]
    fn backup_writes_a_complete_copy_and_replaces_the_target() {
        let (db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        store
            .add_focused_software_identities(std::slice::from_ref(&code))
            .unwrap();
        store.set_setting_value(THEME_SETTING_KEY, "light").unwrap();
        let folder = TempDir::new().unwrap();
        let target = folder.path().join("GST-数据备份-2026-11-24.db");
        std::fs::write(&target, b"old backup").unwrap();

        backup_database(db.path(), &target).unwrap();

        let copy = Store::open_read_only(&target).unwrap();
        assert_eq!(copy.focused_software_identity_keys().unwrap(), vec![code]);
        assert_eq!(
            copy.setting_value(THEME_SETTING_KEY).unwrap().as_deref(),
            Some("light")
        );
        drop(copy);
        let leftovers: Vec<_> = std::fs::read_dir(folder.path())
            .unwrap()
            .map(|item| item.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(leftovers, vec!["GST-数据备份-2026-11-24.db".to_string()]);
        // The live database is untouched and still usable.
        assert_eq!(
            store.setting_value(THEME_SETTING_KEY).unwrap().as_deref(),
            Some("light")
        );
    }

    #[test]
    fn failed_backup_leaves_no_temporary_file() {
        let folder = TempDir::new().unwrap();
        let missing_db = folder.path().join("missing.sqlite3");
        let target = folder.path().join("backup.db");
        assert!(backup_database(&missing_db, &target).is_err());
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 0);
    }
}
