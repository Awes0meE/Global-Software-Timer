import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageJson from "../package.json";
import { BarChart3, Cpu, History, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Settings, SquareStack, Trophy } from "lucide-react";
import {
  applyWindowCloseChoice,
  getAppSettings,
  getAutostartEnabled,
  getCalendarSummary,
  getDashboardSummary,
  setAutostartPreference,
  setAutostartEnabled,
  setCloseBehaviorPreference,
  setDurationFormatPreference,
  setThemePreference,
  setUiPreference,
  type AppSettings,
  type CloseBehavior,
  type DashboardSummary,
  type DurationFormat,
  type MilestoneSoftware,
  type StartPage,
  type ThemePreference,
  type UiPreferenceKey,
  type UiPreferences,
} from "./api";
import { START_PAGE_NAMES } from "./appearancePresets";
import clockMark from "./assets/gst-clock.svg";
import { AppUsageTable } from "./components/AppUsageTable";
import { BackgroundPage } from "./components/BackgroundPage";
import { CloseChoiceDialog } from "./components/CloseChoiceDialog";
import { DateControl } from "./components/DateControl";
import { addLocalDays } from "./components/DayCalendar";
import { ExportKey } from "./components/ExportKey";
import { RecentActivity } from "./components/RecentActivity";
import { RestoreDialog } from "./components/RestoreDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { TodayMix } from "./components/TodayMix";
import { SettingsImportDialog } from "./components/SettingsImportDialog";
import { SettingsPage, type StartPageOption } from "./components/SettingsPage";
import { Toast } from "./components/Toast";
import { TodayReadout } from "./components/TodayReadout";
import { UnavailableTooltip, unavailableTooltipMessage } from "./components/UnavailableTooltip";
import type { StatisticsScope } from "./exports";
import { applyAppearance, readCachedAppearance, startAccentWatch } from "./appearance";
import { startTransparencyWatch } from "./glass";
import { pageExport, type ExportActionId } from "./pageExports";
import { cacheStartPage, readCachedStartPage } from "./startPage";
import { applyThemePreference, paintedTheme, readCachedThemePreference } from "./theme";
import { useExportActions } from "./useExportActions";
import { pageShortcut, useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useSidebarCollapse } from "./useSidebarCollapse";
import { useFeedbackActions } from "./useFeedbackActions";
import { useMilestoneSoftware } from "./useMilestoneSoftware";
import { useRestoreActions } from "./useRestoreActions";
import { useUpdateActions } from "./useUpdateActions";
import { answersDay, isDayInvalidDate, useLocalToday } from "./viewedDay";
import { startVisiblePolling } from "./visiblePolling";
import { WeekStartContext, weekStartFromSetting } from "./weekStart";

// Load the software search dictionary only when this route is needed.
const loadSoftwarePage = () => import("./components/SoftwarePage");
const SoftwarePage = lazy(() => loadSoftwarePage().then(({ SoftwarePage }) => ({ default: SoftwarePage })));
const warmSoftwarePage = () => { void loadSoftwarePage().catch(() => {}); };
const loadStatisticsPage = () => import("./components/StatisticsPage");
const StatisticsPage = lazy(() => loadStatisticsPage().then(({ StatisticsPage }) => ({ default: StatisticsPage })));
const warmStatisticsPage = () => { void loadStatisticsPage().catch(() => {}); };
const loadAchievementsPage = () => import("./components/AchievementsPage");
const AchievementsPage = lazy(() => loadAchievementsPage().then(({ AchievementsPage }) => ({ default: AchievementsPage })));
const warmAchievementsPage = () => { void loadAchievementsPage().catch(() => {}); };
// The 成就海报 dialog draws the posters: loaded when it first opens.
const AchievementPosterDialog = lazy(() =>
  import("./components/AchievementPosterDialog").then(({ AchievementPosterDialog }) => ({ default: AchievementPosterDialog })),
);
const pageWarmers: Partial<Record<PageId, () => void>> = {
  software: warmSoftwarePage,
  statistics: warmStatisticsPage,
  achievements: warmAchievementsPage,
};

const dashboardLoadError = "无法读取本地数据";
const dashboardRefreshIntervalMs = 5000;
const defaultCloseBehavior: CloseBehavior = "minimize_to_tray";
const defaultDurationFormat: DurationFormat = "decimal_hours";

// Every page but 设置 is a 启动时打开 option (§E): its id and label come from appearancePresets.
type PageId = StartPage | "settings";

/** The tracker's latest scan as today's live summary reports it; `failed` means that read itself failed. */
interface LiveScan {
  succeeded: boolean | null;
  failed: boolean;
}

const liveScanOf = (summary: DashboardSummary): LiveScan => ({
  succeeded: summary.last_scan_succeeded ?? null,
  failed: false,
});

const failedScan = (scan: LiveScan): LiveScan => ({ ...scan, failed: true });

const navItems = [
  { id: "overview", label: START_PAGE_NAMES.overview, icon: LayoutDashboard, available: true },
  { id: "software", label: START_PAGE_NAMES.software, icon: SquareStack, available: true },
  { id: "background", label: START_PAGE_NAMES.background, icon: Cpu, available: true },
  { id: "statistics", label: START_PAGE_NAMES.statistics, icon: BarChart3, available: true },
  { id: "timeline", label: "时间轴", icon: History, available: false },
  { id: "achievements", label: START_PAGE_NAMES.achievements, icon: Trophy, available: true },
  { id: "settings", label: "设置", icon: Settings, available: true },
] as const;

const pageTitles: Record<PageId, string> = { ...START_PAGE_NAMES, settings: "设置" };

// 启动时打开 offers the available pages but 设置, so 时间轴 joins by becoming available (§E).
const startPageOptions: StartPageOption[] = navItems
  .filter((item) => item.available && item.id !== "settings")
  .map((item) => ({ value: item.id as StartPage, label: item.label }));

const uiSaveErrors: Record<UiPreferenceKey, string> = {
  accent: "主题色保存失败",
  eink: "墨水屏配色保存失败",
  week_start: "每周起始日保存失败",
  start_page: "启动时打开保存失败",
  reduce_motion: "减少动画保存失败",
  text_size: "文字大小保存失败",
};

const uiPreferencesOf = (settings: AppSettings): UiPreferences => ({
  accent: settings.accent,
  eink: settings.eink,
  week_start: settings.week_start,
  start_page: settings.start_page,
  reduce_motion: settings.reduce_motion,
  text_size: settings.text_size,
});

/** Before settings load: the first-frame caches, so nothing flips once they arrive. */
function cachedUiPreferences(): UiPreferences {
  const appearance = readCachedAppearance();
  return {
    accent: appearance.accent,
    eink: appearance.eink,
    week_start: "monday",
    start_page: readCachedStartPage(),
    reduce_motion: appearance.motion,
    text_size: "standard",
  };
}

// 单日日期键只对按「某一天」看数据的页面有意义；软件、统计、成就有自己的时间范围，设置页不看数据。
const pagesWithDateControl: ReadonlySet<PageId> = new Set<PageId>(["overview", "background"]);

/** Pauses between retries of a failed calendar-bounds read: 5 s, doubling up to a minute. */
const calendarRetryFirstMs = 5000;
const calendarRetryMaxMs = 60000;

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  // Opens on the cached 启动时打开 page; once settings load it switches to the stored one, unless the user
  // has already gone elsewhere (§E).
  const [activePage, setActivePage] = useState<PageId>(readCachedStartPage);
  const userNavigatedRef = useRef(false);
  // The day 概览 and 后台 show; null is today, so it follows midnight. Never persisted.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // The first day the header calendar offers; null until get_calendar_summary finds a record.
  const [dataStartDate, setDataStartDate] = useState<string | null>(null);
  // The 统计 page's range and 包含隐藏软件 switch, for its 导出报表 key.
  const [statisticsScope, setStatisticsScope] = useState<StatisticsScope | null>(null);
  // The 成就 page's 包含隐藏软件 switch (null while the page is not shown), for its 导出成就 key.
  const [achievementsIncludeHidden, setAchievementsIncludeHidden] = useState<boolean | null>(null);
  const [posterDialogOpen, setPosterDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Today's live scan for the sidebar lamp; it stays live while 概览/后台 show a past day.
  const [liveScan, setLiveScan] = useState<LiveScan>({ succeeded: null, failed: false });
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [autostartLoaded, setAutostartLoaded] = useState(false);
  const [autostartEnabled, setAutostartEnabledState] = useState(true);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeDialogError, setCloseDialogError] = useState<string | null>(null);
  const [closeChoiceBusy, setCloseChoiceBusy] = useState(false);
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(defaultCloseBehavior);
  const [durationFormat, setDurationFormat] = useState<DurationFormat>(defaultDurationFormat);
  const [durationFormatBusy, setDurationFormatBusy] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(readCachedThemePreference);
  const confirmedTheme = useRef(theme);
  const themeRequest = useRef(0);
  const themeWrites = useRef(Promise.resolve());
  const [ui, setUi] = useState<UiPreferences>(cachedUiPreferences);
  const confirmedUi = useRef(ui);
  // Per key, so an older failed save never rolls back a newer choice.
  const uiRequests = useRef<Record<UiPreferenceKey, number>>({
    accent: 0,
    eink: 0,
    week_start: 0,
    start_page: 0,
    reduce_motion: 0,
    text_size: 0,
  });
  const uiWrites = useRef(Promise.resolve());
  const dashboardMountedRef = useRef(false);
  const closePreferenceRef = useRef<CloseBehavior>(defaultCloseBehavior);
  const closeBehaviorConfiguredRef = useRef(false);
  const durationFormatSaveInFlightRef = useRef(false);
  const today = useLocalToday();
  // The past day 概览 and 后台 show, or null for today (live). A picked day becomes today at midnight.
  const viewedDay = pickedDate !== null && pickedDate < today ? pickedDate : null;
  const viewedDate = viewedDay ?? today;
  // The day the latest dashboard request is for; answers for any other day are dropped.
  const dashboardDayRef = useRef<string | null>(viewedDay);
  // Settings saves still under way; a settings import waits for them so it is not overwritten afterwards.
  const pendingSettingsWrites = useRef(new Set<Promise<void>>());
  const trackSettingsWrite = useCallback((write: Promise<unknown>) => {
    const settled = write.then(
      () => undefined,
      () => undefined,
    );
    pendingSettingsWrites.current.add(settled);
    void settled.then(() => pendingSettingsWrites.current.delete(settled));
  }, []);
  const settleSettingsWrites = useCallback(async () => {
    await Promise.all(Array.from(pendingSettingsWrites.current));
  }, []);

  const loadDashboard = useCallback(async () => {
    const day = dashboardDayRef.current;
    const isCurrent = () => dashboardMountedRef.current && dashboardDayRef.current === day;

    try {
      const nextSummary = await getDashboardSummary(day ?? undefined);

      if (day === null && dashboardMountedRef.current) {
        setLiveScan(liveScanOf(nextSummary));
      }
      if (isCurrent() && answersDay(nextSummary, day)) {
        setSummary(nextSummary);
        setError(null);
      }
    } catch (reason) {
      if (day === null && dashboardMountedRef.current) {
        setLiveScan(failedScan);
      }
      if (!isCurrent()) {
        return;
      }
      if (day !== null && isDayInvalidDate(reason)) {
        // The backend no longer takes the day (the clock moved back, say): show today instead.
        setPickedDate(null);
        return;
      }
      setError(dashboardLoadError);
    }
  }, []);

  // On a past day the page is read once, but the lamp still follows today's live scan.
  const loadLiveScan = useCallback(async () => {
    try {
      const live = await getDashboardSummary();
      if (dashboardMountedRef.current) setLiveScan(liveScanOf(live));
    } catch {
      if (dashboardMountedRef.current) setLiveScan(failedScan);
    }
  }, []);

  useEffect(() => {
    dashboardMountedRef.current = true;

    return () => {
      dashboardMountedRef.current = false;
    };
  }, []);

  // Today stays live and is read again right after midnight (`today` changes); a past day is read once.
  useEffect(() => {
    dashboardDayRef.current = viewedDay;
    // A failed read for the previous day says nothing about the day being read now.
    setError(null);

    if (viewedDay !== null) {
      void loadDashboard();
      return startVisiblePolling(loadLiveScan, dashboardRefreshIntervalMs);
    }

    return startVisiblePolling(loadDashboard, dashboardRefreshIntervalMs);
  }, [viewedDay, today, loadDashboard, loadLiveScan]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      let preferredAutostart: boolean | null = null;

      try {
        const settings = await getAppSettings();
        preferredAutostart = settings.autostart_enabled;

        if (!cancelled) {
          setCloseBehavior(settings.close_behavior);
          setDurationFormat(settings.duration_format);
          confirmedTheme.current = settings.theme;
          setTheme(settings.theme);
          confirmedUi.current = uiPreferencesOf(settings);
          setUi(confirmedUi.current);
          // One switch at most, and never away from a page the user picked meanwhile.
          if (!userNavigatedRef.current) setActivePage(settings.start_page);
          closePreferenceRef.current = settings.close_behavior;
          closeBehaviorConfiguredRef.current = settings.close_behavior_configured;
        }
      } catch {
        if (!cancelled) {
          setSettingsError("设置读取失败");
          setDurationFormat(defaultDurationFormat);
          closePreferenceRef.current = defaultCloseBehavior;
          closeBehaviorConfiguredRef.current = false;
        }
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      }

      try {
        const actualAutostart = await getAutostartEnabled();

        if (cancelled) {
          return;
        }

        // Without the saved preference, show the system state instead of
        // overwriting a user's earlier choice with the default.
        if (preferredAutostart !== null && preferredAutostart !== actualAutostart) {
          await setAutostartEnabled(preferredAutostart);
        }

        if (!cancelled) {
          setAutostartEnabledState(preferredAutostart ?? actualAutostart);
        }
      } catch {
        if (!cancelled) {
          setAutostartEnabledState(preferredAutostart ?? false);
          setSettingsError("开机自启动设置失败");
        }
      } finally {
        if (!cancelled) {
          setAutostartLoaded(true);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => applyThemePreference(theme), [theme]);
  // Painted and cached on load, on every save or rollback, and after an import. The Windows pair is left
  // out, so the last one read is kept; with 跟随 Windows the watch reads it again.
  useEffect(
    () => applyAppearance({ accent: ui.accent, eink: ui.eink, motion: ui.reduce_motion }),
    [ui.accent, ui.eink, ui.reduce_motion],
  );
  useEffect(() => cacheStartPage(ui.start_page), [ui.start_page]);
  useEffect(() => startTransparencyWatch(), []);
  useEffect(() => startAccentWatch(), []);
  // The start page's lazy chunk starts loading at once.
  const startPageRef = useRef(activePage);
  useEffect(() => pageWarmers[startPageRef.current]?.(), []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const cleanup = () => {
      disposed = true;
      unlisten?.();
    };

    try {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          event.preventDefault();
          if (!closeBehaviorConfiguredRef.current) {
            setCloseDialogError(null);
            setCloseDialogOpen(true);
            return;
          }

          try {
            await applyWindowCloseChoice(closePreferenceRef.current, false);
          } catch {
            setCloseDialogError("关闭操作失败，请重试。");
            setCloseDialogOpen(true);
          }
        })
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
          } else {
            unlisten = nextUnlisten;
          }
        })
        .catch(() => {});
    } catch {
      return cleanup;
    }

    return cleanup;
  }, []);

  const handleNavClick = (item: (typeof navItems)[number]) => {
    if (!item.available) {
      return;
    }

    userNavigatedRef.current = true;
    setActivePage(item.id as PageId);
  };

  // Ctrl+1…6 follow the sidebar's available pages, Ctrl+, opens 设置, and Ctrl+← / → step the day where the
  // date key shows, stopping at the same ends as its ‹ › keys.
  const shortcutPages = navItems.filter((item) => item.available).map((item) => item.id as PageId);
  const sidebar = useSidebarCollapse();
  useKeyboardShortcuts((action) => {
    if (action.kind === "page" || action.kind === "settings") {
      const page = action.kind === "settings" ? "settings" : shortcutPages[action.index];
      if (!page) return false;
      setActivePage(page);
      return true;
    }
    if (!pagesWithDateControl.has(activePage)) return false;
    const atEnd = action.delta < 0 ? dataStartDate === null || viewedDate <= dataStartDate : viewedDate >= today;
    if (!atEnd) {
      const date = addLocalDays(viewedDate, action.delta);
      setPickedDate(date < today ? date : null);
    }
    return true;
  });

  const handleAutostartToggle = () => {
    if (autostartBusy || !autostartLoaded) {
      return;
    }

    void applyAutostartEnabled(!autostartEnabled);
  };

  const applyAutostartEnabled = async (enabled: boolean) => {
    const previous = autostartEnabled;
    setAutostartBusy(true);
    setSettingsError(null);

    try {
      await setAutostartEnabled(enabled);
      await setAutostartPreference(enabled);
      setAutostartEnabledState(enabled);
    } catch {
      try {
        await setAutostartEnabled(previous);
        await setAutostartPreference(previous);
      } catch {
        // Best-effort rollback; the visible state still returns to the last known preference.
      }
      setAutostartEnabledState(previous);
      setSettingsError("开机自启动设置失败");
    } finally {
      setAutostartBusy(false);
    }
  };

  const handleCloseBehaviorToggle = () => {
    if (!settingsLoaded) {
      return;
    }

    const previous = closeBehavior;
    const previousConfigured = closeBehaviorConfiguredRef.current;
    const next: CloseBehavior = closeBehavior === "minimize_to_tray" ? "exit" : "minimize_to_tray";
    setCloseBehavior(next);
    closePreferenceRef.current = next;
    closeBehaviorConfiguredRef.current = true;
    setSettingsError(null);

    trackSettingsWrite(
      setCloseBehaviorPreference(next).catch(() => {
        setCloseBehavior(previous);
        closePreferenceRef.current = previous;
        closeBehaviorConfiguredRef.current = previousConfigured;
        setSettingsError("关闭窗口行为保存失败");
      }),
    );
  };

  const handleDurationFormatToggle = () => {
    if (!settingsLoaded || durationFormatSaveInFlightRef.current) {
      return;
    }

    const previous = durationFormat;
    const next: DurationFormat =
      durationFormat === "decimal_hours" ? "hours_minutes" : "decimal_hours";
    durationFormatSaveInFlightRef.current = true;
    setDurationFormatBusy(true);
    setDurationFormat(next);
    setSettingsError(null);

    trackSettingsWrite(
      setDurationFormatPreference(next)
        .catch(() => {
          setDurationFormat(previous);
          setSettingsError("时间显示设置保存失败");
        })
        .finally(() => {
          durationFormatSaveInFlightRef.current = false;
          setDurationFormatBusy(false);
        }),
    );
  };

  const handleThemeChange = (next: ThemePreference) => {
    if (!settingsLoaded || next === theme) {
      return;
    }

    const request = ++themeRequest.current;
    setTheme(next);
    setSettingsError(null);

    // Serialize persistence, while applying the latest selection immediately.
    themeWrites.current = themeWrites.current.then(async () => {
      try {
        await setThemePreference(next);
        confirmedTheme.current = next;
      } catch {
        if (request === themeRequest.current) {
          setTheme(confirmedTheme.current);
          setSettingsError("主题设置保存失败");
        }
      }
    });
    trackSettingsWrite(themeWrites.current);
  };

  // 主题色, 墨水屏配色, 每周起始日, 启动时打开, 减少动画: shown at once, saved in order, rolled back on failure.
  // Saving 启动时打开 only caches it: the app opens there at its next start.
  const handleUiPreferenceChange = <K extends UiPreferenceKey>(key: K, next: UiPreferences[K]) => {
    if (!settingsLoaded || ui[key] === next) {
      return;
    }

    const request = ++uiRequests.current[key];
    setUi((current) => ({ ...current, [key]: next }));
    setSettingsError(null);

    uiWrites.current = uiWrites.current.then(async () => {
      try {
        await setUiPreference(key, next);
        confirmedUi.current = { ...confirmedUi.current, [key]: next };
      } catch {
        if (request === uiRequests.current[key]) {
          setUi((current) => ({ ...current, [key]: confirmedUi.current[key] }));
          setSettingsError(uiSaveErrors[key]);
        }
      }
    });
    trackSettingsWrite(uiWrites.current);
  };

  const handleCloseChoice = async (choice: CloseBehavior) => {
    if (closeChoiceBusy) {
      return;
    }

    const previous = closeBehavior;
    const previousConfigured = closeBehaviorConfiguredRef.current;
    setCloseChoiceBusy(true);
    setCloseDialogError(null);
    setCloseBehavior(choice);
    closePreferenceRef.current = choice;
    closeBehaviorConfiguredRef.current = true;

    try {
      await applyWindowCloseChoice(choice, true);
      setCloseDialogOpen(false);
    } catch {
      setCloseBehavior(previous);
      closePreferenceRef.current = previous;
      closeBehaviorConfiguredRef.current = previousConfigured;
      setCloseDialogError("关闭操作失败，请重试。");
      setCloseDialogOpen(true);
    } finally {
      setCloseChoiceBusy(false);
    }
  };

  // After a settings import: read the settings back, and the overview, whose hidden list may have grown.
  const reloadImportedSettings = useCallback(async () => {
    try {
      const settings = await getAppSettings();
      setCloseBehavior(settings.close_behavior);
      closePreferenceRef.current = settings.close_behavior;
      closeBehaviorConfiguredRef.current = settings.close_behavior_configured;
      setDurationFormat(settings.duration_format);
      // A theme save still in flight must not roll the imported theme back.
      themeRequest.current += 1;
      confirmedTheme.current = settings.theme;
      setTheme(settings.theme);
      // Likewise for the display preferences; the page stays where it is.
      for (const key of Object.keys(uiRequests.current) as UiPreferenceKey[]) uiRequests.current[key] += 1;
      confirmedUi.current = uiPreferencesOf(settings);
      setUi(confirmedUi.current);
      setSettingsError(null);
    } catch {
      setSettingsError("设置读取失败");
    }
    void loadDashboard();
  }, [loadDashboard]);

  const contentId = `${activePage}-content`;

  // Read again when the day changes: a fresh install gets its data start on the first recorded day.
  // A failed read (the database busy at login, say) is retried with a growing pause, so the calendar
  // does not offer today only for the rest of the day; a null start after a good read means no data yet.
  useEffect(() => {
    let current = true;
    let retry: number | undefined;
    let pauseMs = calendarRetryFirstMs;
    const read = () => {
      getCalendarSummary()
        .then((calendar) => {
          if (current) setDataStartDate(calendar?.data_start_date ?? null);
        })
        .catch(() => {
          if (!current) return;
          retry = window.setTimeout(read, pauseMs);
          pauseMs = Math.min(pauseMs * 2, calendarRetryMaxMs);
        });
    };
    read();
    return () => {
      current = false;
      window.clearTimeout(retry);
    };
  }, [today]);

  const headerExport = pageExport(activePage);
  // Until the picked day's read lands, the figures on screen are another day's: they show dimmed and
  // busy, and after a failed read only the warning shows, so the header date never heads other figures.
  const summaryIsForView = summary !== null && answersDay(summary, viewedDay);
  const shownSummary = summaryIsForView || !error ? summary : null;
  const summaryIsStale = shownSummary !== null && !summaryIsForView;
  // The wording follows the summary on screen, so labels and figures always name the same day.
  const shownPastDay = shownSummary?.is_today === false;
  const exports = useExportActions({
    context: { viewedDate, today, statistics: statisticsScope },
    beforeSettingsImport: settleSettingsWrites,
    onSettingsImported: reloadImportedSettings,
  });
  const milestones = useMilestoneSoftware(activePage === "achievements" ? achievementsIncludeHidden : null);
  const milestoneSoftware = milestones.software;
  // 导出报表 waits for the 统计 page to report its range; 导出成就 for the milestone list.
  const exportBusy =
    exports.busy ||
    (activePage === "statistics" && statisticsScope === null) ||
    (activePage === "achievements" && milestoneSoftware === null && !milestones.failed);
  // On 成就 the key is always given a value (null while usable), so it keeps its wrapper and focus.
  const exportUnavailable =
    activePage !== "achievements" ? undefined : milestoneSoftware?.length === 0 ? "暂无里程碑" : null;
  const showPosterDialog = posterDialogOpen && activePage === "achievements" && (milestoneSoftware?.length ?? 0) > 0;
  // Leaving 成就, or the list emptying, ends the dialog's visit: it must not come back by itself later.
  useEffect(() => {
    if (posterDialogOpen && !showPosterDialog) setPosterDialogOpen(false);
  }, [posterDialogOpen, showPosterDialog]);
  const { handleExport, saveAchievementPoster, showToast } = exports;
  const restore = useRestoreActions(showToast);
  const feedback = useFeedbackActions(showToast);
  const update = useUpdateActions(showToast);
  const { reload: reloadMilestones } = milestones;

  const handleHeaderExport = useCallback(
    (action: ExportActionId) => {
      if (action !== "achievements-poster") {
        handleExport(action);
        return;
      }
      if (milestoneSoftware !== null) {
        if (milestoneSoftware.length > 0) setPosterDialogOpen(true);
        return;
      }
      // The last read failed: try again before opening. A read overtaken by a newer one says nothing; that
      // one's answer updates the key.
      void reloadMilestones().then((software) => {
        if (software === "failed") showToast("无法读取成就", { tone: "error" });
        else if (software !== "superseded" && software.length > 0) setPosterDialogOpen(true);
      });
    },
    [handleExport, milestoneSoftware, reloadMilestones, showToast],
  );

  const handleSavePoster = useCallback(
    (software: MilestoneSoftware) => {
      void saveAchievementPoster(software).then((outcome) => {
        // A cancelled save dialog or a failure (toast) leaves the poster dialog open.
        if (outcome === "saved") setPosterDialogOpen(false);
      });
    },
    [saveAchievementPoster],
  );

  const recording = !liveScan.failed && liveScan.succeeded === true;
  const recordingLabel = liveScan.failed ? "记录状态未知"
    : recording ? "正在记录"
    : liveScan.succeeded === false ? "采样失败，正在重试" : "等待首次采样";

  return (
    <WeekStartContext.Provider value={weekStartFromSetting(ui.week_start)}>
      <div className="desktop-root">
        <a className="skip-link" href={`#${contentId}`}>
          跳到内容
        </a>
        <div className={`app-shell${sidebar.collapsed ? " is-rail" : ""}`}>
          <aside className="sidebar">
            <div className="brand">
              <img className="brand-mark" src={clockMark} alt="" width={44} height={44} />
              <div className="brand-copy">
                <h1>{summary?.product_title ?? "全局软件计时器"}</h1>
              </div>
            </div>

            <nav className="side-nav" aria-label="主导航">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activePage;
                const warmPage = pageWarmers[item.id as PageId];

                const navButton = (
                  <button
                    className={`nav-key${isActive ? " is-active" : ""}`}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    aria-disabled={!item.available}
                    aria-keyshortcuts={
                      item.available
                        ? pageShortcut(shortcutPages.indexOf(item.id as PageId), item.id === "settings")
                        : undefined
                    }
                    onPointerEnter={warmPage}
                    onFocus={warmPage}
                    data-label={item.available ? item.label : undefined}
                    onClick={() => handleNavClick(item)}
                  >
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.available ? null : <em aria-hidden="true">未开放</em>}
                  </button>
                );

                return item.available ? (
                  <span className="nav-key-slot" key={item.label}>
                    {navButton}
                  </span>
                ) : (
                  <UnavailableTooltip
                    key={item.label}
                    message={sidebar.collapsed ? `${item.label}：${unavailableTooltipMessage}` : unavailableTooltipMessage}
                  >
                    {navButton}
                  </UnavailableTooltip>
                );
              })}
            </nav>

            <div className="sidebar-footer" aria-label="数据状态">
              <span className="live-status">
                <i className={recording ? "lamp is-lit is-breathing" : "lamp"} aria-hidden="true" />
                {recordingLabel}
              </span>
              <div className="sidebar-foot-row">
                <small className="num">V{packageJson.version}</small>
                <button
                  className="sidebar-toggle"
                  type="button"
                  aria-label={sidebar.collapsed ? "展开侧栏" : "收起侧栏"}
                  aria-expanded={!sidebar.collapsed}
                  data-label={sidebar.collapsed ? "展开侧栏" : "收起侧栏"}
                  onClick={sidebar.toggle}
                >
                  {sidebar.collapsed ? (
                    <PanelLeftOpen size={18} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <PanelLeftClose size={18} strokeWidth={1.8} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </aside>

          <div className="workspace">
            <header className="page-header">
              <h2>{pageTitles[activePage]}</h2>
              {pagesWithDateControl.has(activePage) ? (
                <DateControl
                  value={viewedDate}
                  today={today}
                  dataStartDate={dataStartDate}
                  onChange={(date) => setPickedDate(date < today ? date : null)}
                />
              ) : null}
              <div className="window-actions">
                {headerExport ? (
                  <ExportKey
                    key={activePage}
                    label={headerExport.label}
                    icon={headerExport.icon}
                    items={headerExport.items}
                    busy={exportBusy}
                    unavailable={exportUnavailable}
                    onSelect={handleHeaderExport}
                  />
                ) : null}
              </div>
            </header>

            {activePage === "settings" ? (
              <SettingsPage
                autostartBusy={autostartBusy}
                autostartDisabled={!autostartLoaded || autostartBusy}
                autostartEnabled={autostartEnabled}
                closeBehavior={closeBehavior}
                closeBehaviorDisabled={!settingsLoaded}
                durationFormat={durationFormat}
                durationFormatDisabled={!settingsLoaded || durationFormatBusy}
                error={settingsError}
                theme={theme}
                themeDisabled={!settingsLoaded}
                ui={ui}
                uiDisabled={!settingsLoaded}
                startPageOptions={startPageOptions}
                onAutostartToggle={handleAutostartToggle}
                onCloseBehaviorToggle={handleCloseBehaviorToggle}
                onDurationFormatToggle={handleDurationFormatToggle}
                onThemeChange={handleThemeChange}
                onUiPreferenceChange={handleUiPreferenceChange}
                onOpenDataFolder={restore.openFolder}
                restorePicking={restore.picking}
                onPickRestore={() => void restore.pick()}
                onOpenFeedback={feedback.open}
                onCopyQqGroup={feedback.copyQqGroup}
                onCheckForUpdate={update.open}
              />
            ) : activePage === "software" ? (
              <Suspense fallback={<main id="software-content"><p role="status">正在读取软件列表…</p></main>}>
                <SoftwarePage
                  durationFormat={durationFormat}
                  onDefaultSummariesChanged={loadDashboard}
                />
              </Suspense>
            ) : activePage === "background" ? (
              <BackgroundPage
                date={viewedDay ?? undefined}
                durationFormat={durationFormat}
                onInvalidDate={() => setPickedDate(null)}
              />
            ) : activePage === "statistics" ? (
              <Suspense fallback={<main id="statistics-content"><p role="status">正在读取统计…</p></main>}>
                <StatisticsPage durationFormat={durationFormat} onScopeChange={setStatisticsScope} />
              </Suspense>
            ) : activePage === "achievements" ? (
              <Suspense fallback={<main id="achievements-content"><p role="status">正在读取成就…</p></main>}>
                <AchievementsPage durationFormat={durationFormat} onIncludeHiddenChange={setAchievementsIncludeHidden} />
              </Suspense>
            ) : (
              <main
                className={`overview-page${summaryIsStale ? " is-stale" : ""}`}
                id="overview-content"
                aria-busy={summaryIsStale || undefined}
              >
                {error ? <div className="warning" role="alert">{error}</div> : null}
                {shownSummary ? (
                  <>
                    <TodayReadout summary={shownSummary} durationFormat={durationFormat} />

                    <div className="overview-grid">
                      <AppUsageTable apps={shownSummary.apps} durationFormat={durationFormat} pastDay={shownPastDay} />
                      {/* Nothing runs on a past day: 当日分布 takes the whole rail. */}
                      <div className={`right-rail${shownPastDay ? " is-past" : ""}`}>
                        <TodayMix apps={shownSummary.apps} durationFormat={durationFormat} pastDay={shownPastDay} />
                        {shownPastDay ? null : (
                          <RecentActivity apps={shownSummary.apps} durationFormat={durationFormat} />
                        )}
                      </div>
                    </div>
                  </>
                ) : !error && <p role="status" className="empty-state">正在读取概览…</p>}
              </main>
            )}
          </div>
        </div>

        <Toast toast={exports.toast} onDismiss={exports.dismissToast} />

        {showPosterDialog && milestoneSoftware ? (
          <Suspense fallback={null}>
            <AchievementPosterDialog
              software={milestoneSoftware}
              theme={paintedTheme()}
              busy={exports.busy}
              onSave={handleSavePoster}
              onCancel={() => setPosterDialogOpen(false)}
            />
          </Suspense>
        ) : null}

        {exports.importPreview ? (
          <SettingsImportDialog
            preview={exports.importPreview}
            busy={exports.importBusy}
            onConfirm={() => void exports.confirmImport()}
            onCancel={exports.cancelImport}
          />
        ) : null}

        {restore.dialog ? (
          <RestoreDialog
            key={restore.dialog.kind}
            state={restore.dialog}
            busy={restore.applying}
            onConfirm={() => void restore.confirm()}
            onClose={restore.close}
          />
        ) : null}

        {update.dialog ? (
          <UpdateDialog
            key={update.dialog.kind === "consent" ? "consent" : "update"}
            state={update.dialog}
            checking={update.checking}
            onCheck={() => void update.check()}
            onInstall={() => void update.install()}
            onOpenNotes={() => feedback.open("releases")}
            onClose={update.close}
          />
        ) : null}

        {closeDialogOpen ? (
          <CloseChoiceDialog
            error={closeDialogError}
            busy={closeChoiceBusy}
            onChoose={(choice) => void handleCloseChoice(choice)}
          />
        ) : null}
      </div>
    </WeekStartContext.Provider>
  );
}
