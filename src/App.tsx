import { useEffect, useState } from "react";
import { getDashboardSummary, type DashboardSummary } from "./api";
import { AppUsageTable } from "./components/AppUsageTable";
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

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(fallbackSummary);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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
    </main>
  );
}
