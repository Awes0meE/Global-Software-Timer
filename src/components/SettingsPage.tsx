import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  AArrowUp,
  ArchiveRestore,
  CalendarDays,
  Clock3,
  FolderOpen,
  LayoutDashboard,
  MonitorCog,
  Palette,
  Power,
  Tablet,
  Wind,
} from "lucide-react";
import packageJson from "../../package.json";
import { resolveAccent } from "../accent";
import type {
  CloseBehavior,
  DurationFormat,
  StartPage,
  TextSize,
  ThemePreference,
  UiPreferenceKey,
  UiPreferences,
  WeekStartSetting,
} from "../api";
import { currentAppearance, readWindowsAccentForSwatch, subscribeAppearance } from "../appearance";
import { ACCENT_PRESETS, EINK_PALETTES, accentPreset, einkPalette, type AccentId, type EinkId } from "../appearancePresets";
import clockMark from "../assets/gst-clock.svg";

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const weekStartOptions: { value: WeekStartSetting; label: string }[] = [
  { value: "monday", label: "周一" },
  { value: "sunday", label: "周日" },
];

const textSizeOptions: { value: TextSize; label: string }[] = [
  { value: "standard", label: "标准" },
  { value: "large", label: "大" },
];

export interface StartPageOption {
  value: StartPage;
  label: string;
}

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
  /** 主题色, 墨水屏配色, 每周起始日, 启动时打开, 减少动画 (spec v0.4.4 §A) and 文字大小. */
  ui: UiPreferences;
  uiDisabled: boolean;
  /** The 启动时打开 choices: the available sidebar pages but 设置. */
  startPageOptions: readonly StartPageOption[];
  onAutostartToggle: () => void;
  onCloseBehaviorToggle: () => void;
  onDurationFormatToggle: () => void;
  onThemeChange: (theme: ThemePreference) => void;
  onUiPreferenceChange: <K extends UiPreferenceKey>(key: K, value: UiPreferences[K]) => void;
  onOpenDataFolder: () => void;
  /** While 选择备份… picks and checks a backup. */
  restorePicking: boolean;
  onPickRestore: () => void;
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
  ui,
  uiDisabled,
  startPageOptions,
  onAutostartToggle,
  onCloseBehaviorToggle,
  onDurationFormatToggle,
  onThemeChange,
  onUiPreferenceChange,
  onOpenDataFolder,
  restorePicking,
  onPickRestore,
}: SettingsPageProps) {
  const warning = useRef<HTMLDivElement>(null);
  // A failed save rolls its row back; 外观 and 数据 sit below the fold, so bring the message into view.
  useEffect(() => {
    if (error) warning.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);

  return (
    <main className="settings-page" id="settings-content">
      {error ? (
        <div className="warning" role="alert" ref={warning}>
          {error}
        </div>
      ) : null}

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
        <SettingRow
          icon={<LayoutDashboard size={18} aria-hidden="true" />}
          title="启动时打开"
          titleId="start-page-setting-title"
          description="启动 GST 后先显示的页面"
        >
          <Segmented
            labelledBy="start-page-setting-title"
            options={startPageOptions}
            value={ui.start_page}
            disabled={uiDisabled}
            onChange={(page) => onUiPreferenceChange("start_page", page)}
          />
        </SettingRow>
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
        <SettingRow
          icon={<CalendarDays size={18} aria-hidden="true" />}
          title="每周起始日"
          titleId="week-start-setting-title"
          description="日历、热力图和“本周”从哪天开始"
        >
          <Segmented
            labelledBy="week-start-setting-title"
            options={weekStartOptions}
            value={ui.week_start}
            disabled={uiDisabled}
            onChange={(weekStart) => onUiPreferenceChange("week_start", weekStart)}
          />
        </SettingRow>
        <SettingRow
          icon={<AArrowUp size={18} aria-hidden="true" />}
          title="文字大小"
          titleId="text-size-setting-title"
          description="放大界面里的文字和图标"
        >
          <Segmented
            labelledBy="text-size-setting-title"
            options={textSizeOptions}
            value={ui.text_size}
            disabled={uiDisabled}
            onChange={(textSize) => onUiPreferenceChange("text_size", textSize)}
          />
        </SettingRow>
        <SettingSwitchRow
          checked={ui.reduce_motion === "reduce"}
          description="关闭开关滑动、弹窗和指示灯呼吸等动效"
          disabled={uiDisabled}
          icon={<Wind size={18} aria-hidden="true" />}
          statusText={ui.reduce_motion === "reduce" ? "已开启" : "已关闭"}
          title="减少动画"
          onToggle={() => onUiPreferenceChange("reduce_motion", ui.reduce_motion === "reduce" ? "system" : "reduce")}
        />
      </section>

      <section className="panel settings-group" aria-labelledby="settings-look-title">
        <h3 id="settings-look-title">外观</h3>
        <SettingRow icon={<ThemeGlyph />} title="主题" titleId="theme-setting-title" description="默认跟随 Windows 的浅色或深色模式">
          <Segmented
            labelledBy="theme-setting-title"
            options={themeOptions}
            value={theme}
            disabled={themeDisabled}
            onChange={onThemeChange}
          />
        </SettingRow>
        <SettingRow
          icon={<Palette size={18} aria-hidden="true" />}
          title="主题色"
          titleId="accent-setting-title"
          description="开关、选中项、导航图标和背景光晕的颜色"
        >
          <span className="settings-status is-on">{accentPreset(ui.accent).name}</span>
          <AccentSwatches
            labelledBy="accent-setting-title"
            value={ui.accent}
            disabled={uiDisabled}
            onChange={(accent) => onUiPreferenceChange("accent", accent)}
          />
        </SettingRow>
        <SettingRow
          icon={<Tablet size={18} aria-hidden="true" />}
          title="墨水屏配色"
          titleId="eink-setting-title"
          description="读数屏和日历弹窗的纸色与墨色"
        >
          <span className="settings-status is-on">{einkPalette(ui.eink).name}</span>
          <RovingRadioGroup
            className="eink-chips"
            labelledBy="eink-setting-title"
            options={EINK_PALETTES}
            value={ui.eink}
            disabled={uiDisabled}
            onChange={(eink: EinkId) => onUiPreferenceChange("eink", eink)}
            renderOption={(palette) => ({
              className: "lcd-chip",
              data: { "data-eink-chip": palette.id },
              content: <span aria-hidden="true">8</span>,
            })}
          />
        </SettingRow>
      </section>

      <section className="panel settings-group" aria-labelledby="settings-data-title">
        <h3 id="settings-data-title">数据</h3>
        <SettingRow
          icon={<FolderOpen size={18} aria-hidden="true" />}
          title="数据文件夹"
          description="数据库和恢复前的自动备份都在这里"
        >
          <button type="button" className="button button-secondary" onClick={onOpenDataFolder}>
            打开
          </button>
        </SettingRow>
        <SettingRow
          icon={<ArchiveRestore size={18} aria-hidden="true" />}
          title="从备份恢复"
          description="用一份完整备份替换当前数据，完成后自动重启"
        >
          <button
            type="button"
            className="button button-secondary"
            aria-busy={restorePicking || undefined}
            aria-disabled={restorePicking || undefined}
            onClick={onPickRestore}
          >
            选择备份…
          </button>
        </SettingRow>
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

/** The small white four-pane mark on the 跟随 Windows swatch. */
function WindowsGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path fill="#fff" d="M0 0h4.6v4.6H0zM5.4 0H10v4.6H5.4zM0 5.4h4.6V10H0zM5.4 5.4H10V10H5.4z" />
    </svg>
  );
}

interface SettingRowProps {
  icon: ReactNode;
  title: string;
  /** Names the row's radio group. */
  titleId?: string;
  description: string;
  children: ReactNode;
}

function SettingRow({ icon, title, titleId, description, children }: SettingRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="settings-row-copy">
        <strong id={titleId}>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  labelledBy: string;
  options: readonly { value: T; label: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ labelledBy, options, value, disabled, onChange }: SegmentedProps<T>) {
  const roving = useRovingRadios(
    options.map((option) => option.value),
    value,
    disabled,
    onChange,
  );
  return (
    <div className="segmented" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={roving.onKeyDown}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={roving.buttonRef(index)}
          className={`segmented-option${value === option.value ? " is-selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={index === roving.selectedIndex ? 0 : -1}
          disabled={disabled}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface AccentSwatchesProps {
  labelledBy: string;
  value: AccentId;
  disabled: boolean;
  onChange: (accent: AccentId) => void;
}

/** 主题色: 跟随 Windows shows the resolved Windows accent (蓝 until one is read), the presets their pairs. */
function AccentSwatches({ labelledBy, value, disabled, onChange }: AccentSwatchesProps) {
  const { windowsAccent } = useSyncExternalStore(subscribeAppearance, currentAppearance);
  const windows = resolveAccent("system", windowsAccent);
  useEffect(() => readWindowsAccentForSwatch(), []);
  return (
    <RovingRadioGroup
      className="swatches"
      labelledBy={labelledBy}
      options={ACCENT_PRESETS}
      value={value}
      disabled={disabled}
      onChange={onChange}
      renderOption={(preset) => {
        const pair = preset.id === "system" ? windows : preset;
        return {
          className: "swatch",
          // The theme's half is picked in CSS, so a theme change needs no render.
          style: { "--swatch-light": pair.light, "--swatch-dark": pair.dark } as CSSProperties,
          content: preset.id === "system" ? <WindowsGlyph /> : null,
        };
      }}
    />
  );
}

interface RovingOption<T extends string> {
  id: T;
  name: string;
}

interface RovingRadioGroupProps<T extends string, O extends RovingOption<T>> {
  className: string;
  labelledBy: string;
  options: readonly O[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
  renderOption: (option: O) => {
    className: string;
    style?: CSSProperties;
    data?: Record<string, string>;
    content: ReactNode;
  };
}

const ROVING_STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * The roving tabindex every radio group on the page shares: Tab reaches the chosen option, and the arrow
 * keys, Home and End move to another one and choose it.
 */
function useRovingRadios<T extends string>(ids: readonly T[], value: T, disabled: boolean, onChange: (value: T) => void) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(0, ids.indexOf(value));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ROVING_STEPS[event.key];
    if (!step || disabled) return;
    event.preventDefault();
    const from = buttons.current.findIndex((button) => button === document.activeElement);
    const next = step(from === -1 ? selectedIndex : from, ids.length);
    buttons.current[next]?.focus();
    if (ids[next] !== value) onChange(ids[next]);
  };

  const buttonRef = (index: number) => (button: HTMLButtonElement | null) => {
    buttons.current[index] = button;
  };

  return { selectedIndex, onKeyDown, buttonRef };
}

/** A row of named radio buttons drawn by `renderOption`, with the page's roving tabindex. */
function RovingRadioGroup<T extends string, O extends RovingOption<T>>({
  className,
  labelledBy,
  options,
  value,
  disabled,
  onChange,
  renderOption,
}: RovingRadioGroupProps<T, O>) {
  const { selectedIndex, onKeyDown, buttonRef } = useRovingRadios(
    options.map((option) => option.id),
    value,
    disabled,
    onChange,
  );

  return (
    <div className={className} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const look = renderOption(option);
        return (
          <button
            key={option.id}
            ref={buttonRef(index)}
            className={`${look.className}${selected ? " is-selected" : ""}`}
            style={look.style}
            {...look.data}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.name}
            title={option.name}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (option.id !== value) onChange(option.id);
            }}
          >
            {look.content}
          </button>
        );
      })}
    </div>
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
    <SettingRow icon={icon} title={title} description={description}>
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
    </SettingRow>
  );
}
