import type { AchievementsSummary, BackgroundPageSummary, SoftwarePageSummary, StatisticsSummary } from "./api";

/**
 * The last read of each page that reads on open (v0.4.8), kept for this run of the app only, so coming back
 * to a page shows what it showed last at once and swaps in the fresh read, instead of a loading line first.
 * Nothing is stored. Each read carries the request it answers; a page only reuses one that answers its own.
 */
export const pageReads: {
  software: SoftwarePageSummary | null;
  background: BackgroundPageSummary | null;
  statistics: { key: string; summary: StatisticsSummary } | null;
  achievements: { key: string; summary: AchievementsSummary } | null;
} = {
  software: null,
  background: null,
  statistics: null,
  achievements: null,
};

/** For tests: forget every page's last read. */
export function clearPageReads(): void {
  pageReads.software = null;
  pageReads.background = null;
  pageReads.statistics = null;
  pageReads.achievements = null;
}
