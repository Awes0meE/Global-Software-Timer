import type { DashboardSummary, DurationFormat } from "../api";
import { formatDurationPartsZh, formatDurationZh } from "../i18n";
import { LcdDial } from "./LcdDial";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  summary: DashboardSummary;
  durationFormat?: DurationFormat;
  now?: Date;
}

export function TodayReadout({ summary, durationFormat = "decimal_hours", now = new Date() }: Props) {
  return (
    <section className="readout" aria-label="今日总览">
      <div className="lcd">
        <LcdDial
          recordedSeconds={summary.recorded_today_seconds}
          activeSeconds={summary.active_today_seconds}
          now={now}
        />
        <div className="lcd-cell">
          <p className="lcd-label">
            <i className="lcd-key lcd-key-recorded" aria-hidden="true" />
            今日记录
          </p>
          <LcdValue seconds={summary.recorded_today_seconds} durationFormat={durationFormat} />
          <p className="lcd-note">GST 记录到的开机时间</p>
        </div>
        <div className="lcd-cell">
          <p className="lcd-label">
            <i className="lcd-key lcd-key-active" aria-hidden="true" />
            今日活跃
          </p>
          <LcdValue seconds={summary.active_today_seconds} durationFormat={durationFormat} />
          <p className="lcd-note">检测到键盘或鼠标操作</p>
        </div>
        <div className="lcd-cell lcd-cell-most">
          <p className="lcd-label">最常用</p>
          {summary.most_used ? (
            <>
              <div className="lcd-most">
                <SoftwareIcon app={summary.most_used} size="sm" />
                <strong>{summary.most_used.display_name}</strong>
              </div>
              <p className="lcd-note">
                {summary.most_used.active_today_seconds > 0
                  ? `今日活跃 ${formatDurationZh(summary.most_used.active_today_seconds, durationFormat)}`
                  : `今日 ${formatDurationZh(summary.most_used.today_seconds, durationFormat)}`}
              </p>
            </>
          ) : (
            <>
              <div className="lcd-most">
                <strong>暂无数据</strong>
              </div>
              <p className="lcd-note">打开软件后会在这里显示</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function LcdValue({ seconds, durationFormat }: { seconds: number; durationFormat: DurationFormat }) {
  return (
    <p className="lcd-value">
      {formatDurationPartsZh(seconds, durationFormat).map((part) => (
        <span key={part.unit}>
          <b>{part.value}</b>
          <small>{part.unit}</small>
        </span>
      ))}
    </p>
  );
}
