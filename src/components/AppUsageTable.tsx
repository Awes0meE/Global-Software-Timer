import type { AppUsageRow } from "../api";
import { formatDurationZh } from "../i18n";
import { ArrowDown, ArrowUpDown } from "lucide-react";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  apps: AppUsageRow[];
}

export function AppUsageTable({ apps }: Props) {
  return (
    <section className="panel table-panel" aria-label="应用时长列表">
      <div className="panel-heading table-heading">
        <h2>软件使用情况</h2>
      </div>
      <div className="usage-row usage-head">
        <span>软件名称</span>
        <span>
          累计
          <ArrowDown size={14} aria-hidden="true" />
        </span>
        <span>
          今天
          <ArrowUpDown size={14} aria-hidden="true" />
        </span>
        <span>状态</span>
      </div>
      <div className="usage-scroll">
        {apps.length === 0 ? (
          <div className="empty-state">暂时没有可展示的软件时长。</div>
        ) : (
          apps.map((app) => (
            <div className="usage-row" key={app.app_id}>
              <div className="software-cell">
                <SoftwareIcon app={app} />
                <span>
                  <strong>{app.display_name}</strong>
                  <small>{app.process_name}</small>
                </span>
              </div>
              <span>{formatDurationZh(app.total_seconds)}</span>
              <span>{formatDurationZh(app.today_seconds)}</span>
              <span className={`status-badge ${app.is_running ? "running" : "closed"}`}>
                <i aria-hidden="true" />
                {app.is_running ? "运行中" : "已关闭"}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
