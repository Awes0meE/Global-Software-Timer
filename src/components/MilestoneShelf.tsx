import type { CSSProperties } from "react";
import type { DayRecord, DurationFormat, MilestoneRow, SoftwareDayRecord } from "../api";
import { formatDurationPartsZh, formatDurationZh } from "../i18n";
import { SoftwareIcon } from "./SoftwareIcon";

const HOUR = 3600;
const PLATE_LIST_LIMIT = 3;

interface RecordsProps {
  bestActiveDay: DayRecord | null;
  bestSoftwareDay: SoftwareDayRecord | null;
  durationFormat: DurationFormat;
}

export function PersonalRecords({ bestActiveDay, bestSoftwareDay, durationFormat }: RecordsProps) {
  return (
    <section className="panel ach-records" aria-labelledby="ach-records-title">
      <header className="panel-head">
        <h2 id="ach-records-title">个人纪录</h2>
        <span className="panel-count">全部历史</span>
      </header>
      <div className="ach-records-row">
        <div className="ach-record">
          <div className="ach-record-copy">
            <span className="ach-record-label">活跃最长的一天</span>
            <RecordValue seconds={bestActiveDay?.seconds ?? null} durationFormat={durationFormat} />
          </div>
          <RecordMeta date={bestActiveDay?.date ?? null} />
        </div>
        <div className="ach-record">
          {bestSoftwareDay ? <SoftwareIcon app={bestSoftwareDay} /> : null}
          <div className="ach-record-copy">
            <span className="ach-record-label">单个软件单日焦点最长</span>
            <RecordValue
              seconds={bestSoftwareDay?.seconds ?? null}
              durationFormat={durationFormat}
              who={bestSoftwareDay?.display_name}
            />
          </div>
          <RecordMeta date={bestSoftwareDay?.date ?? null} />
        </div>
      </div>
    </section>
  );
}

function RecordValue({
  seconds,
  durationFormat,
  who,
}: {
  seconds: number | null;
  durationFormat: DurationFormat;
  who?: string;
}) {
  if (seconds === null) {
    return <p className="ach-record-value is-empty">还没有记录</p>;
  }
  return (
    <p className="ach-record-value">
      {formatDurationPartsZh(seconds, durationFormat).map((part) => (
        <span key={part.unit}>
          <b>{part.value}</b>
          <small>{part.unit}</small>
        </span>
      ))}
      {who ? <span className="ach-record-who">{who}</span> : null}
    </p>
  );
}

function RecordMeta({ date }: { date: string | null }) {
  if (!date) return null;
  return (
    <div className="ach-record-meta">
      <strong>{date}</strong>
      <span>{weekdayZh(date)}</span>
    </div>
  );
}

interface ShelfProps {
  tiers: number[];
  milestones: MilestoneRow[];
  durationFormat: DurationFormat;
}

/** One engraved plate per tier. Each software sits on the plate of its highest tier, with that tier's unlock date. */
export function MilestoneShelf({ tiers, milestones, durationFormat }: ShelfProps) {
  const litCount = tiers.filter((tier) => milestones.some((row) => (row.reached_hours ?? 0) >= tier)).length;
  const ultimate = tiers[tiers.length - 1];
  const leader = milestones.reduce<MilestoneRow | null>(
    (best, row) => (!best || row.focused_seconds > best.focused_seconds ? row : best),
    null,
  );

  return (
    <section className="panel ach-milestones" aria-labelledby="ach-milestones-title">
      <header className="panel-head">
        <h2 id="ach-milestones-title">里程碑</h2>
        <span className="panel-count">
          按软件累计焦点时长 · 已点亮 {litCount} / {tiers.length} 档
        </span>
      </header>
      <div className="ach-shelf">
        {tiers.map((tier) => (
          <MilestonePlate
            key={tier}
            tier={tier}
            isUltimate={tier === ultimate}
            reachedCount={milestones.filter((row) => (row.reached_hours ?? 0) >= tier).length}
            residents={milestones.filter((row) => row.reached_hours === tier)}
            leader={leader}
            durationFormat={durationFormat}
          />
        ))}
      </div>
    </section>
  );
}

function MilestonePlate({
  tier,
  isUltimate,
  reachedCount,
  residents,
  leader,
  durationFormat,
}: {
  tier: number;
  isUltimate: boolean;
  reachedCount: number;
  residents: MilestoneRow[];
  leader: MilestoneRow | null;
  durationFormat: DurationFormat;
}) {
  const reached = reachedCount > 0;
  const classes = ["ach-plate", reached ? "is-reached" : "is-slot"];
  if (reached && isUltimate) classes.push("is-ultimate");

  return (
    <div className={classes.join(" ")} role="group" aria-label={`${tier} 小时`}>
      <div className="ach-plate-tier">
        <b>{tier}</b>
        <small>小时</small>
        <span className="ach-plate-state">{reached ? `${reachedCount} 个软件` : "未点亮"}</span>
      </div>
      {isUltimate ? <div className="ach-plate-rule is-titled">终极成就</div> : <div className="ach-plate-rule" />}
      {reached ? (
        <PlateList residents={residents} durationFormat={durationFormat} />
      ) : (
        <PlateProgress tier={tier} leader={leader} durationFormat={durationFormat} />
      )}
    </div>
  );
}

function PlateList({ residents, durationFormat }: { residents: MilestoneRow[]; durationFormat: DurationFormat }) {
  if (residents.length === 0) {
    return <p className="ach-plate-more">都已升到更高一档</p>;
  }
  const shown = residents.slice(0, PLATE_LIST_LIMIT);
  return (
    <ul className="ach-plate-list">
      {shown.map((row) => (
        <li key={row.identity_key} title={residentTitle(row, durationFormat)}>
          <span className="ach-plate-name">{row.display_name}</span>
          {row.reached_on ? <span className="ach-plate-date num">{row.reached_on.slice(5)}</span> : null}
        </li>
      ))}
      {residents.length > shown.length ? (
        <li className="ach-plate-more">另 {residents.length - shown.length} 个软件</li>
      ) : null}
    </ul>
  );
}

function PlateProgress({
  tier,
  leader,
  durationFormat,
}: {
  tier: number;
  leader: MilestoneRow | null;
  durationFormat: DurationFormat;
}) {
  if (!leader) {
    return <p className="ach-plate-more">暂无软件</p>;
  }
  const percent = progressPercent(leader.focused_seconds, tier);
  return (
    <div className="ach-progress">
      <div className="ach-progress-copy">
        <span className="ach-progress-name">
          <span className="ach-progress-lead">最接近 </span>
          {leader.display_name}
        </span>
        <span className="ach-progress-percent">{percent}%</span>
      </div>
      <div className="ach-scale" style={{ "--ach-progress": `${percent}%` } as CSSProperties} aria-hidden="true">
        <i />
        <em />
      </div>
      <span className="ach-progress-hours">
        {formatDurationZh(leader.focused_seconds, durationFormat)} / {tier}小时
      </span>
    </div>
  );
}

function residentTitle(row: MilestoneRow, durationFormat: DurationFormat): string {
  const total = `${row.display_name} 累计焦点 ${formatDurationZh(row.focused_seconds, durationFormat)}`;
  if (row.next_hours === null) return total;
  return `${total} · 下一档 ${row.next_hours} 小时 ${progressPercent(row.focused_seconds, row.next_hours)}%`;
}

/** Whole percent, rounded down so an unreached tier never reads 100%. */
function progressPercent(seconds: number, tierHours: number): number {
  return Math.min(100, Math.floor((seconds * 100) / (tierHours * HOUR)));
}

export function weekdayZh(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `周${"日一二三四五六"[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}`;
}
