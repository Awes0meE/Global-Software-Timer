// Preview stand-ins for the export commands. Nothing touches the disk: saves
// resolve to a fake Downloads path. ?export=cancel makes every dialog cancel,
// ?export=fail makes every save fail (for the 保存失败 toast).
import type { SettingsImportPreview, SettingsImportResult } from "../../src/api";
import { formatLocalDate } from "../../src/statisticsRange";

const DOWNLOADS = "C:\\Users\\demo\\Downloads\\";
const IMPORT_ID = "preview-import";
const mode = new URLSearchParams(window.location.search).get("export");

export interface MockLists {
  settings: Record<string, unknown>;
  focused: Set<string>;
  hidden: Set<string>;
}

// The demo settings file: theme → dark, two focused (one already focused), one
// hidden, one software this machine has never seen.
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
    changes: lists.settings.theme === "dark" ? [] : [{ key: "theme", from: String(lists.settings.theme), to: "dark" }],
    focused_added: focusedAdded.length,
    hidden_added: hiddenAdded.length,
    unmatched: IMPORT_UNMATCHED,
    conflicts,
  };
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
      return { value: mode === "cancel" ? null : plan(lists) };
    case "apply_settings_import": {
      if (args.importId !== IMPORT_ID) throw "settings_import_expired";
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
    default:
      return undefined;
  }
}
