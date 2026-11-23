import { Info } from "lucide-react";
import type {
  DurationFormat,
  IdleOpenRow,
  RankingRow,
  SessionStatRow,
  StatisticsDay,
  StatisticsSummary,
} from "../api";
import { formatDurationPartsZh } from "../i18n";
import { splitWeekdayWeekend } from "../statisticsRange";
import { SoftwareIcon } from "./SoftwareIcon";

const DAY_SECONDS = 24 * 3600;

interface LedgerProps {
  summary: StatisticsSummary;
  durationFormat: DurationFormat;
}

/** A duration from formatDurationPartsZh with the units set small, e.g. 32.1<small>小时</small>. */
export function Duration({ seconds, format }: { seconds: number; format: DurationFormat }) {
  return (
    <>
      {formatDurationPartsZh(seconds, format).map((part) => (
        <span key={part.unit}>
          {part.value}
          <small>{part.unit}</small>
        </span>
      ))}
    </>
  );
}

export function StatisticsLedgers({ summary, durationFormat }: LedgerProps) {
  // 作息 (whole-machine rhythm) comes first; the missing-detail note heads the per-software ledgers it names.
  return (
    <>
      <RhythmPanel summary={summary} durationFormat={durationFormat} />
      {summary.days_without_software_detail > 0 ? (
        <p className="stats-note">
          <Info size={15} aria-hidden="true" />
          <span>区间内有 {summary.days_without_software_detail} 天无软件明细</span>
          <small>
            {summary.software_detail_start_date
              ? `${summary.software_detail_start_date} 之前只记了总时长，排行、开着没用和会话不含这些天`
              : "这些天只记了总时长，排行、开着没用和会话不含这些天"}
          </small>
        </p>
      ) : null}
      <div className="stats-two">
        <RankingPanel summary={summary} durationFormat={durationFormat} />
        <IdleOpenPanel rows={summary.idle_open} durationFormat={durationFormat} />
      </div>
      <SessionsPanel rows={summary.sessions} durationFormat={durationFormat} />
    </>
  );
}

function NameCell({ row }: { row: { display_name: string; icon_url: string | null } }) {
  return (
    <span className="software-cell">
      <SoftwareIcon app={row} size="sm" />
      <span className="stats-name">
        <strong>{row.display_name}</strong>
      </span>
    </span>
  );
}

function RankingPanel({ summary, durationFormat }: LedgerProps) {
  const comparable = summary.software_comparison_available;

  return (
    <section className="panel stats-panel" aria-labelledby="stats-ranking-title">
      <header className="panel-head">
        <h2 id="stats-ranking-title">区间排行</h2>
        <span className="panel-count">
          按焦点时长 · {comparable ? `与前 ${summary.days_count} 天比` : "无对比"}
        </span>
      </header>
      {summary.ranking.length === 0 ? (
        <div className="empty-state stats-empty">
          <strong>这段时间没有软件焦点记录</strong>
        </div>
      ) : (
        <>
          <div className="stats-row rank-row stats-head" aria-hidden="true">
            <span>#</span>
            <span>软件</span>
            <span>焦点</span>
            <span>名次</span>
          </div>
          {summary.ranking.map((row) => (
            <div className="stats-row rank-row" key={row.identity_key}>
              <span className="rank-no num">{row.rank}</span>
              <NameCell row={row} />
              <span className="num stats-val">
                <Duration seconds={row.focused_seconds} format={durationFormat} />
              </span>
              <RankChange row={row} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function RankChange({ row }: { row: RankingRow }) {
  if (row.is_new) {
    return <span className="rank-change rank-new">新上榜</span>;
  }

  if (row.previous_rank === null) {
    return (
      <span className="rank-change rank-none">
        <span aria-hidden="true">—</span>
        <span className="stats-sr">无对比</span>
      </span>
    );
  }

  if (row.previous_rank === row.rank) {
    return <span className="rank-change rank-same">持平</span>;
  }

  const rising = row.previous_rank > row.rank;
  const steps = Math.abs(row.previous_rank - row.rank);
  const label = `${rising ? "上升" : "下降"} ${steps} 名`;

  return (
    <span className={`rank-change ${rising ? "rank-up" : "rank-down"}`} title={label}>
      <span aria-hidden="true">
        <svg className="rank-arrow" width="10" height="10" viewBox="0 0 10 10">
          <path
            d={rising ? "M5 8.5V1.5M1.8 4.6 5 1.4l3.2 3.2" : "M5 1.5v7M1.8 5.4 5 8.6l3.2-3.2"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {steps}
      </span>
      <span className="stats-sr">{label}</span>
    </span>
  );
}

function IdleOpenPanel({ rows, durationFormat }: { rows: IdleOpenRow[]; durationFormat: DurationFormat }) {
  const longestWindow = Math.max(1, ...rows.map((row) => row.window_seconds));

  return (
    <section className="panel stats-panel idle-panel" aria-labelledby="stats-idle-title">
      <header className="panel-head">
        <h2 id="stats-idle-title">开着没用</h2>
        <span className="panel-count">只算有窗口的时间</span>
      </header>
      {rows.length === 0 ? (
        <div className="empty-state stats-empty">
          <strong>这段时间没有开着不用的软件</strong>
          <span>窗口不少于 5 小时、焦点不到 5% 才上榜</span>
        </div>
      ) : (
        <>
          <div className="stats-row idle-row stats-head" aria-hidden="true">
            <span>软件</span>
            <span>窗口</span>
            <span>焦点 · 占比</span>
            <span>开着没用</span>
          </div>
          <div className="idle-rows">
            {rows.map((row) => (
              <div className="stats-row idle-row" key={row.identity_key}>
                <span className="software-cell">
                  <SoftwareIcon app={row} size="sm" />
                  <span className="idle-name">
                    <strong>{row.display_name}</strong>
                    <span className="idle-bar" aria-hidden="true">
                      <i className="idle-win" style={{ width: `${(row.window_seconds / longestWindow) * 100}%` }} />
                      <i
                        className="idle-focus"
                        style={{ width: `${Math.max((row.focused_seconds / longestWindow) * 100, 0.6)}%` }}
                      />
                    </span>
                  </span>
                </span>
                <span className="num stats-dim">
                  <Duration seconds={row.window_seconds} format={durationFormat} />
                </span>
                <span className="num stats-dim">
                  <Duration seconds={row.focused_seconds} format={durationFormat} />
                  {` · ${formatShare(row.focused_seconds, row.window_seconds)}`}
                </span>
                <span className="num stats-val">
                  <Duration seconds={row.idle_seconds} format={durationFormat} />
                </span>
              </div>
            ))}
          </div>
          <p className="stats-foot">
            <span className="idle-key">
              <i aria-hidden="true" />
              焦点
            </span>
            <span className="idle-key is-light">
              <i aria-hidden="true" />
              窗口开着
            </span>
            条长按本榜最长窗口时长 · 窗口不少于 5 小时、焦点不到 5% 才上榜
          </p>
        </>
      )}
    </section>
  );
}

function SessionsPanel({ rows, durationFormat }: { rows: SessionStatRow[]; durationFormat: DurationFormat }) {
  return (
    <section className="panel stats-panel" aria-labelledby="stats-sessions-title">
      <header className="panel-head">
        <h2 id="stats-sessions-title">会话</h2>
        <span className="panel-count">按打开次数</span>
      </header>
      {rows.length === 0 ? (
        <div className="empty-state stats-empty">
          <strong>这段时间没有打开记录</strong>
        </div>
      ) : (
        <>
          <div className="stats-row sess-row stats-head" aria-hidden="true">
            <span>软件</span>
            <span>打开次数</span>
            <span>平均单次</span>
            <span>最长</span>
          </div>
          {rows.map((row) => (
            <div className="stats-row sess-row" key={row.identity_key}>
              <NameCell row={row} />
              <span className="num stats-val">
                {row.launch_count}
                <small>次</small>
              </span>
              <span className="num stats-val">
                <Duration seconds={row.average_seconds} format={durationFormat} />
              </span>
              <span className="num stats-val">
                <Duration seconds={row.longest_seconds} format={durationFormat} />
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function RhythmPanel({ summary, durationFormat }: LedgerProps) {
  const { days } = summary;
  const split = splitWeekdayWeekend(days);
  const weekendCount = days.filter((day) => isWeekend(day.date)).length;
  const recordedDays = days.filter((day) => day.recorded_seconds > 0);
  const uptimeAverage =
    recordedDays.length === 0
      ? null
      : Math.round(recordedDays.reduce((sum, day) => sum + day.tracker_uptime_seconds, 0) / recordedDays.length);
  const firstMedian = medianClock(days, "first_recorded_at");
  const lastMedian = medianClock(days, "last_recorded_at");

  return (
    <section className="panel stats-panel" aria-labelledby="stats-rhythm-title">
      <header className="panel-head">
        <h2 id="stats-rhythm-title">作息</h2>
        <span className="panel-count">
          有记录 {recordedDays.length} 天 / 共 {summary.days_count} 天 · 条长满格为 24 小时
        </span>
      </header>
      <div className="rhythm-grid">
        <RhythmCell
          label="工作日日均活跃"
          seconds={split.weekdayAverageSeconds}
          note={`${days.length - weekendCount} 个工作日，空白日计入`}
          durationFormat={durationFormat}
        />
        <RhythmCell
          label="周末日均活跃"
          seconds={split.weekendAverageSeconds}
          note={`${weekendCount} 个周末日，空白日计入`}
          durationFormat={durationFormat}
        />
        <RhythmCell
          label="日均开机时长"
          seconds={uptimeAverage}
          note={`按有记录的 ${recordedDays.length} 天`}
          durationFormat={durationFormat}
          light
        />
        <div className="rhythm-cell">
          <span className="rhythm-label">最早 / 最晚记录</span>
          <span className="rhythm-value num">
            {firstMedian ?? "—"}
            <small> / </small>
            {lastMedian ?? "—"}
          </span>
          <span className="rhythm-scale" />
          <span className="rhythm-note">中位时间</span>
        </div>
      </div>
    </section>
  );
}

function RhythmCell({
  label,
  seconds,
  note,
  durationFormat,
  light = false,
}: {
  label: string;
  seconds: number | null;
  note: string;
  durationFormat: DurationFormat;
  light?: boolean;
}) {
  return (
    <div className="rhythm-cell">
      <span className="rhythm-label">{label}</span>
      <span className="rhythm-value num">
        {seconds === null ? "—" : <Duration seconds={seconds} format={durationFormat} />}
      </span>
      <span className={`rhythm-track${light ? " is-light" : ""}`} aria-hidden="true">
        <i style={{ width: `${Math.min(100, ((seconds ?? 0) / DAY_SECONDS) * 100)}%` }} />
      </span>
      <span className="rhythm-note">{note}</span>
    </div>
  );
}

function formatShare(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0.0%";
}

/** Local weekday of a `YYYY-MM-DD` date: Saturday or Sunday. */
export function isWeekend(date: string): boolean {
  const weekday = localDate(date).getDay();
  return weekday === 0 || weekday === 6;
}

export function localDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Median local clock time (`HH:MM`) of a timestamp field across the days that have it. */
function medianClock(days: StatisticsDay[], field: "first_recorded_at" | "last_recorded_at"): string | null {
  const minutes = days
    .map((day) => day[field])
    .filter((value): value is string => value !== null)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .map((value) => value.getHours() * 60 + value.getMinutes())
    .sort((left, right) => left - right);

  if (minutes.length === 0) {
    return null;
  }

  const middle = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2 === 1 ? minutes[middle] : Math.floor((minutes[middle - 1] + minutes[middle]) / 2);

  return `${String(Math.floor(median / 60)).padStart(2, "0")}:${String(median % 60).padStart(2, "0")}`;
}
