<div align="center">

# Global Software Timer

**全局软件计时器**

A Windows-first, local-first desktop tray app for tracking how long you use software.

一个 Windows 优先、本地优先的桌面状态栏软件，用来记录每个软件的运行时长。

<p>
  <a href="https://github.com/Awes0meE/Global-Software-Timer/releases/tag/v0.2.3">
    <img alt="Release v0.2.3" src="https://img.shields.io/badge/Release-v0.2.3-2f81f7?style=for-the-badge" />
  </a>
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?style=for-the-badge&logo=windows&logoColor=white" />
  <img alt="Local First" src="https://img.shields.io/badge/Local--First-Privacy-2ea043?style=for-the-badge" />
  <a href="./LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-f0b429?style=for-the-badge" />
  </a>
</p>

<p>
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-Core-000000?style=flat-square&logo=rust&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-Dashboard-61DAFB?style=flat-square&logo=react&logoColor=0b1721" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-UI-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-Storage-003B57?style=flat-square&logo=sqlite&logoColor=white" />
</p>

<p>
  <a href="#中文">中文</a>
  ·
  <a href="#english">English</a>
  ·
  <a href="https://github.com/Awes0meE/Global-Software-Timer/releases/tag/v0.2.3">Download</a>
  ·
  <a href="./PRIVACY.md">Privacy</a>
</p>

</div>

---

<a id="中文"></a>

## 中文

Global Software Timer（全局软件计时器）是一款本地优先的 Windows 桌面状态栏应用。它会在后台记录桌面软件的运行时长，并在一个像桌面计时仪器的仪表盘里展示你的软件使用数据。

v0.2.3 的概览优先按今日活跃时间选出最常用软件，后台页以秒或分钟显示较短的 CPU 用时。EXE 安装包在覆盖升级时刷新开始菜单和任务栏快捷方式图标。

![概览页（浅色，示例数据）](./docs/assets/ui-overview-light.png)

![概览页（深色，示例数据）](./docs/assets/ui-overview-dark.png)

### 目录

- [中文](#中文)
  - [核心特性](#核心特性)
  - [下载安装](#下载安装)
  - [隐私边界](#隐私边界)
  - [技术架构](#技术架构)
  - [本地开发](#本地开发)
  - [项目结构](#项目结构)
  - [路线图](#路线图)
- [English](#english)
  - [Features](#features)
  - [Installation](#installation)
  - [Privacy Model](#privacy-model)
  - [Architecture](#architecture)
  - [Development](#development)
  - [Roadmap](#roadmap)
- [贡献](#贡献)
- [许可证](#许可证)

### 核心特性

- Windows 10/11 桌面状态栏应用。
- 后台记录软件运行时长，关闭仪表盘窗口后仍可继续运行。
- 本地 SQLite 存储，不需要账号，不上传数据。
- 自动识别常见用户软件，并默认过滤系统进程、驱动进程、更新助手、同步助手等噪声。
- 展示累计软件时长、今日记录时长、今日活跃时长、最常用软件和今日分布。
- 桌面仪器风格界面：像素点阵液晶读数窗显示今日记录、今日活跃和最常用软件，配 24 小时分段表盘。
- 浅色 / 深色主题，默认跟随 Windows，可在设置中改为固定浅色或深色。
- `软件` 页面支持 `特别关注`、`隐藏软件列表` 和只读 `已发现软件`。
- `特别关注` 显示今日/共计前台运行、后台运行、活跃时长和上次打开时间。
- `隐藏软件列表` 会继续本地记录软件，但从默认概览、排行和分布中隐藏。
- `已发现软件` 支持英文、中文、拼音全拼和拼音首字母的本地离线搜索。
- 设置页支持开机自启动、关闭窗口行为、分钟数显示和主题偏好。
- 开机自启动默认开启，使用当前用户级自启动机制，不需要管理员权限。
- 首次关闭窗口时会询问“直接退出”或“最小化到状态栏”，后续可在设置中更改。
- 中文 UI 标题：`全局软件计时器`。
- 中文时长格式：小数小时，例如 `8.3小时` 或 `0.7小时`。
- 未完成页面入口会明确显示 `该功能暂未完成`，避免误导。

### 下载安装

前往 [v0.2.3 Release](https://github.com/Awes0meE/Global-Software-Timer/releases/tag/v0.2.3) 下载 Windows x64 安装包。

推荐下载：

- `Global.Software.Timer_0.2.3_x64-setup.exe`
- `Global.Software.Timer_0.2.3_x64_en-US.msi`

> 当前安装包未签名，Windows 首次安装时可能会显示 SmartScreen 提示。

### 隐私边界

v0.2.3 只记录本地软件使用统计和本机偏好所需的数据。

会记录：

- 应用程序可执行文件身份。
- 面向用户展示的软件名称。
- 应用运行时长。
- 今日电脑记录时长。
- 基于键盘/鼠标空闲状态的今日活跃时长。
- `软件` 页面标记，例如特别关注或隐藏。
- `软件` 页面前台/后台运行汇总和前台聚焦活跃时长。
- 后台软件的可执行文件路径、每日后台时长、CPU 时间、内存与进程数峰值。
- 本机设置偏好，例如开机自启动和关闭窗口行为。

不会记录：

- 窗口标题。
- 文档名称。
- 网页标题。
- 键盘输入内容。
- 鼠标坐标。
- 文件内容。
- 浏览器历史记录。
- 云端数据。

更多细节见 [PRIVACY.md](./PRIVACY.md)。

### 技术架构

```text
┌──────────────────────────┐
│ React + TypeScript UI    │
│ Instrument dashboard     │
└─────────────┬────────────┘
              │ Tauri commands
┌─────────────▼────────────┐
│ Rust application core    │
│ tray, tracker, commands  │
└─────────────┬────────────┘
              │ repositories
┌─────────────▼────────────┐
│ SQLite local database    │
│ events, sessions, daily  │
└──────────────────────────┘
```

主要模块：

- `tracker`：周期性扫描进程，维护运行会话和心跳。
- `classifier`：把原始进程转换成用户关心的软件，并过滤噪声。
- `storage`：SQLite schema、事件日志、会话、软件身份和汇总表。
- `activity`：基于 Windows 空闲时间检测今日活跃时长。
- `commands`：给前端仪表盘提供 Tauri command API。
- `tray`：系统状态栏入口、打开仪表盘和退出。

### 本地开发

开发接手前先看 [当前实现与已知问题](./docs/CURRENT_STATE.md)。有关软件分组、后台统计和数据库升级的变化，请参阅 [v0.1.5 发布说明](./docs/releases/v0.1.5.md)。

需要：

- Windows 10/11
- Node.js / npm
- Rust / Cargo
- Visual Studio 2022 Build Tools
- Microsoft Edge WebView2 Runtime

安装依赖：

```powershell
npm install
```

启动开发版：

```powershell
. .\scripts\dev-env.ps1
npm run tauri:dev
```

运行检查：

```powershell
. .\scripts\dev-env.ps1
npm.cmd run check
```

打包 Windows 安装包：

```powershell
. .\scripts\dev-env.ps1
npm.cmd run release:build
```

完整的分支、检查、评审和发布流程见 [docs/DEVELOPMENT_WORKFLOW.md](./docs/DEVELOPMENT_WORKFLOW.md)。

### 项目结构

```text
.
├── src/                  # React + TypeScript dashboard
├── src/components/       # Dashboard UI components
├── src-tauri/src/        # Rust tracker, storage, tray, commands
├── src-tauri/tests/      # Rust integration tests
├── docs/superpowers/     # Product spec and implementation plan
├── scripts/              # Windows development environment helpers
├── PRIVACY.md            # Privacy statement
├── CONTRIBUTING.md       # Contribution guide
└── README.md
```

### 路线图

v0.2.3 已聚焦于 Windows、本地记录、基础仪表盘、设置页、`软件` 页面、系统状态栏和隐私边界。

后续可能加入：

- 周/月/年统计。
- 应用分类和更丰富的趋势分析。
- 数据导出与备份。
- macOS 支持。
- Notion、Obsidian 等工具的导出或插件工作流。
- 可选的增强检测能力，但必须明确说明隐私影响并由用户主动开启。

明确不属于 v0.2.3 的内容：

- 云同步。
- 用户账号。
- 付费/许可系统。
- 窗口标题、文档名、网页标题采集。
- 默认管理员权限。

---

<a id="english"></a>

## English

Global Software Timer is a Windows-first, local-first desktop tray app that tracks how long you run desktop software. It focuses on productivity, engineering, design, office, and creative tools.

The app runs quietly in the background, stores data locally, and opens an instrument-style dashboard, in light or dark, when you need to inspect your time.

### Features

- Windows 10/11 desktop tray app.
- Runtime tracking across software updates and for Windows 11 tray apps.
- A background page with CPU, memory and daily runtime for grouped processes.
- SQLite storage with event/session data and daily summaries.
- Smart default filtering for noisy system and background processes.
- A dot-matrix LCD readout for Today Recorded, Today Active, and Most Used, with a segmented 24-hour dial.
- Light and dark themes that follow Windows by default and can be fixed in Settings.
- Per-application usage table and today's usage mix.
- Settings page for startup at login, close-window behavior, minutes display, and theme.
- Startup at login is enabled by default through the current-user autostart mechanism and does not require administrator permission.
- The first close asks whether to exit or minimize to tray; the saved choice can be changed later in Settings.
- Software page with focused software, hidden software, discovered software, local search, and per-software focused active time.
- Hidden software remains recorded locally but is excluded from default dashboard summaries and rankings.
- Privacy-first design: no account, no telemetry, no cloud upload.
- Chinese UI readiness with the title `全局软件计时器`.

### Installation

Download the Windows x64 installer from [v0.2.3 Release](https://github.com/Awes0meE/Global-Software-Timer/releases/tag/v0.2.3).

Available bundles:

- `Global.Software.Timer_0.2.3_x64-setup.exe`
- `Global.Software.Timer_0.2.3_x64_en-US.msi`

> The current Windows installers are unsigned, so Windows may show a SmartScreen warning on first install.

### Privacy Model

Global Software Timer v0.2.3 records only app-level local usage data and local app preferences.

It records:

- Application executable identity.
- User-facing application name.
- Application runtime.
- Daily recorded computer time.
- Daily active computer time based on keyboard/mouse idle state.
- Software-page marks such as focused or hidden.
- Software-page foreground/background runtime aggregates and focused active time.
- Background executable paths, daily runtime, CPU time, peak memory and peak process count.
- Local app preferences such as startup at login and close-window behavior.

It does not record:

- Window titles.
- Document names.
- Webpage titles.
- Keystrokes.
- Mouse coordinates.
- File contents.
- Browser history.
- Cloud data.

See [PRIVACY.md](./PRIVACY.md) for the full privacy statement.

### Architecture

Global Software Timer uses:

- Tauri v2 for the desktop shell, tray integration, and packaging.
- Rust for process scanning, classification, tracking, persistence, and native Windows integration.
- React and TypeScript for the dashboard UI.
- SQLite for local durable storage.

### Development

Read [current implementation and known issues](./docs/CURRENT_STATE.md) before starting work. See the [v0.1.5 release notes](./docs/releases/v0.1.5.md) for tracking changes and database upgrade information.

Install dependencies:

```powershell
npm install
```

Run the desktop app in development:

```powershell
. .\scripts\dev-env.ps1
npm run tauri:dev
```

Run checks:

```powershell
. .\scripts\dev-env.ps1
npm.cmd run check
```

Build release bundles:

```powershell
. .\scripts\dev-env.ps1
npm.cmd run release:build
```

See [Development Workflow](./docs/DEVELOPMENT_WORKFLOW.md) for review gates and release-script failure checks, and [Current State](./docs/CURRENT_STATE.md) for the unreleased reliability fixes and remaining work.

### Roadmap

Planned directions include richer analytics, weekly/monthly/yearly views, export and backup, macOS support, and optional integrations with productivity tools. Privacy-sensitive features must stay explicit and opt-in.

---

## 贡献

欢迎提交 issue、建议和 pull request。贡献前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

开发原则：

- 保持本地优先。
- 不添加遥测。
- 不默认请求管理员权限。
- 隐私敏感能力必须明确说明并由用户主动开启。

## 许可证

本项目使用 [MIT License](./LICENSE)。

液晶读数窗使用的 [方舟像素字体 Ark Pixel Font](https://github.com/TakWolf/ark-pixel-font)（作者 TakWolf）以 SIL Open Font License 1.1 授权，随应用打包在 `src/assets/fonts/`，许可文本见 [ark-pixel-OFL.txt](./src/assets/fonts/ark-pixel-OFL.txt)。

The LCD readout bundles [Ark Pixel Font](https://github.com/TakWolf/ark-pixel-font) by TakWolf under the SIL Open Font License 1.1; see [ark-pixel-OFL.txt](./src/assets/fonts/ark-pixel-OFL.txt).
