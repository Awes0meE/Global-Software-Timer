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
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::HeaderMap;
use tauri::ipc::InvokeBody;
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
const EXPORT_TOO_LARGE: &str = "export_too_large";
const EXPORT_NOT_PNG: &str = "export_not_png";

/// Largest PNG `save_binary_export` accepts; a 1080×1440 poster is far smaller.
pub const PNG_EXPORT_MAX_BYTES: usize = 32 * 1024 * 1024;
/// Request header carrying the suggested file name, percent-encoded UTF-8.
pub const FILE_NAME_HEADER: &str = "x-gst-file-name";

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
    /// `identity_digest` of the local identity key, never the key itself: app
    /// keys are built from the install path, which the file must not carry.
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
    /// Settings to write: `(setting key in the file, from, to, storage key)`.
    changes: Vec<(&'static str, &'static str, &'static str, &'static str)>,
    /// Identity keys to add, in file order.
    focused_keys: Vec<String>,
    hidden_keys: Vec<String>,
    unmatched: u32,
    conflicts: u32,
}

impl ImportPlan {
    /// The settings whose shown value changes. A choice that only confirms the
    /// value shown now is still written, but is not a change to list.
    pub fn setting_changes(&self) -> Vec<SettingChange> {
        self.changes
            .iter()
            .filter(|(_, from, to, _)| from != to)
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

/// `sha256:<hex>` of an identity key. One-way, so a shared settings file holds
/// no install path or Windows user name, yet the same machine still matches
/// its own identities exactly.
pub fn identity_digest(identity_key: &str) -> String {
    let mut text = String::with_capacity(7 + 64);
    text.push_str("sha256:");
    for byte in Sha256::digest(identity_key.as_bytes()) {
        let _ = write!(text, "{byte:02x}");
    }
    text
}

/// The settings file for the current store: the settings the user chose
/// (unchosen ones are null, so an import never turns a default into a choice)
/// and both lists in their on-screen order. No autostart, no usage history, no
/// executable paths.
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
                    identity_key: identity_digest(&key),
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
            theme: settings
                .theme_configured
                .then(|| settings.theme.as_str().to_string()),
            duration_format: settings
                .duration_format_configured
                .then(|| settings.duration_format.as_str().to_string()),
            close_behavior: settings
                .close_behavior_configured
                .then(|| settings.close_behavior.as_str().to_string()),
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

/// Reads at most `SETTINGS_IMPORT_MAX_BYTES` from `path`. A file that cannot
/// be opened or read (missing, locked) is `settings_import_invalid`.
pub fn read_settings_import(path: &Path) -> Result<Vec<u8>, String> {
    let unreadable = |_| SETTINGS_IMPORT_INVALID.to_string();
    let file = std::fs::File::open(path).map_err(unreadable)?;
    let mut bytes = Vec::new();
    file.take(SETTINGS_IMPORT_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(unreadable)?;
    if bytes.len() as u64 > SETTINGS_IMPORT_MAX_BYTES {
        return Err(SETTINGS_IMPORT_TOO_LARGE.to_string());
    }
    Ok(bytes)
}

/// Matches the file against the current store without writing anything.
///
/// An entry matches a known identity whose `identity_digest` equals its
/// `identity_key`, else by `process_name` (case-insensitive; the most recently
/// seen identity wins). Unmatched entries
/// are skipped. An identity already on the opposite list locally, or listed in
/// both lists of the file, is a conflict and is skipped. Entries already on
/// their list change nothing. Settings with unknown values are ignored.
pub fn plan_settings_import(store: &Store, file: &SettingsFile) -> Result<ImportPlan, StoreError> {
    let current = app_settings_from_store(store)?;
    // A choice in the file is written whenever this store has no choice of its
    // own or a different one, even when it equals the default shown now: the
    // file only carries settings the user chose, and the choice itself matters
    // (an unchosen close behaviour still asks on the first close).
    let mut changes = Vec::new();
    let mut plan_setting = |key: &'static str,
                            storage_key: &'static str,
                            configured: bool,
                            from: &'static str,
                            to: Option<&'static str>| {
        if let Some(to) = to {
            if !configured || to != from {
                changes.push((key, from, to, storage_key));
            }
        }
    };
    plan_setting(
        "theme",
        THEME_SETTING_KEY,
        current.theme_configured,
        current.theme.as_str(),
        file.settings
            .theme
            .as_deref()
            .and_then(ThemePreference::from_setting)
            .map(ThemePreference::as_str),
    );
    plan_setting(
        "duration_format",
        DURATION_FORMAT_SETTING_KEY,
        current.duration_format_configured,
        current.duration_format.as_str(),
        file.settings
            .duration_format
            .as_deref()
            .and_then(DurationFormat::from_setting)
            .map(DurationFormat::as_str),
    );
    plan_setting(
        "close_behavior",
        CLOSE_BEHAVIOR_SETTING_KEY,
        current.close_behavior_configured,
        current.close_behavior.as_str(),
        file.settings
            .close_behavior
            .as_deref()
            .and_then(CloseBehavior::from_setting)
            .map(CloseBehavior::as_str),
    );

    let identities = store.software_identity_names()?;
    let by_digest: HashMap<String, &str> = identities
        .iter()
        .map(|(key, _, _)| (identity_digest(key), key.as_str()))
        .collect();
    // Identities come newest first, so the first one per process name wins.
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
            let key = if let Some(key) = by_digest.get(entry.identity_key.trim()) {
                Some(*key)
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
    let cleaned = cap_file_name(cleaned.trim_matches(|ch| ch == '.' || ch == ' '));
    if cleaned.is_empty() {
        "GST-export".to_string()
    } else {
        cleaned
    }
}

/// Longest suggested file name in UTF-16 units, well below Windows' 255 per
/// path component even after `png_file_name` appends `.png`.
pub const MAX_FILE_NAME_UTF16: usize = 200;

/// Cuts an over-long name on a character boundary to `MAX_FILE_NAME_UTF16`,
/// keeping a short extension such as `.csv` or `.png`.
fn cap_file_name(name: &str) -> String {
    let units = |text: &str| text.encode_utf16().count();
    if units(name) <= MAX_FILE_NAME_UTF16 {
        return name.to_string();
    }
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) if valid_extension(extension) => (stem, &name[stem.len()..]),
        _ => (name, ""),
    };
    let budget = MAX_FILE_NAME_UTF16 - extension.len();
    let mut used = 0;
    let cut: String = stem
        .chars()
        .take_while(|ch| {
            used += ch.len_utf16();
            used <= budget
        })
        .collect();
    format!("{}{extension}", cut.trim_end_matches(['.', ' ']))
}

/// Extensions are short ASCII alphanumerics such as `csv`.
pub fn valid_extension(extension: &str) -> bool {
    (1..=10).contains(&extension.len()) && extension.chars().all(|ch| ch.is_ascii_alphanumeric())
}

/// Strictly decodes `encodeURIComponent` output: every `%` starts a two-digit
/// hex escape, and the bytes must be UTF-8.
pub fn percent_decode_utf8(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let hex = |byte: u8| char::from(byte).to_digit(16);
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = hex(*bytes.get(index + 1)?)?;
            let low = hex(*bytes.get(index + 2)?)?;
            decoded.push(u8::try_from(high * 16 + low).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/// A sanitized file name ending in `.png` (any case), added when missing.
pub fn png_file_name(name: &str) -> String {
    let name = sanitize_file_name(name);
    if name.to_lowercase().ends_with(".png") {
        name
    } else {
        format!("{name}.png")
    }
}

/// Size cap first, then the 8-byte PNG signature.
pub fn check_png_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > PNG_EXPORT_MAX_BYTES {
        return Err(EXPORT_TOO_LARGE.to_string());
    }
    if !bytes.starts_with(crate::native_icon::PNG_SIGNATURE) {
        return Err(EXPORT_NOT_PNG.to_string());
    }
    Ok(())
}

/// Validates a `save_binary_export` call before any dialog opens: a raw body,
/// a decodable file-name header, at most `PNG_EXPORT_MAX_BYTES`, a PNG.
/// Returns the suggested file name and the PNG bytes.
pub fn png_export_request<'a>(
    body: &'a InvokeBody,
    headers: &HeaderMap,
) -> Result<(String, &'a [u8]), String> {
    let InvokeBody::Raw(bytes) = body else {
        return Err(EXPORT_INVALID_REQUEST.to_string());
    };
    let name = headers
        .get(FILE_NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(percent_decode_utf8)
        .ok_or_else(|| EXPORT_INVALID_REQUEST.to_string())?;
    check_png_bytes(bytes)?;
    Ok((png_file_name(&name), bytes))
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

/// Builds a temporary sibling of `target` with `fill`, then renames it over
/// `target`, so a failure part-way never truncates an existing file there.
/// The temporary file is removed on any error.
fn replace_via_temporary(
    target: &Path,
    prefix: &str,
    fill: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let folder = target.parent().unwrap_or(Path::new("."));
    let temp = folder.join(format!(".{prefix}-{}.tmp", uuid::Uuid::new_v4()));
    let result = fill(&temp)
        .and_then(|()| std::fs::rename(&temp, target).map_err(|error| error.to_string()));
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

/// Writes `bytes` to `target` through a temporary sibling and a rename.
pub fn write_file_replacing(target: &Path, bytes: &[u8]) -> Result<(), String> {
    replace_via_temporary(target, "gst-export", |temp| {
        std::fs::write(temp, bytes).map_err(|error| error.to_string())
    })
}

/// `VACUUM INTO` a temporary file next to `target`, then renames it over
/// `target`. The live database file is only read.
pub fn backup_database(db_path: &Path, target: &Path) -> Result<(), String> {
    ensure_not_database(target, db_path)?;
    replace_via_temporary(target, "gst-backup", |temp| {
        let store = Store::open_read_only(db_path).map_err(|error| error.to_string())?;
        store.vacuum_into(temp).map_err(|error| error.to_string())
    })
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
        write_file_replacing(&path, &with_utf8_bom(&contents))?;
        let saved = path_string(&path);
        state.export_session.remember_saved(&saved);
        Ok(Some(saved))
    })
    .await
}

/// Saves a PNG sent as the raw IPC body, with the suggested file name in the
/// `x-gst-file-name` header; returns the saved path, `None` when cancelled.
#[tauri::command]
pub async fn save_binary_export(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    let (suggested_name, bytes) = png_export_request(request.body(), request.headers())?;
    let bytes = bytes.to_vec();
    blocking(move || {
        let Some(path) = pick_save_path(&app, &suggested_name, "PNG 图片", "png") else {
            return Ok(None);
        };
        let state = app.state::<AppState>();
        ensure_not_database(&path, &state.db_path)?;
        write_file_replacing(&path, &bytes)?;
        let saved = path_string(&path);
        state.export_session.remember_saved(&saved);
        Ok(Some(saved))
    })
    .await
}

/// The Windows directory's `explorer.exe` by absolute path, so an
/// `explorer.exe` next to the app is never the one that runs.
fn explorer_path() -> PathBuf {
    explorer_path_in(
        std::env::var_os("SystemRoot")
            .or_else(|| std::env::var_os("windir"))
            .map(PathBuf::from),
    )
}

fn explorer_path_in(windows_dir: Option<PathBuf>) -> PathBuf {
    windows_dir
        .filter(|dir| dir.is_absolute())
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join("explorer.exe")
}

/// Opens Explorer with the file selected, only for a path saved this session.
#[tauri::command(async)]
pub fn reveal_saved_file(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    if !state.export_session.was_saved(&path) {
        return Err(EXPORT_UNKNOWN_PATH.to_string());
    }
    let mut command = std::process::Command::new(explorer_path());
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
        write_file_replacing(&path, json.as_bytes())?;
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

    /// A file entry as `build_settings_file` writes it for `identity_key`.
    fn entry(identity_key: &str, process_name: &str) -> SettingsListEntry {
        SettingsListEntry {
            identity_key: identity_digest(identity_key),
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

    /// A second connection to the store's file, for test-only schema tweaks.
    fn raw_connection(db: &NamedTempFile) -> rusqlite::Connection {
        rusqlite::Connection::open(db.path()).expect("raw connection")
    }

    #[test]
    fn settings_file_holds_chosen_settings_and_lists_without_paths() {
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
        // Never chosen: left out (null), so an import keeps the target's choice.
        assert_eq!(file.settings.duration_format, None);
        assert_eq!(file.settings.close_behavior, None);
        assert!(json["settings"]["close_behavior"].is_null());
        let focused: Vec<_> = file
            .focused
            .iter()
            .map(|item| item.identity_key.clone())
            .collect();
        assert_eq!(focused.len(), 2);
        assert!(focused.contains(&identity_digest(&code)));
        assert!(focused.contains(&identity_digest(&excel)));
        assert_eq!(file.hidden.len(), 1);
        assert_eq!(file.hidden[0].identity_key, identity_digest(&drive));
        assert_eq!(file.hidden[0].process_name, "onedrive.exe");
        // The identity keys are install paths; none of them reaches the file.
        assert!(code.contains("fixtures"), "{code}");
        let text = serde_json::to_string(&file).unwrap().to_lowercase();
        assert!(
            !text.contains("fixtures") && !text.contains(":\\\\"),
            "{text}"
        );
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
    fn an_unreadable_import_file_is_invalid() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            read_settings_import(&dir.path().join("missing.json")),
            Err("settings_import_invalid".to_string())
        );
        assert_eq!(
            read_settings_import(dir.path()),
            Err("settings_import_invalid".to_string())
        );
    }

    #[cfg(windows)]
    #[test]
    fn explorer_runs_from_the_windows_directory() {
        assert_eq!(
            explorer_path_in(Some(PathBuf::from(r"D:\Windows"))),
            PathBuf::from(r"D:\Windows\explorer.exe")
        );
        assert_eq!(
            explorer_path_in(Some(PathBuf::from("Windows"))),
            PathBuf::from(r"C:\Windows\explorer.exe")
        );
        assert_eq!(
            explorer_path_in(None),
            PathBuf::from(r"C:\Windows\explorer.exe")
        );
        assert!(explorer_path().is_absolute());
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
    fn an_imported_choice_equal_to_the_default_is_still_recorded() {
        let (_db, store) = migrated_store();
        let before = app_settings_from_store(&store).unwrap();
        assert!(!before.close_behavior_configured);
        let mut file = file_with(vec![], vec![]);
        file.settings = SettingsSection {
            theme: Some(before.theme.as_str().to_string()),
            duration_format: None,
            close_behavior: Some(before.close_behavior.as_str().to_string()),
        };

        // Nothing on screen changes, so the preview lists no setting rows...
        assert!(plan_settings_import(&store, &file)
            .unwrap()
            .setting_changes()
            .is_empty());
        apply_settings_file(&store, &file).unwrap();

        // ...but the file's choices are now the user's choices here too.
        let after = app_settings_from_store(&store).unwrap();
        assert!(after.close_behavior_configured);
        assert_eq!(after.close_behavior, before.close_behavior);
        assert!(after.theme_configured);
        assert!(!after.duration_format_configured);
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
    fn identity_digest_is_stable_and_one_way() {
        assert_eq!(
            identity_digest("known:wps-office"),
            identity_digest("known:wps-office")
        );
        assert_ne!(identity_digest("app:a"), identity_digest("app:b"));
        let digest = identity_digest(r"app:c:\users\demo\code.exe");
        assert!(digest.starts_with("sha256:") && digest.len() == 7 + 64);
        assert!(!digest.contains("demo"));
        // SHA-256 of the empty string, so the format never drifts.
        assert_eq!(
            identity_digest(""),
            "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn a_raw_identity_key_in_the_file_matches_only_by_process_name() {
        let (_db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        let mut raw = entry(&code, "");
        raw.identity_key = code.clone();
        let plan = plan_settings_import(&store, &file_with(vec![raw], vec![])).unwrap();
        assert!(plan.focused_keys.is_empty());
        assert_eq!(plan.unmatched, 1);
    }

    #[test]
    fn process_name_fallback_picks_the_most_recently_seen_identity() {
        let (db, store) = migrated_store();
        let identity = |path: &str| {
            let app_id = store.upsert_app("Code.exe", path, "Code.exe").unwrap().id;
            store
                .upsert_software_identity_for_app(app_id)
                .unwrap()
                .identity_key
        };
        let old = identity(r"X:\Old\Code\Code.exe");
        let new = identity(r"Y:\New\Code\Code.exe");
        assert_ne!(old, new);
        let raw = raw_connection(&db);
        for (key, seen) in [(&new, "2026-11-20 10:00:00"), (&old, "2026-11-01 10:00:00")] {
            raw.execute(
                "UPDATE software_identities SET last_seen_at = ?1 WHERE identity_key = ?2",
                rusqlite::params![seen, key],
            )
            .unwrap();
        }

        let file = file_with(vec![entry("other-machine", "code.exe")], vec![]);
        let plan = plan_settings_import(&store, &file).unwrap();

        assert_eq!(plan.focused_keys, vec![new]);
    }

    #[test]
    fn a_failed_apply_rolls_back_the_settings_and_list_writes() {
        let (db, store) = migrated_store();
        let code = software(&store, "Code.exe");
        let drive = software(&store, "OneDrive.exe");
        store.set_setting_value(THEME_SETTING_KEY, "dark").unwrap();
        // Fails the last write of the apply: the hidden-list insert.
        raw_connection(&db)
            .execute_batch(
                "CREATE TRIGGER fail_hidden_insert BEFORE INSERT ON hidden_software_identities
                 BEGIN SELECT RAISE(ABORT, 'forced failure'); END;",
            )
            .unwrap();
        let mut file = file_with(
            vec![entry(&code, "Code.exe")],
            vec![entry(&drive, "OneDrive.exe")],
        );
        file.settings.theme = Some("light".to_string());

        assert!(apply_settings_file(&store, &file).is_err());

        assert_eq!(
            store.setting_value(THEME_SETTING_KEY).unwrap().as_deref(),
            Some("dark")
        );
        assert!(store.focused_software_identity_keys().unwrap().is_empty());
        assert!(store.hidden_software_identity_keys().unwrap().is_empty());
    }

    #[test]
    fn importing_a_file_without_chosen_settings_keeps_the_local_choices() {
        let (_db, source) = migrated_store();
        let file = build_settings_file(&source, "0.4.1", "now").unwrap();
        let (_target_db, target) = migrated_store();
        target
            .set_setting_value(CLOSE_BEHAVIOR_SETTING_KEY, "exit")
            .unwrap();

        let plan = plan_settings_import(&target, &file).unwrap();
        assert!(plan.setting_changes().is_empty());
        apply_settings_file(&target, &file).unwrap();

        assert_eq!(
            target
                .setting_value(CLOSE_BEHAVIOR_SETTING_KEY)
                .unwrap()
                .as_deref(),
            Some("exit")
        );
        assert_eq!(target.setting_value(THEME_SETTING_KEY).unwrap(), None);
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

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    fn name_header(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(FILE_NAME_HEADER, value.parse().unwrap());
        headers
    }

    fn png_body(extra: usize) -> InvokeBody {
        let mut bytes = PNG.to_vec();
        bytes.resize(PNG.len() + extra, 0);
        InvokeBody::Raw(bytes)
    }

    #[test]
    fn file_name_headers_are_strictly_percent_decoded() {
        // encodeURIComponent("GST-成就-VS Code-2026-11-20.png")
        assert_eq!(
            percent_decode_utf8("GST-%E6%88%90%E5%B0%B1-VS%20Code-2026-11-20.png").as_deref(),
            Some("GST-成就-VS Code-2026-11-20.png")
        );
        assert_eq!(percent_decode_utf8("a%2Fb%3a%25").as_deref(), Some("a/b:%"));
        assert_eq!(percent_decode_utf8("").as_deref(), Some(""));
        for bad in ["%", "%4", "%zz", "%+1", "%E6%88", "%FF", "a%2"] {
            assert_eq!(percent_decode_utf8(bad), None, "{bad}");
        }
    }

    #[test]
    fn png_file_names_are_sanitized_and_end_in_png() {
        assert_eq!(
            png_file_name("GST-日报-2026-11-25.png"),
            "GST-日报-2026-11-25.png"
        );
        assert_eq!(
            png_file_name("GST-日报-2026-11-25.PNG"),
            "GST-日报-2026-11-25.PNG"
        );
        assert_eq!(
            png_file_name("GST-成就-Node.js-2026-11-20"),
            "GST-成就-Node.js-2026-11-20.png"
        );
        assert_eq!(png_file_name(r"..\a/b:c?.png"), "_a_b_c_.png");
        assert_eq!(png_file_name(""), "GST-export.png");
    }

    #[test]
    fn over_long_file_names_are_cut_on_a_char_boundary_keeping_the_extension() {
        let units = |text: &str| text.encode_utf16().count();
        let short = format!("GST-成就-{}-2026-11-20.png", "名".repeat(10));
        assert_eq!(png_file_name(&short), short);

        let long = format!("GST-成就-{}-2026-11-20.png", "名".repeat(400));
        let capped = png_file_name(&long);
        assert_eq!(units(&capped), MAX_FILE_NAME_UTF16);
        assert!(capped.starts_with("GST-成就-名名"));
        assert!(capped.ends_with("名.png"));

        // Without an extension, png_file_name appends one after the cap.
        let bare = png_file_name(&"a".repeat(300));
        assert_eq!(bare, format!("{}.png", "a".repeat(MAX_FILE_NAME_UTF16)));

        // A surrogate pair is never split, and a CSV keeps its extension.
        let emoji = sanitize_file_name(&format!("{}.csv", "😀".repeat(150)));
        assert!(units(&emoji) <= MAX_FILE_NAME_UTF16);
        assert_eq!(emoji, format!("{}.csv", "😀".repeat(98)));

        // Trailing dots or spaces left by the cut are trimmed.
        let dotted = sanitize_file_name(&format!("{}. .x{}", "a".repeat(197), "b".repeat(50)));
        assert_eq!(dotted, "a".repeat(197));
    }

    #[test]
    fn png_bytes_are_capped_at_32_mib_and_need_the_signature() {
        let mut at_cap = PNG.to_vec();
        at_cap.resize(PNG_EXPORT_MAX_BYTES, 0);
        assert_eq!(check_png_bytes(&at_cap), Ok(()));
        at_cap.push(0);
        assert_eq!(
            check_png_bytes(&at_cap),
            Err("export_too_large".to_string())
        );
        assert_eq!(check_png_bytes(PNG), Ok(()));
        for bytes in [
            &b""[..],
            b"\x89PNG\r\n\x1a",
            b"GIF89a....",
            b"\x89PNG\r\n\x1a\x0b",
        ] {
            assert_eq!(check_png_bytes(bytes), Err("export_not_png".to_string()));
        }
    }

    #[test]
    fn png_export_requests_need_a_raw_body_and_a_valid_name_header() {
        let headers = name_header("GST-%E6%97%A5%E6%8A%A5-2026-11-25");
        let body = png_body(4);
        let (name, bytes) = png_export_request(&body, &headers).unwrap();
        assert_eq!(name, "GST-日报-2026-11-25.png");
        assert_eq!(bytes.len(), PNG.len() + 4);

        let json = InvokeBody::Json(serde_json::json!({ "bytes": [137, 80, 78, 71] }));
        assert_eq!(
            png_export_request(&json, &headers),
            Err("export_invalid_request".to_string())
        );
        assert_eq!(
            png_export_request(&body, &HeaderMap::new()),
            Err("export_invalid_request".to_string())
        );
        assert_eq!(
            png_export_request(&body, &name_header("%E6%88")),
            Err("export_invalid_request".to_string())
        );
        // A raw non-ASCII header value is not what encodeURIComponent sends.
        let mut raw_name = HeaderMap::new();
        raw_name.insert(
            FILE_NAME_HEADER,
            tauri::http::HeaderValue::from_bytes("日报.png".as_bytes()).unwrap(),
        );
        assert_eq!(
            png_export_request(&body, &raw_name),
            Err("export_invalid_request".to_string())
        );
        assert_eq!(
            png_export_request(&InvokeBody::Raw(b"not a png".to_vec()), &headers),
            Err("export_not_png".to_string())
        );
        assert_eq!(
            png_export_request(&png_body(PNG_EXPORT_MAX_BYTES), &headers),
            Err("export_too_large".to_string())
        );
    }

    #[test]
    fn replacing_a_file_swaps_in_the_new_contents_and_leaves_no_temporary_file() {
        let folder = TempDir::new().unwrap();
        let target = folder.path().join("GST-日报-2026-11-24.csv");
        std::fs::write(&target, b"old export").unwrap();

        write_file_replacing(&target, b"new export").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"new export".to_vec());
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_failed_replace_keeps_the_old_target_and_leaves_no_temporary_file() {
        let folder = TempDir::new().unwrap();
        // A folder in the way: the temporary file is written, the rename fails.
        let target = folder.path().join("GST-日报-2026-11-24.csv");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("keep.txt"), b"keep").unwrap();

        assert!(write_file_replacing(&target, b"new export").is_err());

        assert_eq!(
            std::fs::read(target.join("keep.txt")).unwrap(),
            b"keep".to_vec()
        );
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
        let missing = folder.path().join("missing").join("GST.csv");
        assert!(write_file_replacing(&missing, b"x").is_err());
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
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
