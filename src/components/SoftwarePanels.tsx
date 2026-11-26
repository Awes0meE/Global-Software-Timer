import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { DurationFormat, SoftwarePageRow } from "../api";
import { formatDurationZh } from "../i18n";
import { formatLastOpenedAt, highlightDisplayName, rankSoftwareRows } from "../softwareSearch";
import { useWeekStart } from "../weekStart";
import { ActiveTimeHelpPopover, HelpPopover } from "./ActiveTimeHelpPopover";
import { SoftwareIcon } from "./SoftwareIcon";

const loadingTitle = "正在读取软件列表";

interface ManagedPanelProps {
  rows: SoftwarePageRow[];
  loading?: boolean;
  durationFormat?: DurationFormat;
  editing: boolean;
  onAdd: (opener: HTMLButtonElement) => void;
  onEditToggle: () => void;
  onRemove: (identityKey: string) => void;
}

interface ManagedSoftwarePanelProps extends ManagedPanelProps {
  kind: "focused" | "hidden";
  title: string;
  emptyTitle: string;
}

export function FocusedSoftwarePanel(props: ManagedPanelProps) {
  return (
    <ManagedSoftwarePanel
      {...props}
      kind="focused"
      title="特别关注"
      emptyTitle="还没有特别关注的软件"
    />
  );
}

export function HiddenSoftwarePanel(props: ManagedPanelProps) {
  return (
    <ManagedSoftwarePanel
      {...props}
      kind="hidden"
      title="隐藏软件列表"
      emptyTitle="还没有隐藏的软件"
    />
  );
}

export function DiscoveredSoftwarePanel({
  rows,
  loading = false,
}: {
  rows: SoftwarePageRow[];
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const rankedRows = useMemo(() => rankSoftwareRows(rows, query), [rows, query]);

  return (
    <section className="software-panel discovered-panel" aria-labelledby="discovered-software-title">
      <div className="software-panel-head">
        <h2 id="discovered-software-title">已发现软件</h2>
      </div>
      <div className="discovered-search-wrap">
        <input
          className="discovered-search"
          type="search"
          aria-label="搜索已发现软件"
          placeholder="搜索已发现软件"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <SoftwareEmptyState
          title={loading ? loadingTitle : "还没有发现软件"}
        />
      ) : (
        <div className="discovered-scroll" role="region" aria-label="已发现软件明细" tabIndex={0}>
          {rankedRows.map((row) => (
            <DiscoveredSoftwareRow key={row.identity_key} row={row} query={query} />
          ))}
        </div>
      )}
    </section>
  );
}

function ManagedSoftwarePanel({
  rows,
  loading = false,
  editing,
  durationFormat,
  kind,
  title,
  emptyTitle,
  onAdd,
  onEditToggle,
  onRemove,
}: ManagedSoftwarePanelProps) {
  const addLabel = kind === "hidden" ? "添加隐藏软件" : `添加${title}`;

  return (
    <section
      className={`software-panel software-panel-${kind}${editing ? " is-editing" : ""}`}
      aria-labelledby={`${kind}-software-title`}
    >
      <div className="software-panel-head">
        <div className="software-panel-title">
          <h2 id={`${kind}-software-title`}>{title}</h2>
          {kind === "hidden" ? <HiddenSoftwareHelp /> : null}
        </div>
        <div className="software-panel-actions">
          {rows.length > 0 ? (
            <button
              className="text-action"
              type="button"
              aria-label={`${editing ? "完成" : "编辑"}${title}`}
              onClick={onEditToggle}
            >
              {editing ? "完成" : "编辑"}
            </button>
          ) : null}
          <button
            className={`panel-add-button${kind === "hidden" ? " is-secondary" : ""}`}
            type="button"
            aria-label={addLabel}
            onClick={(event) => onAdd(event.currentTarget)}
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
            添加…
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <SoftwareEmptyState
          title={loading ? loadingTitle : emptyTitle}
        />
      ) : kind === "focused" ? (
        <FocusedSoftwareTable
          rows={rows}
          durationFormat={durationFormat}
          editing={editing}
          onRemove={onRemove}
        />
      ) : (
        <HiddenSoftwareList rows={rows} editing={editing} onRemove={onRemove} />
      )}
    </section>
  );
}

function FocusedSoftwareTable({
  rows,
  durationFormat = "decimal_hours",
  editing,
  onRemove,
}: {
  rows: SoftwarePageRow[];
  durationFormat?: DurationFormat;
  editing: boolean;
  onRemove: (identityKey: string) => void;
}) {
  const weekStartsOn = useWeekStart();

  return (
    <div className="software-table-scroll" role="region" aria-label="特别关注明细" tabIndex={0}>
      <div className="focused-table">
        <div className="focused-table-row focused-table-head">
          <span aria-hidden="true" />
          <span>软件</span>
          <span>今日前台</span>
          <span>今日后台</span>
          <span className="active-column-head">
            今日活跃
            <ActiveTimeHelpPopover />
          </span>
          <span>共计前台</span>
          <span>共计后台</span>
          <span>共计活跃</span>
          <span>上次打开</span>
        </div>
        {rows.map((row) => (
          <div className="focused-table-row software-managed-row" key={row.identity_key}>
            <RemoveSlot editing={editing} row={row} onRemove={onRemove} />
            <div className="software-cell">
              <SoftwareIcon app={row} />
              <span>
                <strong>{row.display_name}</strong>
                <small>{row.process_name}</small>
              </span>
            </div>
            <span>{formatDurationZh(todayForegroundSeconds(row), durationFormat)}</span>
            <span>{formatDurationZh(todayBackgroundSeconds(row), durationFormat)}</span>
            <span>{formatDurationZh(row.today_focused_seconds, durationFormat)}</span>
            <span>{formatDurationZh(totalForegroundSeconds(row), durationFormat)}</span>
            <span>{formatDurationZh(totalBackgroundSeconds(row), durationFormat)}</span>
            <span>{formatDurationZh(row.total_focused_seconds, durationFormat)}</span>
            <span>{formatLastOpenedAt(row.last_opened_at, undefined, { weekStartsOn })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HiddenSoftwareHelp() {
  return (
    <HelpPopover label="什么是隐藏软件" title="什么是隐藏软件？" align="start">
      <p>隐藏的软件不进概览排行和今日分布，统计、成就页的软件榜单默认也不列。</p>
      <p>GST 仍照常记录它的时长；从列表移除后，历史时长会重新显示。</p>
    </HelpPopover>
  );
}

function HiddenSoftwareList({
  rows,
  editing,
  onRemove,
}: {
  rows: SoftwarePageRow[];
  editing: boolean;
  onRemove: (identityKey: string) => void;
}) {
  return (
    <div className="hidden-software-scroll" role="region" aria-label="隐藏软件明细" tabIndex={0}>
      <div className="hidden-software-list">
        {rows.map((row) => (
          <div className="hidden-software-row software-managed-row" key={row.identity_key}>
            <RemoveSlot editing={editing} row={row} onRemove={onRemove} />
            <div className="software-cell">
              <SoftwareIcon app={row} size="sm" />
              <span>
                <strong>{row.display_name}</strong>
              </span>
            </div>
            <span className="software-mark software-mark-hidden">已隐藏</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscoveredSoftwareRow({ row, query }: { row: SoftwarePageRow; query: string }) {
  const segments = highlightDisplayName(row.display_name, query);
  const weekStartsOn = useWeekStart();

  return (
    <div className="discovered-row">
      <SoftwareIcon app={row} size="sm" />
      <span className="discovered-copy">
        <strong>
          {segments.map((segment, index) =>
            segment.highlighted ? (
              <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
            ) : (
              <span key={`${segment.text}-${index}`}>{segment.text}</span>
            ),
          )}
        </strong>
        <small>{row.process_name}</small>
      </span>
      <SoftwareMarkBadge mark={row.mark} />
      <span className="discovered-last-opened">{formatLastOpenedAt(row.last_opened_at, undefined, { weekStartsOn })}</span>
    </div>
  );
}

function RemoveSlot({
  editing,
  row,
  onRemove,
}: {
  editing: boolean;
  row: SoftwarePageRow;
  onRemove: (identityKey: string) => void;
}) {
  return (
    <span className="software-remove-slot">
      {editing ? (
        <button
          className="software-remove-button"
          type="button"
          aria-label={`移出 ${row.display_name}`}
          onClick={() => onRemove(row.identity_key)}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function SoftwareMarkBadge({ mark }: { mark: SoftwarePageRow["mark"] }) {
  if (mark === "focused") {
    return <span className="software-mark software-mark-focused">特别关注</span>;
  }

  if (mark === "hidden") {
    return <span className="software-mark software-mark-hidden">已隐藏</span>;
  }

  return <span aria-hidden="true" />;
}

function SoftwareEmptyState({ title }: { title: string }) {
  return (
    <div className="software-empty">
      <h3>{title}</h3>
    </div>
  );
}

function todayForegroundSeconds(row: SoftwarePageRow): number {
  return row.today_foreground_seconds ?? row.today_runtime_seconds;
}

function todayBackgroundSeconds(row: SoftwarePageRow): number {
  return row.today_background_seconds ?? 0;
}

function totalForegroundSeconds(row: SoftwarePageRow): number {
  return row.total_foreground_seconds ?? row.total_runtime_seconds;
}

function totalBackgroundSeconds(row: SoftwarePageRow): number {
  return row.total_background_seconds ?? 0;
}
