import { useCallback, useEffect, useState } from "react";
import { getDashboardSummary, type DashboardSummary } from "./api";
import { AppUsageTable } from "./components/AppUsageTable";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryCards } from "./components/SummaryCards";
import { TodayMix } from "./components/TodayMix";

const fallbackSummary: DashboardSummary = {
  product_title: "全局软件计时器",
  locale: "zh-CN",
  most_used: null,
  recorded_today_seconds: 0,
  active_today_seconds: 0,
  apps: [],
  hidden_apps: [],
};

const dashboardLoadError = "无法读取本地数据";

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(fallbackSummary);
  const [error, setError] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    const nextSummary = await getDashboardSummary();
    setSummary(nextSummary);
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(() => getDashboardSummary())
      .then((nextSummary) => {
        if (!cancelled) {
          setSummary(nextSummary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(dashboardLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshSummary]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地软件使用时长库</p>
          <h1>{summary.product_title}</h1>
        </div>
        <div className="status-pill">正在记录</div>
      </header>

      {error ? <div className="warning">{error}</div> : null}
      <SummaryCards summary={summary} />

      <div className="dashboard-grid">
        <AppUsageTable apps={summary.apps} />
        <TodayMix apps={summary.apps} />
      </div>

      <SettingsPanel
        hiddenApps={summary.hidden_apps}
        onChanged={refreshSummary}
        visibleApps={summary.apps}
      />
    </main>
  );
}
