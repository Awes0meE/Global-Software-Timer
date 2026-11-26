import type { ReactNode } from "react";
import { Clock3, MonitorCog, Power } from "lucide-react";
import packageJson from "../../package.json";
import type { CloseBehavior, DurationFormat, ThemePreference } from "../api";
import clockMark from "../assets/gst-clock.svg";

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

interface SettingsPageProps {
  autostartBusy: boolean;
  autostartDisabled: boolean;
  autostartEnabled: boolean;
  closeBehavior: CloseBehavior;
  closeBehaviorDisabled: boolean;
  durationFormat: DurationFormat;
  durationFormatDisabled: boolean;
  error: string | null;
  theme: ThemePreference;
  themeDisabled: boolean;
  onAutostartToggle: () => void;
  onCloseBehaviorToggle: () => void;
  onDurationFormatToggle: () => void;
  onThemeChange: (theme: ThemePreference) => void;
}

export function SettingsPage({
  autostartBusy,
  autostartDisabled,
  autostartEnabled,
  closeBehavior,
  closeBehaviorDisabled,
  durationFormat,
  durationFormatDisabled,
  error,
  theme,
  themeDisabled,
  onAutostartToggle,
  onCloseBehaviorToggle,
  onDurationFormatToggle,
  onThemeChange,
}: SettingsPageProps) {
  return (
    <main className="settings-page" id="settings-content">
      {error ? <div className="warning">{error}</div> : null}

      <section className="readout settings-readout" aria-labelledby="settings-status-title">
        <div className="lcd settings-lcd">
          <img src={clockMark} width="48" height="48" alt="" />
          <div className="lcd-cell">
            <h3 className="lcd-label" id="settings-status-title">本机状态</h3>
            <p>全局软件计时器</p>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">当前版本</span>
            <p>V{packageJson.version}</p>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">数据存储</span>
            <p>仅本机</p>
          </div>
        </div>
      </section>

      <section className="panel settings-group" aria-labelledby="settings-run-title">
        <h3 id="settings-run-title">运行</h3>
        <SettingSwitchRow
          checked={autostartEnabled}
          description="电脑开机后自动启动并在后台记录软件时长"
          disabled={autostartDisabled}
          icon={<Power size={18} aria-hidden="true" />}
          statusText={autostartBusy ? "保存中" : autostartEnabled ? "已开启" : "已关闭"}
          title="开机自启动"
          onToggle={onAutostartToggle}
        />
        <SettingSwitchRow
          checked={closeBehavior === "minimize_to_tray"}
          description="关闭主窗口后继续在右下角状态栏运行"
          icon={<MonitorCog size={18} aria-hidden="true" />}
          statusText={closeBehavior === "minimize_to_tray" ? "最小化到后台" : "直接退出"}
          title="关闭窗口时最小化到后台"
          disabled={closeBehaviorDisabled}
          onToggle={onCloseBehaviorToggle}
        />
      </section>

      <section className="panel settings-group" aria-labelledby="settings-display-title">
        <h3 id="settings-display-title">显示</h3>
        <SettingSwitchRow
          checked={durationFormat === "hours_minutes"}
          description="开启后将会显示具体分钟数，如“8小时35分钟”"
          disabled={durationFormatDisabled}
          icon={<Clock3 size={18} aria-hidden="true" />}
          statusText={durationFormat === "hours_minutes" ? "已开启" : "已关闭"}
          title="显示分钟数"
          onToggle={onDurationFormatToggle}
        />
        <div className="settings-row">
          <div className="settings-row-icon" aria-hidden="true">
            <ThemeGlyph />
          </div>
          <div className="settings-row-copy">
            <strong id="theme-setting-title">主题</strong>
            <span>默认跟随 Windows 的浅色或深色模式</span>
          </div>
          <div className="settings-row-control">
            <div className="segmented" role="radiogroup" aria-labelledby="theme-setting-title">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`segmented-option${theme === option.value ? " is-selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.value}
                  disabled={themeDisabled}
                  onClick={() => onThemeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel settings-group settings-privacy" aria-labelledby="settings-privacy-title">
        <h3 id="settings-privacy-title">隐私</h3>
        <p>
          软件使用记录保存在这台电脑上。GST 不上传记录，也不采集窗口标题、文档名、网页标题或键盘输入内容。
        </p>
      </section>
    </main>
  );
}

function ThemeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}

interface SettingSwitchRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  statusText: string;
  title: string;
  onToggle: () => void;
}

function SettingSwitchRow({
  checked,
  description,
  disabled = false,
  icon,
  statusText,
  title,
  onToggle,
}: SettingSwitchRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="settings-row-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="settings-row-control">
        <span className={`settings-status${checked ? " is-on" : ""}`}>{statusText}</span>
        <button
          className={`toggle${checked ? " is-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled}
          onClick={onToggle}
        >
          <span className="toggle-knob" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
