import type { AppUsageRow } from "../api";

type IconKind =
  | "vscode"
  | "solidworks"
  | "word"
  | "codex"
  | "chrome"
  | "edge"
  | "steam"
  | "wps"
  | "everything"
  | "terminal"
  | "wechat"
  | "youtube"
  | "notion"
  | "default";

interface Props {
  app: Pick<AppUsageRow, "display_name" | "process_name">;
  size?: "sm" | "md" | "lg";
}

export function SoftwareIcon({ app, size = "md" }: Props) {
  const kind = getSoftwareIconKind(app);
  const label = `${app.display_name} 图标`;

  return (
    <span className={`software-icon software-icon-${kind} software-icon-${size}`} role="img" aria-label={label}>
      {renderIcon(kind, app.display_name)}
    </span>
  );
}

function getSoftwareIconKind(app: Pick<AppUsageRow, "display_name" | "process_name">): IconKind {
  const identity = `${app.display_name} ${app.process_name}`.toLowerCase();

  if (identity.includes("visual studio code") || identity.includes("code.exe")) return "vscode";
  if (identity.includes("solidworks") || identity.includes("sldworks")) return "solidworks";
  if (identity.includes("word") || identity.includes("winword")) return "word";
  if (identity.includes("codex") || identity.includes("openai")) return "codex";
  if (identity.includes("microsoft edge") || identity.includes("msedge.exe")) return "edge";
  if (identity.includes("chrome")) return "chrome";
  if (identity.includes("steam")) return "steam";
  if (identity.includes("wps") || identity.includes("kingsoft")) return "wps";
  if (identity.includes("everything")) return "everything";
  if (identity.includes("terminal") || identity.includes("wt.exe") || identity.includes("powershell")) {
    return "terminal";
  }
  if (identity.includes("wechat") || identity.includes("weixin") || identity.includes("微信")) return "wechat";
  if (identity.includes("youtube")) return "youtube";
  if (identity.includes("notion")) return "notion";

  return "default";
}

function renderIcon(kind: IconKind, displayName: string) {
  switch (kind) {
    case "vscode":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M22.8 4.8 10 16l12.8 11.2 4.4-2.1V6.9z" />
          <path d="M9.8 10.6 5.2 14.8 2.9 13l4.7-4.3zm0 10.8-2.2 1.9L2.9 19l2.3-1.8z" />
          <path d="m10 16 12.8 8.1V7.9z" />
        </svg>
      );
    case "solidworks":
      return (
        <span className="solidworks-mark" aria-hidden="true">
          <strong>SW</strong>
          <small>2024</small>
        </span>
      );
    case "word":
      return (
        <span className="word-mark" aria-hidden="true">
          W
        </span>
      );
    case "codex":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 4.4 24.4 9v9.6L16 27.6 7.6 23V13.4z" />
          <path d="M16 4.4v9.4l8.4 4.8M7.6 13.4l8.4 4.8v9.4M24.4 9 16 13.8l-8.4-.4" />
        </svg>
      );
    case "chrome":
      return <span className="chrome-mark" aria-hidden="true" />;
    case "edge":
      return <span className="edge-mark" aria-hidden="true" />;
    case "steam":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="21.5" cy="10.5" r="5.3" />
          <circle cx="21.5" cy="10.5" r="2.2" />
          <path d="M8 20.2 15 23l7-6.8" />
          <circle cx="8.2" cy="20.2" r="4" />
        </svg>
      );
    case "wps":
      return (
        <span className="wps-mark" aria-hidden="true">
          WPS
        </span>
      );
    case "everything":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="14" cy="14" r="8" />
          <path d="m20 20 7 7" />
        </svg>
      );
    case "terminal":
      return (
        <span className="terminal-mark" aria-hidden="true">
          &gt;_
        </span>
      );
    case "wechat":
      return (
        <span className="wechat-mark" aria-hidden="true">
          <span />
          <span />
        </span>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="3" y="8" width="26" height="16" rx="5" />
          <path d="m14 12 8 4-8 4z" />
        </svg>
      );
    case "notion":
      return (
        <span className="notion-mark" aria-hidden="true">
          N
        </span>
      );
    default:
      return (
        <span className="default-mark" aria-hidden="true">
          {getInitial(displayName)}
        </span>
      );
  }
}

function getInitial(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || "A";
}
