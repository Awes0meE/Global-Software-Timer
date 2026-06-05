import { pinyin } from "pinyin-pro";

export type SoftwareMark = "none" | "focused" | "hidden";

export interface SearchableSoftwareRow {
  identity_key: string;
  display_name: string;
  process_name?: string;
  mark: SoftwareMark;
  last_opened_at: string | null;
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

interface RankedRow<T extends SearchableSoftwareRow> {
  row: T;
  score: number;
  lastOpened: number;
  index: number;
}

const FUZZY_SCORE = 6;
const NO_MATCH = Number.POSITIVE_INFINITY;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const BUILT_IN_ALIAS_ENTRIES = [
  {
    keys: ["wechat", "wechat.exe", "weixin", "微信"],
    aliases: ["微信", "weixin", "wx", "wechat"],
  },
  {
    keys: ["qq", "qq.exe", "腾讯qq"],
    aliases: ["腾讯qq", "tencent qq", "qq"],
  },
  {
    keys: ["visual studio code", "code.exe", "vscode", "vs code"],
    aliases: ["vscode", "vs code", "code", "visual studio code"],
  },
  {
    keys: ["chrome", "chrome.exe", "google chrome", "谷歌浏览器"],
    aliases: ["google chrome", "chrome", "谷歌浏览器"],
  },
  {
    keys: ["microsoft edge", "msedge.exe", "edge", "微软edge"],
    aliases: ["edge", "msedge", "microsoft edge", "微软edge"],
  },
  {
    keys: ["wps office", "wps.exe", "wpspdf.exe", "known:wps-office"],
    aliases: ["wps", "wps office", "金山办公", "金山文档"],
  },
  {
    keys: ["steam", "steam.exe", "蒸汽平台"],
    aliases: ["steam", "蒸汽平台"],
  },
];

export function rankSoftwareRows<T extends SearchableSoftwareRow>(rows: T[], query: string): T[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return rows
      .map((row, index) => ({ row, index }))
      .sort(
        (left, right) => compareRowsByLastOpened(left.row, right.row) || left.index - right.index,
      )
      .map((item) => item.row);
  }

  return rows
    .map<RankedRow<T>>((item, index) => ({
      row: item,
      score: scoreRow(item, normalizedQuery),
      lastOpened: lastOpenedTimestamp(item.last_opened_at),
      index,
    }))
    .filter((item) => item.score !== NO_MATCH)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.lastOpened !== right.lastOpened) {
        return right.lastOpened - left.lastOpened;
      }

      return left.index - right.index;
    })
    .map((item) => item.row);
}

export function highlightDisplayName(displayName: string, query: string): HighlightSegment[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [{ text: displayName, highlighted: false }];
  }

  const visibleName = displayName.toLocaleLowerCase();
  const matchIndex = visibleName.indexOf(normalizedQuery);

  if (matchIndex < 0) {
    return [{ text: displayName, highlighted: false }];
  }

  const endIndex = matchIndex + normalizedQuery.length;
  const segments: HighlightSegment[] = [];

  if (matchIndex > 0) {
    segments.push({ text: displayName.slice(0, matchIndex), highlighted: false });
  }

  segments.push({ text: displayName.slice(matchIndex, endIndex), highlighted: true });

  if (endIndex < displayName.length) {
    segments.push({ text: displayName.slice(endIndex), highlighted: false });
  }

  return segments;
}

export function formatLastOpenedAt(value: string | null, now = new Date()): string {
  if (!value) {
    return "从未打开";
  }

  const openedAt = new Date(value);

  if (Number.isNaN(openedAt.getTime())) {
    return "从未打开";
  }

  const diffMs = now.getTime() - openedAt.getTime();

  if (diffMs > -60 * 60 * 1000 && diffMs < 60 * 60 * 1000) {
    return `${Math.max(0, Math.floor(diffMs / (60 * 1000)))}分钟前`;
  }

  const diffDays = calendarDayNumber(now) - calendarDayNumber(openedAt);
  const timeText = formatLocalTime(openedAt);

  if (diffDays === 0) {
    return `今天 ${timeText}`;
  }

  if (diffDays === 1) {
    return `昨天 ${timeText}`;
  }

  if (diffDays === 2) {
    return `前天 ${timeText}`;
  }

  if (diffDays > 2 && diffDays < 14) {
    const openedWeekStart = weekStartDayNumber(openedAt);
    const currentWeekStart = weekStartDayNumber(now);

    if (openedWeekStart === currentWeekStart) {
      return `这周${formatWeekday(openedAt)}`;
    }

    if (openedWeekStart === currentWeekStart - 7) {
      return `上周${formatWeekday(openedAt)}`;
    }
  }

  return formatLocalDate(openedAt);
}

function scoreRow(row: SearchableSoftwareRow, normalizedQuery: string): number {
  const visibleName = normalizeSearchText(row.display_name);
  const processName = normalizeSearchText(row.process_name ?? "");
  const aliases = searchAliases(row);

  if (visibleName === normalizedQuery) {
    return 0;
  }

  if (processName === normalizedQuery || aliases.includes(normalizedQuery)) {
    return 1;
  }

  if (visibleName.startsWith(normalizedQuery)) {
    return 2;
  }

  if (
    (processName && processName.startsWith(normalizedQuery)) ||
    aliases.some((alias) => alias.startsWith(normalizedQuery))
  ) {
    return 3;
  }

  if (visibleName.includes(normalizedQuery)) {
    return 4;
  }

  if (
    (processName && processName.includes(normalizedQuery)) ||
    aliases.some((alias) => alias.includes(normalizedQuery))
  ) {
    return 5;
  }

  if (
    [visibleName, processName, ...aliases].some((key) =>
      isSubsequence(normalizedQuery, key),
    )
  ) {
    return FUZZY_SCORE;
  }

  return NO_MATCH;
}

function searchAliases(row: SearchableSoftwareRow): string[] {
  return uniqueSearchKeys([
    ...pinyinAliases(row.display_name),
    ...builtInAliases(row),
  ]);
}

function builtInAliases(row: SearchableSoftwareRow): string[] {
  const lookupKeys = uniqueSearchKeys([
    row.display_name,
    row.identity_key,
    row.process_name ?? "",
    stripExecutableExtension(row.process_name ?? ""),
  ]);

  return BUILT_IN_ALIAS_ENTRIES.flatMap((entry) => {
    const entryKeys = uniqueSearchKeys(entry.keys);
    const matched = entryKeys.some((key) => lookupKeys.includes(key));

    return matched ? entry.aliases.flatMap(expandAlias) : [];
  });
}

function expandAlias(alias: string): string[] {
  return [normalizeSearchText(alias), ...pinyinAliases(alias)];
}

function pinyinAliases(displayName: string): string[] {
  const fullSpelling = normalizeSearchText(
    pinyin(displayName, {
      toneType: "none",
      separator: "",
      nonZh: "removed",
    }),
  );
  const initials = normalizeSearchText(
    pinyin(displayName, {
      toneType: "none",
      pattern: "first",
      separator: "",
      nonZh: "removed",
    }),
  );

  return [fullSpelling, initials].filter((item) => item.length > 0);
}

function uniqueSearchKeys(values: string[]): string[] {
  return Array.from(
    new Set(values.map(normalizeSearchText).filter((item) => item.length > 0)),
  );
}

function stripExecutableExtension(value: string): string {
  return value.replace(/\.exe$/i, "");
}

function compareRowsByLastOpened(left: SearchableSoftwareRow, right: SearchableSoftwareRow): number {
  const leftTimestamp = lastOpenedTimestamp(left.last_opened_at);
  const rightTimestamp = lastOpenedTimestamp(right.last_opened_at);

  return leftTimestamp === rightTimestamp ? 0 : rightTimestamp - leftTimestamp;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) {
    return true;
  }

  let needleIndex = 0;

  for (const char of haystack) {
    if (char === needle[needleIndex]) {
      needleIndex += 1;
    }

    if (needleIndex === needle.length) {
      return true;
    }
  }

  return false;
}

function lastOpenedTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function formatLocalTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatWeekday(date: Date): string {
  return WEEKDAY_NAMES[date.getDay()];
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function weekStartDayNumber(date: Date): number {
  const dayNumber = calendarDayNumber(date);
  const mondayBasedDay = (date.getDay() + 6) % 7;

  return dayNumber - mondayBasedDay;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
