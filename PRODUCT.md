# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop app built with Tauri v2: the interface is a React/TypeScript webview inside a native Windows window (native title bar), backed by Rust and local SQLite. Window size defaults to 1440 × 900, minimum 1180 × 760.

## Users

Open-source users who find Global Software Timer (GST, 全局软件计时器) on GitHub: Chinese-speaking Windows users, often students, researchers and developers, who want to know where their computer time goes without handing that data to a cloud service. They install it, let it run in the tray, and open the dashboard between tasks to check today's totals and compare software. First impressions and ease of first use matter because the audience arrives from a repository page, not a sales funnel.

## Product Purpose

GST records which software runs on a Windows PC and for how long, entirely on the local machine. It shows today's recorded computer time, today's active (keyboard/mouse) time, per-software runtime, and a software directory where users mark software for special attention or hide it from summaries. Success: a user opens the window, understands today's numbers within seconds, trusts that they are accurate and private, and closes it again.

## Positioning

Local-first and privacy-strict: no account, no telemetry, no network upload, no administrator permission, and no collection of window titles, document names, web page titles, keystrokes, mouse coordinates, file contents or browser history. It counts software runtime, not activity content.

## Operating Context

- Runs as a system tray app; startup at login is on by default (current-user autostart).
- The window is opened on demand; closing it minimises to the tray or exits, per the user's saved choice (asked on first close).
- Data refreshes every 5 seconds while the window is visible; polling pauses when hidden.
- All UI copy is Simplified Chinese.

## Capabilities and Constraints

- Pages: 概览 (overview), 软件 (software directory), 后台 (background processes), 设置 (settings). Navigation also shows 统计, 时间轴, 成就 and the 日期/导出 controls as not-yet-available items with a "该功能暂未完成" tooltip.
- Overview: most-used software with lifetime total, 今日记录, 今日活跃, per-software table (累计, 今天, 状态), 今日分布 by software active time, and 正在运行 (windowed and tray apps).
- Status vocabulary: 前台运行 (eligible taskbar window), 托盘运行 (eligible tray process), 后台运行 (only windowless or helper processes remain), 未运行.
- Software page: 特别关注 table (今日前台, 今日后台, 今日活跃, 共计前台, 共计后台, 共计活跃, 上次打开), 隐藏软件列表, read-only 已发现软件 with offline search by English, Chinese, full pinyin and pinyin initials; add dialog with multi-select; 特别关注 and 隐藏 are mutually exclusive.
- Two different "active" meanings: overview 今日活跃 is machine keyboard/mouse activity; software-page 活跃 is Windows foreground focus. Overview and software-page totals are not required to match.
- Duration display: default decimal hours with one fractional digit (`8.3小时`); optional hours and minutes (`8小时35分钟`) via Settings.
- Settings: 开机自启动, 关闭窗口时最小化到后台, 显示分钟数, and theme (跟随系统 / 浅色 / 深色, default follows Windows).
- Software icons come from the local executables; some software has no icon and falls back to an initial.

## Brand Commitments

- Product name Global Software Timer, shorthand GST, Chinese UI title 全局软件计时器.
- The app mark is a skeuomorphic clock: a physical timepiece rendered with real material (bezel, dial, hands), used in the sidebar and as the app and tray icon.
- Light and dark themes are both first-class.

## Evidence on Hand

- No screenshots of real user data may be fabricated as real; demo data in the browser preview (`scripts/ui-preview/`) is synthetic.
- Privacy statement: `PRIVACY.md`. No testimonials, user counts or benchmarks exist; do not invent them.

## Product Principles

1. Today's numbers first: the window answers "how long today, and on what" before anything else.
2. Trust through precision: aligned numbers, exact status words, and honest labels for what each metric means.
3. Privacy is visible: the interface reminds users that data stays on this machine, without nagging.
4. Quiet when idle: a tray tool that opens, informs and gets out of the way.
5. Unfinished features are shown honestly as unavailable, never faked.

## Accessibility & Inclusion

Keyboard navigation and visible focus for all controls; text contrast meeting WCAG AA in both themes; status never conveyed by color alone.
