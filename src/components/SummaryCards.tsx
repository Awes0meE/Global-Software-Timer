import type { DashboardSummary } from "../api";
import { formatDurationZh } from "../i18n";
import { Activity, CalendarDays, Clock3, Trophy } from "lucide-react";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: Props) {
  return (
    <section className="summary-grid" aria-label="今日总览">
      <article className="summary-card most-used-card">
        <div className="summary-title">
          <Trophy size={28} aria-hidden="true" />
          <span>最常用</span>
        </div>
        <div className="summary-card-body">
          <div>
            {summary.most_used ? (
              <div className="most-used-app">
                <SoftwareIcon app={summary.most_used} size="sm" />
                <h2>{summary.most_used.display_name}</h2>
              </div>
            ) : (
              <h2>暂无数据</h2>
            )}
            <p className="metric-label">累计使用</p>
            <p className="metric-value">
              {summary.most_used ? formatDurationZh(summary.most_used.total_seconds) : "0分钟"}
            </p>
          </div>
          <div className="trophy-visual" aria-hidden="true">
            <Trophy size={96} strokeWidth={1.4} />
            <span>1</span>
          </div>
        </div>
      </article>
      <article className="summary-card recorded-card">
        <div className="summary-title">
          <CalendarDays size={26} aria-hidden="true" />
          <span>今日记录</span>
        </div>
        <div className="summary-card-body">
          <div>
            <p className="metric-label">今日使用总时长</p>
            <h2>{formatDurationZh(summary.recorded_today_seconds)}</h2>
            <p className="trend trend-blue">本地持续记录中</p>
          </div>
          <div className="clock-visual" aria-hidden="true">
            <Clock3 size={62} strokeWidth={1.6} />
          </div>
        </div>
      </article>
      <article className="summary-card active-card">
        <div className="summary-title">
          <Activity size={27} aria-hidden="true" />
          <span>今日活跃</span>
        </div>
        <div className="summary-card-body">
          <div>
            <p className="metric-label">今日活跃时长</p>
            <h2>{formatDurationZh(summary.active_today_seconds)}</h2>
            <p className="trend trend-green">检测到键盘或鼠标操作</p>
          </div>
          <div className="activity-visual" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </article>
    </section>
  );
}
