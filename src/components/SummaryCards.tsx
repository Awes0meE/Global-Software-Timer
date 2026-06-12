import type { DashboardSummary, DurationFormat } from "../api";
import { formatDurationZh } from "../i18n";
import { Activity, CalendarDays, Clock3, Trophy } from "lucide-react";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  summary: DashboardSummary;
  durationFormat?: DurationFormat;
}

export function SummaryCards({ summary, durationFormat = "decimal_hours" }: Props) {
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
              {summary.most_used
                ? formatDurationZh(summary.most_used.total_seconds, durationFormat)
                : formatDurationZh(0, durationFormat)}
            </p>
          </div>
          <div className="trophy-visual" aria-hidden="true">
            <SolidTrophyIcon />
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
            <h2>{formatDurationZh(summary.recorded_today_seconds, durationFormat)}</h2>
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
            <h2>{formatDurationZh(summary.active_today_seconds, durationFormat)}</h2>
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

function SolidTrophyIcon() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" fill="currentColor" aria-hidden="true">
      <path d="M30 14h36v18c0 11.6-8.1 21-18 21s-18-9.4-18-21V14Z" />
      <path d="M27 21H15v6c0 10 6.7 18.2 16 20.5v-9.2c-4.2-2-7-6.3-7-11.3v-6Z" />
      <path d="M69 21h12v6c0 10-6.7 18.2-16 20.5v-9.2c4.2-2 7-6.3 7-11.3v-6Z" />
      <rect x="43" y="51" width="10" height="18" rx="4" fill="currentColor" />
      <rect className="trophy-base" x="31" y="69" width="34" height="10" rx="4" fill="currentColor" />
      <rect className="trophy-base" x="23" y="80" width="50" height="8" rx="4" fill="currentColor" />
    </svg>
  );
}
