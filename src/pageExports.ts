import { ArchiveRestore, DatabaseBackup, FileImage, FileInput, FileOutput, ImageDown, type LucideIcon } from "lucide-react";
import type { ExportKeyItem } from "./components/ExportKey";

/** What a page's export key can do; the App's export handler acts on these. */
export type ExportActionId =
  | "overview-poster"
  | "overview-csv"
  | "software-csv"
  | "background-csv"
  | "statistics-csv"
  | "statistics-daily-csv"
  | "achievements-poster"
  | "settings-export"
  | "settings-import"
  | "data-backup";

export interface PageExport {
  label: string;
  /** The key's icon (a file with a down arrow when left out). */
  icon?: LucideIcon;
  items: readonly ExportKeyItem<ExportActionId>[];
}

type ExportPageId = "overview" | "software" | "background" | "statistics" | "achievements" | "settings";

/**
 * The header export key of each page (spec v0.4.2 decision C, v0.4.3 C to E). The unavailable 时间轴 has
 * none. A one-item page acts straight from the key (成就 opens the 成就海报 dialog); the others open a menu.
 */
export const PAGE_EXPORTS: Readonly<Record<ExportPageId, PageExport>> = {
  overview: {
    label: "导出日报",
    items: [
      { id: "overview-poster", title: "日报海报", format: "PNG", icon: FileImage },
      { id: "overview-csv", title: "当日明细", format: "CSV" },
    ],
  },
  software: { label: "导出软件清单", items: [{ id: "software-csv", title: "软件清单", format: "CSV" }] },
  background: { label: "导出后台记录", items: [{ id: "background-csv", title: "后台记录", format: "CSV" }] },
  statistics: {
    label: "导出报表",
    items: [
      { id: "statistics-csv", title: "区间汇总", format: "CSV" },
      { id: "statistics-daily-csv", title: "每日明细", format: "CSV" },
    ],
  },
  achievements: {
    label: "导出成就…",
    icon: ImageDown,
    items: [{ id: "achievements-poster", title: "成就海报", format: "PNG" }],
  },
  settings: {
    label: "迁移与备份",
    icon: ArchiveRestore,
    items: [
      { id: "settings-export", title: "导出设置", format: "JSON", icon: FileOutput },
      { id: "settings-import", title: "导入设置…", icon: FileInput },
      { id: "data-backup", title: "备份全部数据", format: "DB", icon: DatabaseBackup, separatorBefore: true },
    ],
  },
};

export function pageExport(page: string): PageExport | undefined {
  return Object.prototype.hasOwnProperty.call(PAGE_EXPORTS, page) ? PAGE_EXPORTS[page as ExportPageId] : undefined;
}
