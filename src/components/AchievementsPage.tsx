import { useEffect, useRef, useState } from "react";
import { useContentMotion, useSelectionGlide } from "../motion";
import {
  getAchievementsSummary,
  type AchievementsSummary,
  type DurationFormat,
  type HeatmapDays,
  type SoftwareRef,
} from "../api";
import { startVisiblePolling } from "../visiblePolling";
import { ActivityHeatmap, HEATMAP_RANGE_LABELS } from "./ActivityHeatmap";
import { MilestoneShelf, PersonalRecords } from "./MilestoneShelf";
import { SoftwareIcon } from "./SoftwareIcon";
import "./AchievementsPage.css";

/** Long-term numbers barely move; read on open, on change and when the window comes back. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
const HEATMAP_OPTIONS: HeatmapDays[] = [90, 180, 365];
const RECENT_NAME_COUNT = 3;

interface AchievementsPageProps {
  durationFormat?: DurationFormat;
  /** Reports the 包含隐藏软件 switch, for the header's 导出成就 key; null once unmounted. */
  onIncludeHiddenChange?: (includeHidden: boolean | null) => void;
}

export function AchievementsPage({ durationFormat = "decimal_hours", onIncludeHiddenChange }: AchievementsPageProps) {
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDays>(90);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [summary, setSummary] = useState<AchievementsSummary | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  useContentMotion(pageRef, summary ? `achievements|${summary.heatmap.length}` : null);
  const rangeRef = useRef<HTMLDivElement>(null);
  useSelectionGlide(rangeRef, ".segmented-option.is-selected", summary ? heatmapDays : null);

  useEffect(() => {
    onIncludeHiddenChange?.(includeHidden);
  }, [onIncludeHiddenChange, includeHidden]);

  useEffect(() => () => onIncludeHiddenChange?.(null), [onIncludeHiddenChange]);

  useEffect(() => {
    // Responses for an earlier range or switch setting arrive after this flag flips and are dropped.
    let current = true;
    const refresh = async () => {
      try {
        const next = await getAchievementsSummary({ heatmapDays, includeHidden });
        if (!current) return;
        setSummary(next);
        setFetchError(false);
      } catch {
        if (current) setFetchError(true);
      }
    };
    const stopPolling = startVisiblePolling(refresh, REFRESH_INTERVAL_MS);
    return () => {
      current = false;
      stopPolling();
    };
  }, [heatmapDays, includeHidden]);

  if (!summary) {
    return (
      <main className="achievements-page" id="achievements-content" ref={pageRef}>
        {fetchError ? (
          <div className="warning" role="alert">无法读取成就</div>
        ) : (
          <p role="status" className="empty-state">正在读取成就…</p>
        )}
      </main>
    );
  }

  const start = summary.heatmap[0]?.date ?? summary.today;

  return (
    <main className="achievements-page" id="achievements-content" ref={pageRef}>
      {fetchError ? <div className="warning" role="alert">无法读取成就</div> : null}

      <section className="readout ach-readout" aria-labelledby="ach-heatmap-title">
        <div className="ach-readout-head">
          <h2 id="ach-heatmap-title">活跃热力图</h2>
          <span className="panel-count">{start} 至 {summary.today}</span>
          <div className="segmented" role="radiogroup" aria-label="热力图范围" ref={rangeRef}>
            {HEATMAP_OPTIONS.map((days) => (
              <button
                key={days}
                className={`segmented-option${heatmapDays === days ? " is-selected" : ""}`}
                type="button"
                role="radio"
                aria-checked={heatmapDays === days}
                onClick={() => setHeatmapDays(days)}
              >
                {HEATMAP_RANGE_LABELS[days]}
              </button>
            ))}
          </div>
        </div>
        <ActivityHeatmap summary={summary} durationFormat={durationFormat} />
      </section>

      <div className="ach-scope">
        <strong>以下按软件统计</strong>
        <i className="ach-scope-rule" aria-hidden="true" />
        <span id="ach-include-hidden-label">包含隐藏软件</span>
        <button
          className={`toggle${includeHidden ? " is-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={includeHidden}
          aria-labelledby="ach-include-hidden-label"
          onClick={() => setIncludeHidden((value) => !value)}
        >
          <span className="toggle-knob" aria-hidden="true" />
        </button>
      </div>

      <PersonalRecords
        bestActiveDay={summary.best_active_day}
        bestSoftwareDay={summary.best_software_day}
        durationFormat={durationFormat}
      />

      <MilestoneShelf
        tiers={summary.milestone_hours}
        milestones={summary.milestones}
        durationFormat={durationFormat}
      />

      <section className="panel ach-comings" aria-labelledby="ach-comings-title">
        <header className="panel-head">
          <h2 id="ach-comings-title">软件来去</h2>
        </header>
        <ComingRow title="新面孔" rows={summary.new_software} emptyText="近 30 天没有新出现的软件" />
        <ComingRow title="30 天未打开" rows={summary.dormant_software} emptyText="没有 30 天未打开的软件" />
      </section>
    </main>
  );
}

function ComingRow({ title, rows, emptyText }: { title: string; rows: SoftwareRef[]; emptyText: string }) {
  const [expanded, setExpanded] = useState(false);
  const recent = rows.slice(0, RECENT_NAME_COUNT);

  return (
    <div className="ach-coming">
      <div className="ach-coming-row">
        <strong>{title}</strong>
        <span className="ach-coming-count">
          <b>{rows.length}</b>
          <small>个</small>
        </span>
        <span className="ach-coming-names">
          {rows.length === 0 ? (
            emptyText
          ) : (
            <>
              最近：
              {recent.map((row, index) => (
                <span key={row.identity_key}>
                  {index > 0 ? <i aria-hidden="true">·</i> : null}
                  <b>{row.display_name}</b> {row.date.slice(5)}
                </span>
              ))}
            </>
          )}
        </span>
        {rows.length > 0 ? (
          <button
            className="panel-link"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起名单" : "查看名单"}
          </button>
        ) : null}
      </div>
      {expanded ? (
        <ul className="ach-coming-list" aria-label={`${title}名单`}>
          {rows.map((row) => (
            <li key={row.identity_key}>
              <SoftwareIcon app={row} size="sm" />
              <span>{row.display_name}</span>
              <span className="num">{row.date}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
