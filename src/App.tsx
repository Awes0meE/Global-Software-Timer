import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  Download,
  Home,
  Menu,
  Monitor,
  Settings,
} from "lucide-react";
import { getDashboardSummary, type DashboardSummary } from "./api";
import { AppUsageTable } from "./components/AppUsageTable";
import { RecentActivity } from "./components/RecentActivity";
import { SummaryCards } from "./components/SummaryCards";
import { TodayMix } from "./components/TodayMix";

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

const navItems = [
  { label: "概览", icon: Home, active: true },
  { label: "软件", icon: Monitor, active: false },
  { label: "统计", icon: BarChart3, active: false },
  { label: "时间轴", icon: Clock3, active: false },
  { label: "日报", icon: CalendarDays, active: false },
  { label: "设置", icon: Settings, active: false },
] as const;

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(fallbackSummary);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="desktop-root">
      <a className="skip-link" href="#overview-content">
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
            <button className="header-action" type="button" disabled>
              <Settings size={18} aria-hidden="true" />
              设置
            </button>
            <button className="header-action" type="button" disabled>
              <BarChart3 size={18} aria-hidden="true" />
              统计
            </button>
            <button className="header-action" type="button" disabled>
              <Menu size={18} aria-hidden="true" />
              更多
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="workspace-layout">
          <aside className="sidebar">
            <nav className="side-nav" aria-label="主导航">
              {navItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    className={`nav-item${item.active ? " is-active" : ""}`}
                    type="button"
                    aria-current={item.active ? "page" : undefined}
                    disabled={!item.active}
                    key={item.label}
                  >
                    <Icon size={26} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
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
              <small>v0.1.0</small>
            </div>
          </aside>

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
        </div>

        <footer className="bottom-bar">
          <button className="date-control" type="button" disabled>
            <CalendarDays size={18} aria-hidden="true" />
            {formatTodayDate()}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          <button className="export-button" type="button" disabled>
            <Download size={18} aria-hidden="true" />
            导出
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </footer>
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
