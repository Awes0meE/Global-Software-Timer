// Preview stand-ins for the export commands. Nothing touches the disk: saves
// resolve to a fake Downloads path. ?export=cancel makes every dialog cancel,
// ?export=fail makes every save fail (for the 保存失败 toast), ?export=invalid and
// ?export=toolarge make the settings import pick reject with that error. The
// import id is single use, like the app's. save_binary_export checks its raw body
// and name header like the app before "saving".
//
// 从备份恢复: ?restore=invalid|newer|live|space makes the backup pick reject with
// that error, ?restore=fail makes 恢复并重启 fail, and ?restore=ok (or none) previews
// the approved demo backup. The restore id is single use. ?restorestatus=restored|
// rolled_back is the one-shot status after a restart. ?export=fail also makes
// 打开数据文件夹 fail. These two params are read on every call.
import type { RestorePreview, SettingsImportKey, SettingsImportPreview, SettingsImportResult } from "../../src/api";
import { formatLocalDate } from "../../src/statisticsRange";

const DOWNLOADS = "C:\\Users\\demo\\Downloads\\";
const IMPORT_ID = "preview-import";
let pendingImport: string | null = null;
const mode = new URLSearchParams(window.location.search).get("export");

export interface MockLists {
  settings: Record<string, unknown>;
  focused: Set<string>;
  hidden: Set<string>;
}

// The demo settings file: theme → dark and six display preferences (so the
// dialog's 760 px layout shows), two focused (one already focused), one hidden,
// one software this machine has never seen. In the backend's plan order; a value
// already set is not a change.
const IMPORT_SETTINGS: readonly [key: SettingsImportKey, value: string][] = [
  ["theme", "dark"],
  ["accent", "violet"],
  ["eink", "warm"],
  ["week_start", "sunday"],
  ["start_page", "statistics"],
  ["reduce_motion", "reduce"],
  ["text_size", "large"],
];
const IMPORT_FOCUSED = ["notion", "code"];
const IMPORT_HIDDEN = ["cloudmusic"];
const IMPORT_UNMATCHED = 1;

function save(name: string): string | null {
  if (mode === "cancel") return null;
  if (mode === "fail") throw new Error("preview mock: save failed");
  return `${DOWNLOADS}${name}`;
}

function plan(lists: MockLists): SettingsImportPreview {
  const focusedAdded = IMPORT_FOCUSED.filter((key) => !lists.focused.has(key) && !lists.hidden.has(key));
  const hiddenAdded = IMPORT_HIDDEN.filter((key) => !lists.hidden.has(key) && !lists.focused.has(key));
  const conflicts =
    IMPORT_FOCUSED.filter((key) => lists.hidden.has(key)).length +
    IMPORT_HIDDEN.filter((key) => lists.focused.has(key)).length;
  return {
    import_id: IMPORT_ID,
    changes: IMPORT_SETTINGS.filter(([key, to]) => lists.settings[key] !== to).map(([key, to]) => ({
      key,
      from: String(lists.settings[key]),
      to,
    })),
    focused_added: focusedAdded.length,
    hidden_added: hiddenAdded.length,
    unmatched: IMPORT_UNMATCHED,
    conflicts,
  };
}

const RESTORE_ID = "preview-restore";
let pendingRestore: string | null = null;
let restoreStatusReported = false;
const RESTORE_PICK_ERRORS: Record<string, string> = {
  invalid: "restore_invalid",
  newer: "restore_newer",
  live: "restore_live_database",
  space: "restore_no_space",
};

const query = (name: string) => new URLSearchParams(window.location.search).get(name);

/** The backup in the approved 5-restore mock sheet. */
function restorePreview(): RestorePreview {
  return {
    restore_id: RESTORE_ID,
    file_name: "GST-数据备份-2026-11-20.db",
    first_day: "2026-05-28",
    last_day: "2026-11-20",
    software_count: 142,
    file_size_bytes: 196 * 1024 * 1024,
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_EXPORT_MAX_BYTES = 32 * 1024 * 1024;

/** save_binary_export: a raw PNG body and a percent-encoded x-gst-file-name header. */
export function saveBinaryExport(body: unknown, options?: { headers?: HeadersInit }): string | null {
  const header = new Headers(options?.headers).get("x-gst-file-name");
  let name: string | null = null;
  try {
    name = header === null ? null : decodeURIComponent(header);
  } catch {
    // Malformed percent-encoding: rejected below like the app does.
  }
  if (!(body instanceof Uint8Array) || name === null) throw "export_invalid_request";
  if (body.length > PNG_EXPORT_MAX_BYTES) throw "export_too_large";
  if (!PNG_SIGNATURE.every((byte, index) => body[index] === byte)) throw "export_not_png";
  return save(/\.png$/i.test(name) ? name : `${name || "GST-export"}.png`);
}

/** Answers an export command, or returns `undefined` for any other command. */
export function exportCommand(
  command: string,
  args: Record<string, unknown>,
  lists: MockLists,
): { value: unknown } | undefined {
  const today = formatLocalDate(new Date());
  switch (command) {
    case "save_text_export":
      return { value: save(String(args.suggestedName)) };
    case "reveal_saved_file":
      return { value: undefined };
    case "export_settings_file":
      return { value: save(`GST-设置-${today}.json`) };
    case "backup_all_data":
      return { value: save(`GST-数据备份-${today}.db`) };
    case "pick_settings_import":
      if (mode === "invalid") throw "settings_import_invalid";
      if (mode === "toolarge") throw "settings_import_too_large";
      if (mode === "cancel") return { value: null };
      pendingImport = IMPORT_ID;
      return { value: plan(lists) };
    case "apply_settings_import": {
      if (pendingImport === null || args.importId !== pendingImport) throw "settings_import_expired";
      pendingImport = null;
      const preview = plan(lists);
      for (const change of preview.changes) {
        lists.settings[change.key] = change.to;
        lists.settings[`${change.key}_configured`] = true;
      }
      IMPORT_FOCUSED.filter((key) => !lists.hidden.has(key)).forEach((key) => lists.focused.add(key));
      IMPORT_HIDDEN.filter((key) => !lists.focused.has(key)).forEach((key) => lists.hidden.add(key));
      const result: SettingsImportResult = {
        focused_added: preview.focused_added,
        hidden_added: preview.hidden_added,
        unmatched: preview.unmatched,
        conflicts: preview.conflicts,
      };
      return { value: result };
    }
    case "open_feedback_link":
      if (query("export") === "fail") throw "feedback_open_failed";
      return { value: undefined };
    case "open_data_folder":
      if (query("export") === "fail") throw "data_folder_open_failed";
      return { value: undefined };
    case "pick_restore_backup": {
      pendingRestore = null;
      const error = RESTORE_PICK_ERRORS[query("restore") ?? ""];
      if (error) throw error;
      if (query("export") === "cancel") return { value: null };
      pendingRestore = RESTORE_ID;
      return { value: restorePreview() };
    }
    case "apply_restore":
      if (pendingRestore === null || args.restoreId !== pendingRestore) throw "restore_failed";
      pendingRestore = null;
      if (query("restore") === "fail") throw "restore_failed";
      // The app exits and restarts here; the preview stays put.
      return { value: undefined };
    case "discard_restore":
      if (args.restoreId === pendingRestore) pendingRestore = null;
      return { value: undefined };
    case "get_restore_status": {
      const status = query("restorestatus");
      if (restoreStatusReported || (status !== "restored" && status !== "rolled_back")) return { value: "none" };
      restoreStatusReported = true;
      return { value: status };
    }
    default:
      return undefined;
  }
}
