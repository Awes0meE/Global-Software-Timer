import { useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageJson from "../package.json";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  Download,
  Home,
  Menu,
  Monitor,
  Power,
  Settings,
} from "lucide-react";
import {
  applyWindowCloseChoice,
  getAppSettings,
  getAutostartEnabled,
  getDashboardSummary,
  setAutostartPreference,
  setAutostartEnabled,
  setCloseBehaviorPreference,
  type CloseBehavior,
  type DashboardSummary,
} from "./api";
import { AppUsageTable } from "./components/AppUsageTable";
import { RecentActivity } from "./components/RecentActivity";
import { SummaryCards } from "./components/SummaryCards";
import { TodayMix } from "./components/TodayMix";
import { UnavailableTooltip } from "./components/UnavailableTooltip";

const fallbackSummary: DashboardSummary = {
  product_title: "全局软件计时器",
  locale: "zh-CN",
  most_used: null,
  recorded_today_seconds: 0,
  active_today_seconds: 0,
  apps: [],
};

const dashboardLoadError = "无法读取本地数据";
const dashboardRefreshIntervalMs = 5000;
const defaultCloseBehavior: CloseBehavior = "minimize_to_tray";

type PageId = "overview" | "settings";

const navItems = [
  { id: "overview", label: "概览", icon: Home, available: true },
  { id: "software", label: "软件", icon: Monitor, available: false },
  { id: "statistics", label: "统计", icon: BarChart3, available: false },
  { id: "timeline", label: "时间轴", icon: Clock3, available: false },
  { id: "daily", label: "日报", icon: CalendarDays, available: false },
  { id: "settings", label: "设置", icon: Settings, available: true },
] as const;

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(fallbackSummary);
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
  const closePreferenceRef = useRef<CloseBehavior>(defaultCloseBehavior);
  const closeBehaviorConfiguredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = () => {
      getDashboardSummary()
        .then((nextSummary) => {
          if (!cancelled) {
            setSummary(nextSummary);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(dashboardLoadError);
          }
        });
    };

    loadDashboard();
    const refreshId = window.setInterval(loadDashboard, dashboardRefreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      let preferredAutostart = true;

      try {
        const settings = await getAppSettings();
        preferredAutostart = settings.autostart_enabled;

        if (!cancelled) {
          setCloseBehavior(settings.close_behavior);
          closePreferenceRef.current = settings.close_behavior;
          closeBehaviorConfiguredRef.current = settings.close_behavior_configured;
        }
      } catch {
        if (!cancelled) {
          setSettingsError("设置读取失败");
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

        if (preferredAutostart !== actualAutostart) {
          await setAutostartEnabled(preferredAutostart);
        }

        if (!cancelled) {
          setAutostartEnabledState(preferredAutostart);
        }
      } catch {
        if (!cancelled) {
          setAutostartEnabledState(preferredAutostart);
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

          await applyWindowCloseChoice(closePreferenceRef.current, false);
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

  const contentId = activePage === "settings" ? "settings-content" : "overview-content";

  return (
    <div className="desktop-root">
      <a className="skip-link" href={`#${contentId}`}>
        跳到内容
      </a>
      <div className="app-window">
        <header className="app-header">
          <div className="brand-cluster">
            <div className="brand-mark" aria-hidden="true">
              <Clock3 size={24} strokeWidth={2.4} />
            </div>
            <h1>{summary.product_title}</h1>
            <div className="live-status" aria-label="正在记录">
              <span aria-hidden="true" />
              正在记录
            </div>
          </div>

          <div className="window-actions">
            <UnavailableTooltip>
              <button className="header-action" type="button">
                <Menu size={18} aria-hidden="true" />
                更多
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </UnavailableTooltip>
          </div>
        </header>

        <div className="workspace-layout">
          <aside className="sidebar">
            <nav className="side-nav" aria-label="主导航">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activePage;

                const navButton = (
                  <button
                    className={`nav-item${isActive ? " is-active" : ""}`}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    aria-disabled={!item.available}
                    onClick={() => handleNavClick(item)}
                  >
                    <Icon size={26} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );

                return item.available ? (
                  <span className="nav-item-slot" key={item.label}>
                    {navButton}
                  </span>
                ) : (
                  <UnavailableTooltip key={item.label}>{navButton}</UnavailableTooltip>
                );
              })}
            </nav>

            <div className="sidebar-footer" aria-label="数据状态">
              <span>
                <i className="status-dot status-dot-ok" aria-hidden="true" />
                本地数据
              </span>
              <span>
                <i className="status-dot status-dot-muted" aria-hidden="true" />
                离线模式
              </span>
              <small>v{packageJson.version}</small>
            </div>
          </aside>

          {activePage === "settings" ? (
            <SettingsPage
              autostartBusy={autostartBusy}
              autostartDisabled={!autostartLoaded || autostartBusy}
              autostartEnabled={autostartEnabled}
              closeBehavior={closeBehavior}
              closeBehaviorDisabled={!settingsLoaded}
              error={settingsError}
              onAutostartToggle={handleAutostartToggle}
              onCloseBehaviorToggle={handleCloseBehaviorToggle}
            />
          ) : (
            <main className="overview-page" id="overview-content">
              {error ? <div className="warning">{error}</div> : null}
              <SummaryCards summary={summary} />

              <div className="overview-grid">
                <AppUsageTable apps={summary.apps} />
                <div className="right-rail">
                  <TodayMix apps={summary.apps} />
                  <RecentActivity apps={summary.apps} />
                </div>
              </div>
            </main>
          )}
        </div>

        <footer className="bottom-bar">
          <UnavailableTooltip>
            <button className="date-control" type="button">
              <CalendarDays size={18} aria-hidden="true" />
              {formatTodayDate()}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </UnavailableTooltip>
          <UnavailableTooltip>
            <button className="export-button" type="button">
              <Download size={18} aria-hidden="true" />
              导出
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </UnavailableTooltip>
        </footer>
      </div>

      {closeDialogOpen ? (
        <div className="modal-backdrop">
          <section
            className="close-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-dialog-title"
          >
            <h2 id="close-dialog-title">关闭全局软件计时器</h2>
            <p>请选择退出软件，或最小化后继续在右下角状态栏运行。</p>
            <p className="dialog-hint">后续可在设置中更改。</p>
            {closeDialogError ? <p className="dialog-error">{closeDialogError}</p> : null}
            <div className="close-dialog-actions">
              <button
                type="button"
                className="dialog-secondary"
                disabled={closeChoiceBusy}
                onClick={() => void handleCloseChoice("exit")}
              >
                退出软件
              </button>
              <button
                type="button"
                className="dialog-primary"
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
  error: string | null;
  onAutostartToggle: () => void;
  onCloseBehaviorToggle: () => void;
}

function SettingsPage({
  autostartBusy,
  autostartDisabled,
  autostartEnabled,
  closeBehavior,
  closeBehaviorDisabled,
  error,
  onAutostartToggle,
  onCloseBehaviorToggle,
}: SettingsPageProps) {
  return (
    <main className="settings-page" id="settings-content">
      <section className="settings-heading">
        <p className="settings-eyebrow">本机偏好</p>
        <h2>设置</h2>
      </section>

      {error ? <div className="warning">{error}</div> : null}

      <section className="settings-panel" aria-label="设置选项">
        <SettingSwitchRow
          checked={autostartEnabled}
          description="电脑开机后自动启动并在后台记录软件时长"
          disabled={autostartDisabled}
          icon={<Power size={21} aria-hidden="true" />}
          statusText={autostartBusy ? "保存中" : autostartEnabled ? "已开启" : "已关闭"}
          title="开机自启动"
          onToggle={onAutostartToggle}
        />
        <SettingSwitchRow
          checked={closeBehavior === "minimize_to_tray"}
          description="关闭主窗口后继续在右下角状态栏运行"
          icon={<Settings size={21} aria-hidden="true" />}
          statusText={closeBehavior === "minimize_to_tray" ? "最小化到后台" : "直接退出"}
          title="关闭窗口时最小化到后台"
          disabled={closeBehaviorDisabled}
          onToggle={onCloseBehaviorToggle}
        />
      </section>
    </main>
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
      <div className="settings-row-icon">{icon}</div>
      <div className="settings-row-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="settings-row-control">
        <span className={`settings-status${checked ? " is-on" : ""}`}>{statusText}</span>
        <button
          className={`setting-switch${checked ? " is-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled}
          onClick={onToggle}
        >
          <span className="switch-thumb" aria-hidden="true" />
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
