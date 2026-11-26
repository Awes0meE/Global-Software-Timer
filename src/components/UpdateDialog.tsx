import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import type { UpdateInfo, UpdateProgress } from "../api";
import { formatFileSize } from "./RestoreDialog";
import { useModalDialog } from "./useModalDialog";
import "./SettingsImportDialog.css";
import "./UpdateDialog.css";

/**
 * 检查更新 (v0.4.6): the consent to go online, then 发现新版本, which becomes 正在更新到 … once
 * 更新并重启 is pressed. Every other ending (v0.4.7) is a dialog closed with 确定: 已是最新版本,
 * 无法连接到 GitHub, 更新没有完成.
 */
export type UpdateDialogState =
  | { kind: "consent" }
  | { kind: "found"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo; progress: UpdateProgress | null }
  | { kind: "result"; outcome: UpdateOutcome };

export type UpdateOutcome = "latest" | "offline" | "failed";

/** The 确定 dialogs: a title, one line, and whether it reads as an alert. */
export function outcomeCopy(outcome: UpdateOutcome, version: string): { title: string; copy: string; alert: boolean } {
  switch (outcome) {
    case "latest":
      return { title: "已是最新版本", copy: `V${version} 是目前的最新版本。`, alert: false };
    case "offline":
      return { title: "无法连接到 GitHub", copy: "请检查网络后再试一次。", alert: true };
    case "failed":
      return { title: "更新没有完成", copy: "数据没有改动，GST 会继续记录。", alert: true };
  }
}

const MB = 1024 * 1024;

/** The whole installer is in: it is verified and started, and 取消 can no longer stop it. */
export function downloadFinished(progress: UpdateProgress | null): boolean {
  return progress !== null && progress.total !== null && progress.downloaded >= progress.total;
}

/** `2.6 / 6.3 MB`, or `2.6 MB` while the size is unknown. */
export function formatDownloadProgress(progress: UpdateProgress | null, sizeBytes: number | null): string {
  const downloaded = progress?.downloaded ?? 0;
  const total = progress?.total ?? sizeBytes;
  const mb = (bytes: number) => (bytes / MB).toFixed(1);
  return total ? `${mb(Math.min(downloaded, total))} / ${mb(total)} MB` : `${mb(downloaded)} MB`;
}

interface UpdateDialogProps {
  state: UpdateDialogState;
  /** This build's version, for 已是最新版本. */
  currentVersion: string;
  /** 联网检查 is waiting for GitHub. */
  checking: boolean;
  onCheck: () => void;
  onInstall: () => void;
  /** 更新日志 ↗: the releases page in the browser. */
  onOpenNotes: () => void;
  /** 取消, 稍后 or Esc; while downloading, this stops the download. */
  onClose: () => void;
}

/** In the 从备份恢复 dialog's language (useModalDialog): focus starts on 取消, 稍后 or 确定. */
export function UpdateDialog({
  state,
  currentVersion,
  checking,
  onCheck,
  onInstall,
  onOpenNotes,
  onClose,
}: UpdateDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstKeyRef = useRef<HTMLButtonElement>(null);
  const installing = state.kind === "installing" && downloadFinished(state.progress);
  const result = state.kind === "result" ? outcomeCopy(state.outcome, currentVersion) : null;
  useModalDialog(dialogRef, { onCancel: onClose, busy: installing, initialFocus: firstKeyRef });

  // 更新并重启 swaps the keys: focus moves to 取消, and to the dialog itself once 取消 is off.
  useEffect(() => {
    if (state.kind !== "installing") return;
    if (installing) dialogRef.current?.focus();
    else firstKeyRef.current?.focus();
  }, [state.kind, installing]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // A press on the scrim keeps focus where it is, inside the dialog.
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog import-dialog update-dialog"
        role={result?.alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        aria-describedby="update-dialog-copy"
        aria-busy={state.kind === "installing" || undefined}
        tabIndex={-1}
      >
        {state.kind === "result" ? (
          <>
            <h2 id="update-dialog-title">{result?.title}</h2>
            <p className="update-copy" id="update-dialog-copy">
              {result?.copy}
            </p>
            <div className="dialog-actions">
              <button ref={firstKeyRef} type="button" className="button button-primary" onClick={onClose}>
                确定
              </button>
            </div>
          </>
        ) : state.kind === "consent" ? (
          <>
            <h2 id="update-dialog-title">检查更新</h2>
            <p className="update-copy" id="update-dialog-copy">
              检查更新需要联网。GST 只会向 GitHub 查询最新的版本号，不会发送任何使用记录。
            </p>
            <div className="dialog-actions">
              <button ref={firstKeyRef} type="button" className="button button-secondary" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="button button-primary"
                aria-busy={checking || undefined}
                aria-disabled={checking || undefined}
                onClick={onCheck}
              >
                联网检查
              </button>
            </div>
          </>
        ) : state.kind === "found" ? (
          <>
            <h2 id="update-dialog-title">发现新版本</h2>
            <dl className="import-facts">
              {[
                ["当前版本", `V${state.info.current_version}`],
                ["新版本", `V${state.info.version}`],
                ...(state.info.size_bytes ? [["安装包", formatFileSize(state.info.size_bytes)]] : []),
              ].map(([label, value]) => (
                <div className="import-fact" key={label}>
                  <dt>{label}</dt>
                  <dd className="num">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="update-copy" id="update-dialog-copy">
              更新会从 GitHub 下载安装包，装好后 GST 自动重启。更新前会先备份当前数据。
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-secondary update-notes"
                aria-label="更新日志（在浏览器中打开）"
                onClick={onOpenNotes}
              >
                更新日志
                <ExternalLink size={14} aria-hidden="true" />
              </button>
              <button ref={firstKeyRef} type="button" className="button button-secondary" onClick={onClose}>
                稍后
              </button>
              <button type="button" className="button button-primary" onClick={onInstall}>
                更新并重启
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="update-dialog-title">正在更新到 V{state.info.version}</h2>
            <div className="update-progress">
              <div
                className="update-bar"
                role="progressbar"
                aria-labelledby="update-dialog-copy"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent(state)}
                aria-valuetext={formatDownloadProgress(state.progress, state.info.size_bytes)}
              >
                <span style={{ width: `${progressPercent(state)}%` }} />
              </div>
              <p className="update-progress-text">
                <span id="update-dialog-copy">正在下载</span>
                <span className="num">{formatDownloadProgress(state.progress, state.info.size_bytes)}</span>
              </p>
            </div>
            <div className="dialog-actions">
              <button
                ref={firstKeyRef}
                type="button"
                className="button button-secondary"
                disabled={installing}
                onClick={onClose}
              >
                取消
              </button>
              <button type="button" className="button button-primary" disabled>
                更新并重启
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function progressPercent(state: Extract<UpdateDialogState, { kind: "installing" }>): number {
  const total = state.progress?.total ?? state.info.size_bytes;
  if (!total) return 0;
  return Math.min(100, Math.round(((state.progress?.downloaded ?? 0) / total) * 100));
}
