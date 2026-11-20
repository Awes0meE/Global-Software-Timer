import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageJson from "../package.json";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  Cpu,
  Download,
  History,
  LayoutDashboard,
  Menu,
  MonitorCog,
  Power,
  Settings,
  SquareStack,
} from "lucide-react";
import {
  applyWindowCloseChoice,
  getAppSettings,
  getAutostartEnabled,
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
import { RecentActivity } from "./components/RecentActivity";
import { TodayMix } from "./components/TodayMix";
import { TodayReadout } from "./components/TodayReadout";
import { UnavailableTooltip } from "./components/UnavailableTooltip";
import { applyThemePreference, readCachedThemePreference } from "./theme";
import { startVisiblePolling } from "./visiblePolling";

// Load the software search dictionary only when this route is needed.
const loadSoftwarePage = () => import("./components/SoftwarePage");
const SoftwarePage = lazy(() => loadSoftwarePage().then(({ SoftwarePage }) => ({ default: SoftwarePage })));
const warmSoftwarePage = () => { void loadSoftwarePage().catch(() => {}); };

const dashboardLoadError = "无法读取本地数据";
const dashboardRefreshIntervalMs = 5000;
const defaultCloseBehavior: CloseBehavior = "minimize_to_tray";
const defaultDurationFormat: DurationFormat = "decimal_hours";

type PageId = "overview" | "settings" | "software" | "background";

const navItems = [
  { id: "overview", label: "概览", icon: LayoutDashboard, available: true },
  { id: "software", label: "软件", icon: SquareStack, available: true },
  { id: "background", label: "后台", icon: Cpu, available: true },
  { id: "statistics", label: "统计", icon: BarChart3, available: false },
  { id: "timeline", label: "时间轴", icon: History, available: false },
  { id: "daily", label: "日报", icon: CalendarDays, available: false },
  { id: "settings", label: "设置", icon: Settings, available: true },
] as const;

const pageTitles: Record<PageId, string> = {
  overview: "概览",
  software: "软件",
  background: "后台",
  settings: "设置",
};

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activePage, setActivePage] = useState<PageId>("overview");
  const [error, setError] = useState<string | null>(null);
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

  const loadDashboard = useCallback(async () => {
    try {
      const nextSummary = await getDashboardSummary();

      if (dashboardMountedRef.current) {
        setSummary(nextSummary);
        setError(null);
      }
    } catch {
      if (dashboardMountedRef.current) {
        setError(dashboardLoadError);
      }
    }
  }, []);

  useEffect(() => {
    dashboardMountedRef.current = true;

    const stopPolling = startVisiblePolling(loadDashboard, dashboardRefreshIntervalMs);

    return () => {
      dashboardMountedRef.current = false;
      stopPolling();
    };
  }, [loadDashboard]);

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

    setCloseBehaviorPreference(next).catch(() => {
      setCloseBehavior(previous);
      closePreferenceRef.current = previous;
      closeBehaviorConfiguredRef.current = previousConfigured;
      setSettingsError("关闭窗口行为保存失败");
    });
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

    setDurationFormatPreference(next)
      .catch(() => {
        setDurationFormat(previous);
        setSettingsError("时间显示设置保存失败");
      })
      .finally(() => {
        durationFormatSaveInFlightRef.current = false;
        setDurationFormatBusy(false);
      });
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

  const contentId =
    activePage === "settings"
      ? "settings-content"
      : activePage === "software"
        ? "software-content"
        : activePage === "background"
          ? "background-content"
          : "overview-content";

  const recording = !error && summary?.last_scan_succeeded === true;
  const recordingLabel = error ? "记录状态未知"
    : recording ? "正在记录"
    : summary?.last_scan_succeeded === false ? "采样失败，正在重试" : "等待首次采样";

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

              const navButton = (
                <button
                  className={`nav-key${isActive ? " is-active" : ""}`}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  aria-disabled={!item.available}
                  onPointerEnter={item.id === "software" ? warmSoftwarePage : undefined}
                  onFocus={item.id === "software" ? warmSoftwarePage : undefined}
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
            <UnavailableTooltip>
              <button className="header-button date-control" type="button">
                <CalendarDays size={16} aria-hidden="true" />
                <span className="num">{formatTodayDate()}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </UnavailableTooltip>
            <div className="window-actions">
              <UnavailableTooltip>
                <button className="header-button" type="button">
                  <Download size={16} aria-hidden="true" />
                  导出
                </button>
              </UnavailableTooltip>
              <UnavailableTooltip>
                <button className="header-button" type="button">
                  <Menu size={16} aria-hidden="true" />
                  更多
                </button>
              </UnavailableTooltip>
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
            <BackgroundPage durationFormat={durationFormat} />
          ) : (
            <main className="overview-page" id="overview-content">
              {error ? <div className="warning" role="alert">{error}</div> : null}
              {summary ? (
                <>
                  <TodayReadout summary={summary} durationFormat={durationFormat} />

                  <div className="overview-grid">
                    <AppUsageTable apps={summary.apps} durationFormat={durationFormat} />
                    <div className="right-rail">
                      <TodayMix apps={summary.apps} durationFormat={durationFormat} />
                      <RecentActivity apps={summary.apps} durationFormat={durationFormat} />
                    </div>
                  </div>
                </>
              ) : !error && <p role="status" className="empty-state">正在读取概览…</p>}
            </main>
          )}
        </div>
      </div>

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

function formatTodayDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
