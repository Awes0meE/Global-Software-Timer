import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageJson from "../package.json";
import {
  BarChart3,
  Clock3,
  Cpu,
  History,
  LayoutDashboard,
  MonitorCog,
  Power,
  Settings,
  SquareStack,
  Trophy,
} from "lucide-react";
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
  type CloseBehavior,
  type DashboardSummary,
  type DurationFormat,
  type ThemePreference,
} from "./api";
import clockMark from "./assets/gst-clock.svg";
import { AppUsageTable } from "./components/AppUsageTable";
import { BackgroundPage } from "./components/BackgroundPage";
import { DateControl } from "./components/DateControl";
import { ExportKey } from "./components/ExportKey";
import { RecentActivity } from "./components/RecentActivity";
import { TodayMix } from "./components/TodayMix";
import { SettingsImportDialog } from "./components/SettingsImportDialog";
import { Toast } from "./components/Toast";
import { TodayReadout } from "./components/TodayReadout";
import { UnavailableTooltip } from "./components/UnavailableTooltip";
import type { StatisticsScope } from "./exports";
import { startTransparencyWatch } from "./glass";
import { pageExport } from "./pageExports";
import { applyThemePreference, readCachedThemePreference } from "./theme";
import { useExportActions } from "./useExportActions";
import { answersDay, isDayInvalidDate, useLocalToday } from "./viewedDay";
import { startVisiblePolling } from "./visiblePolling";

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
const pageWarmers: Partial<Record<PageId, () => void>> = {
  software: warmSoftwarePage,
  statistics: warmStatisticsPage,
  achievements: warmAchievementsPage,
};

const dashboardLoadError = "无法读取本地数据";
const dashboardRefreshIntervalMs = 5000;
const defaultCloseBehavior: CloseBehavior = "minimize_to_tray";
const defaultDurationFormat: DurationFormat = "decimal_hours";

type PageId = "overview" | "settings" | "software" | "background" | "statistics" | "achievements";

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
  { id: "overview", label: "概览", icon: LayoutDashboard, available: true },
  { id: "software", label: "软件", icon: SquareStack, available: true },
  { id: "background", label: "后台", icon: Cpu, available: true },
  { id: "statistics", label: "统计", icon: BarChart3, available: true },
  { id: "timeline", label: "时间轴", icon: History, available: false },
  { id: "achievements", label: "成就", icon: Trophy, available: true },
  { id: "settings", label: "设置", icon: Settings, available: true },
] as const;

const pageTitles: Record<PageId, string> = {
  overview: "概览",
  software: "软件",
  background: "后台",
  statistics: "统计",
  achievements: "成就",
  settings: "设置",
};

// 单日日期键只对按「某一天」看数据的页面有意义；软件、统计、成就有自己的时间范围，设置页不看数据。
const pagesWithDateControl: ReadonlySet<PageId> = new Set<PageId>(["overview", "background"]);

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activePage, setActivePage] = useState<PageId>("overview");
  // The day 概览 and 后台 show; null is today, so it follows midnight. Never persisted.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // The first day the header calendar offers; null until get_calendar_summary finds a record.
  const [dataStartDate, setDataStartDate] = useState<string | null>(null);
  // The 统计 page's range and 包含隐藏软件 switch, for its 导出报表 key.
  const [statisticsScope, setStatisticsScope] = useState<StatisticsScope | null>(null);
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
  useEffect(() => startTransparencyWatch(), []);

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

    setActivePage(item.id as PageId);
  };

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
      setSettingsError(null);
    } catch {
      setSettingsError("设置读取失败");
    }
    void loadDashboard();
  }, [loadDashboard]);

  const contentId = `${activePage}-content`;

  // Read again when the day changes: a fresh install gets its data start on the first recorded day.
  useEffect(() => {
    let current = true;
    getCalendarSummary()
      .then((calendar) => {
        if (current) setDataStartDate(calendar?.data_start_date ?? null);
      })
      .catch(() => {
        // Without it the calendar offers today only; the pages still load.
      });
    return () => {
      current = false;
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
    csvContext: { viewedDate, today, statistics: statisticsScope },
    beforeSettingsImport: settleSettingsWrites,
    onSettingsImported: reloadImportedSettings,
  });
  // 导出报表 waits for the 统计 page to report its range.
  const exportBusy = exports.busy || (activePage === "statistics" && statisticsScope === null);

  const recording = !liveScan.failed && liveScan.succeeded === true;
  const recordingLabel = liveScan.failed ? "记录状态未知"
    : recording ? "正在记录"
    : liveScan.succeeded === false ? "采样失败，正在重试" : "等待首次采样";

  return (
    <div className="desktop-root">
      <a className="skip-link" href={`#${contentId}`}>
        跳到内容
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <img className="brand-mark" src={clockMark} alt="" width={44} height={44} />
            <div className="brand-copy">
              <h1>{summary?.product_title ?? "全局软件计时器"}</h1>
              <small>本地软件时长记录</small>
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
                  onPointerEnter={warmPage}
                  onFocus={warmPage}
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
                <UnavailableTooltip key={item.label}>{navButton}</UnavailableTooltip>
              );
            })}
          </nav>

          <div className="sidebar-footer" aria-label="数据状态">
            <span className="live-status">
              <i className={recording ? "lamp is-lit is-breathing" : "lamp"} aria-hidden="true" />
              {recordingLabel}
            </span>
            <span>
              <i className="lamp" aria-hidden="true" />
              数据只保存在本机
            </span>
            <small className="num">V{packageJson.version}</small>
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
                  onSelect={exports.handleExport}
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
              onAutostartToggle={handleAutostartToggle}
              onCloseBehaviorToggle={handleCloseBehaviorToggle}
              onDurationFormatToggle={handleDurationFormatToggle}
              onThemeChange={handleThemeChange}
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
              <AchievementsPage durationFormat={durationFormat} />
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

      {exports.importPreview ? (
        <SettingsImportDialog
          preview={exports.importPreview}
          busy={exports.importBusy}
          onConfirm={() => void exports.confirmImport()}
          onCancel={exports.cancelImport}
        />
      ) : null}

      {closeDialogOpen ? (
        <div className="modal-backdrop">
          <section
            className="dialog close-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-dialog-title"
          >
            <img className="dialog-mark" src={clockMark} alt="" width={40} height={40} />
            <h2 id="close-dialog-title">关闭全局软件计时器</h2>
            <p>请选择退出软件，或最小化后继续在右下角状态栏运行。</p>
            <p className="dialog-hint">后续可在设置中更改。</p>
            {closeDialogError ? <p className="dialog-error">{closeDialogError}</p> : null}
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={closeChoiceBusy}
                onClick={() => void handleCloseChoice("exit")}
              >
                退出软件
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={closeChoiceBusy}
                onClick={() => void handleCloseChoice("minimize_to_tray")}
              >
                最小化到状态栏
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

interface SettingsPageProps {
  autostartBusy: boolean;
  autostartDisabled: boolean;
  autostartEnabled: boolean;
  closeBehavior: CloseBehavior;
  closeBehaviorDisabled: boolean;
  durationFormat: DurationFormat;
  durationFormatDisabled: boolean;
  error: string | null;
  theme: ThemePreference;
  themeDisabled: boolean;
  onAutostartToggle: () => void;
  onCloseBehaviorToggle: () => void;
  onDurationFormatToggle: () => void;
  onThemeChange: (theme: ThemePreference) => void;
}

function SettingsPage({
  autostartBusy,
  autostartDisabled,
  autostartEnabled,
  closeBehavior,
  closeBehaviorDisabled,
  durationFormat,
  durationFormatDisabled,
  error,
  theme,
  themeDisabled,
  onAutostartToggle,
  onCloseBehaviorToggle,
  onDurationFormatToggle,
  onThemeChange,
}: SettingsPageProps) {
  return (
    <main className="settings-page" id="settings-content">
      {error ? <div className="warning">{error}</div> : null}

      <section className="readout settings-readout" aria-labelledby="settings-status-title">
        <div className="lcd settings-lcd">
          <img src={clockMark} width="48" height="48" alt="" />
          <div className="lcd-cell">
            <h3 className="lcd-label" id="settings-status-title">本机状态</h3>
            <p>全局软件计时器</p>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">当前版本</span>
            <p>V{packageJson.version}</p>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">数据存储</span>
            <p>仅本机</p>
          </div>
        </div>
      </section>

      <section className="panel settings-group" aria-labelledby="settings-run-title">
        <h3 id="settings-run-title">运行</h3>
        <SettingSwitchRow
          checked={autostartEnabled}
          description="电脑开机后自动启动并在后台记录软件时长"
          disabled={autostartDisabled}
          icon={<Power size={18} aria-hidden="true" />}
          statusText={autostartBusy ? "保存中" : autostartEnabled ? "已开启" : "已关闭"}
          title="开机自启动"
          onToggle={onAutostartToggle}
        />
        <SettingSwitchRow
          checked={closeBehavior === "minimize_to_tray"}
          description="关闭主窗口后继续在右下角状态栏运行"
          icon={<MonitorCog size={18} aria-hidden="true" />}
          statusText={closeBehavior === "minimize_to_tray" ? "最小化到后台" : "直接退出"}
          title="关闭窗口时最小化到后台"
          disabled={closeBehaviorDisabled}
          onToggle={onCloseBehaviorToggle}
        />
      </section>

      <section className="panel settings-group" aria-labelledby="settings-display-title">
        <h3 id="settings-display-title">显示</h3>
        <SettingSwitchRow
          checked={durationFormat === "hours_minutes"}
          description="开启后将会显示具体分钟数，如“8小时35分钟”"
          disabled={durationFormatDisabled}
          icon={<Clock3 size={18} aria-hidden="true" />}
          statusText={durationFormat === "hours_minutes" ? "已开启" : "已关闭"}
          title="显示分钟数"
          onToggle={onDurationFormatToggle}
        />
        <div className="settings-row">
          <div className="settings-row-icon" aria-hidden="true">
            <ThemeGlyph />
          </div>
          <div className="settings-row-copy">
            <strong id="theme-setting-title">主题</strong>
            <span>默认跟随 Windows 的浅色或深色模式</span>
          </div>
          <div className="settings-row-control">
            <div className="segmented" role="radiogroup" aria-labelledby="theme-setting-title">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`segmented-option${theme === option.value ? " is-selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.value}
                  disabled={themeDisabled}
                  onClick={() => onThemeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel settings-group settings-privacy" aria-labelledby="settings-privacy-title">
        <h3 id="settings-privacy-title">隐私</h3>
        <p>
          软件使用记录保存在这台电脑上。GST 不上传记录，也不采集窗口标题、文档名、网页标题或键盘输入内容。
        </p>
      </section>
    </main>
  );
}

function ThemeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}

interface SettingSwitchRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  statusText: string;
  title: string;
  onToggle: () => void;
}

function SettingSwitchRow({
  checked,
  description,
  disabled = false,
  icon,
  statusText,
  title,
  onToggle,
}: SettingSwitchRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="settings-row-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="settings-row-control">
        <span className={`settings-status${checked ? " is-on" : ""}`}>{statusText}</span>
        <button
          className={`toggle${checked ? " is-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled}
          onClick={onToggle}
        >
          <span className="toggle-knob" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
