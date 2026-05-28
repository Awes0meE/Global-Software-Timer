import type { DashboardSummary } from "../api";
import { formatDurationZh } from "../i18n";

interface Props {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: Props) {
  return (
    <section className="summary-grid" aria-label="今日总览">
      <article className="card hero-card">
        <p className="card-label">最常用</p>
        <h2>{summary.most_used?.display_name ?? "暂无数据"}</h2>
        <p className="muted">
          {summary.most_used
            ? `累计 ${formatDurationZh(summary.most_used.total_seconds)} · 今日 ${formatDurationZh(
                summary.most_used.today_seconds,
              )}`
            : "保持运行后会显示使用最多的软件"}
        </p>
      </article>
      <article className="card">
        <p className="card-label">今日记录</p>
        <h2>{formatDurationZh(summary.recorded_today_seconds)}</h2>
        <p className="muted">计时器从开机后持续运行</p>
      </article>
      <article className="card">
        <p className="card-label">今日活跃</p>
        <h2>{formatDurationZh(summary.active_today_seconds)}</h2>
        <p className="muted">检测到键盘或鼠标操作</p>
      </article>
    </section>
  );
}
