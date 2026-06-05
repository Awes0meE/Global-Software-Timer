import { useMemo, useState } from "react";
import type { AppRuntimeStatus, SoftwarePageRow } from "../api";
import { formatDurationZh } from "../i18n";
import { formatLastOpenedAt, highlightDisplayName, rankSoftwareRows } from "../softwareSearch";
import { ActiveTimeHelpPopover } from "./ActiveTimeHelpPopover";
import { SoftwareIcon } from "./SoftwareIcon";

interface ManagedPanelProps {
  rows: SoftwarePageRow[];
  editing: boolean;
  onAdd: () => void;
  onEditToggle: () => void;
  onRemove: (identityKey: string) => void;
}

interface ManagedSoftwarePanelProps extends ManagedPanelProps {
  kind: "focused" | "hidden";
  title: string;
  emptyTitle: string;
  emptyDescription: string;
}

export function FocusedSoftwarePanel(props: ManagedPanelProps) {
  return (
    <ManagedSoftwarePanel
      {...props}
      kind="focused"
      title="特别关注"
      emptyTitle="还没有特别关注的软件"
      emptyDescription="添加你最想长期观察的软件，查看运行时长、活跃时长和最近打开时间。"
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
      emptyDescription="把常驻后台但不想出现在概览里的软件放到这里。"
    />
  );
}

export function DiscoveredSoftwarePanel({ rows }: { rows: SoftwarePageRow[] }) {
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
          title="还没有发现软件"
          description="打开软件并保持 GST 运行一会儿后，这里会自动出现。"
        />
      ) : (
        <div className="discovered-scroll" tabIndex={0}>
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
  editing,
  kind,
  title,
  emptyTitle,
  emptyDescription,
  onAdd,
  onEditToggle,
  onRemove,
}: ManagedSoftwarePanelProps) {
  return (
    <section
      className={`software-panel software-panel-${kind}${editing ? " is-editing" : ""}`}
      aria-labelledby={`${kind}-software-title`}
    >
      <div className="software-panel-head">
        <h2 id={`${kind}-software-title`}>{title}</h2>
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
            className="panel-add-button"
            type="button"
            aria-label={`添加${title}`}
            onClick={onAdd}
          >
            添加
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <SoftwareEmptyState title={emptyTitle} description={emptyDescription} />
      ) : kind === "focused" ? (
        <FocusedSoftwareTable rows={rows} editing={editing} onRemove={onRemove} />
      ) : (
        <HiddenSoftwareList rows={rows} editing={editing} onRemove={onRemove} />
      )}
    </section>
  );
}

function FocusedSoftwareTable({
  rows,
  editing,
  onRemove,
}: {
  rows: SoftwarePageRow[];
  editing: boolean;
  onRemove: (identityKey: string) => void;
}) {
  return (
    <div className="software-table-scroll" tabIndex={0}>
      <div className="focused-table">
        <div className="focused-table-row focused-table-head">
          <span aria-hidden="true" />
          <span>软件</span>
          <span>状态</span>
          <span>今日运行</span>
          <span className="active-column-head">
            今日活跃
            <ActiveTimeHelpPopover />
          </span>
          <span>共计运行</span>
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
            <span className={`status-badge ${statusClassName(row.status)}`}>
              <i aria-hidden="true" />
              {statusLabel(row.status)}
            </span>
            <span>{formatDurationZh(row.today_runtime_seconds)}</span>
            <span>{formatDurationZh(row.today_focused_seconds)}</span>
            <span>{formatDurationZh(row.total_runtime_seconds)}</span>
            <span>{formatDurationZh(row.total_focused_seconds)}</span>
            <span>{formatLastOpenedAt(row.last_opened_at)}</span>
          </div>
        ))}
      </div>
    </div>
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
    <div className="hidden-software-scroll" tabIndex={0}>
      <div className="hidden-software-list">
        {rows.map((row) => (
          <div className="hidden-software-row software-managed-row" key={row.identity_key}>
            <RemoveSlot editing={editing} row={row} onRemove={onRemove} />
            <div className="software-cell">
              <SoftwareIcon app={row} size="sm" />
              <span>
                <strong>{row.display_name}</strong>
                <small>概览隐藏 · 不参与排行 · 仍正常记录</small>
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
      <span className="discovered-last-opened">{formatLastOpenedAt(row.last_opened_at)}</span>
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

function SoftwareEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="software-empty">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function statusLabel(status: AppRuntimeStatus): string {
  if (status === "foreground") {
    return "前台运行";
  }

  if (status === "background") {
    return "后台运行";
  }

  return "未运行";
}

function statusClassName(status: AppRuntimeStatus): string {
  if (status === "foreground") {
    return "running";
  }

  if (status === "background") {
    return "background";
  }

  return "closed";
}
