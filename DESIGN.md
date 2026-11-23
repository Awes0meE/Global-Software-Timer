---
name: 全局软件计时器
description: GST 玻璃里的墨水屏仪器：概览、软件管理、统计、成就与设置界面（浅色 / 深色）
colors:
  modal-scrim: "rgb(0 0 0 / 45%)"
  base-light: "#eceef3"
  glass-light: "rgba(255, 255, 255, 0.5)"
  glass-solid-light: "#f6f7f9"
  glass-2-light: "rgba(255, 255, 255, 0.55)"
  chip-light: "rgba(20, 30, 60, 0.06)"
  on-light: "rgba(255, 255, 255, 0.75)"
  side-light: "rgba(255, 255, 255, 0.38)"
  edge-light: "rgba(255, 255, 255, 0.75)"
  edge-strong-light: "rgba(20, 30, 60, 0.18)"
  rule-light: "rgba(20, 30, 60, 0.07)"
  ink-light: "#17191d"
  ink-2-light: "#33373e"
  muted-light: "#5a606c"
  accent-light: "#2f7de1"
  alert-ink-light: "#b42318"
  alert-wash-light: "rgba(180, 35, 24, 0.1)"
  eink-paper-light: "#fafaf7"
  eink-ink-light: "#0b0b0a"
  eink-dim-light: "#45443f"
  eink-mid-light: "#7c7b76"
  base-dark: "#17171a"
  glass-dark: "rgba(40, 40, 46, 0.42)"
  glass-solid-dark: "#1e1e22"
  glass-2-dark: "rgba(255, 255, 255, 0.06)"
  chip-dark: "rgba(255, 255, 255, 0.07)"
  on-dark: "rgba(255, 255, 255, 0.1)"
  side-dark: "rgba(30, 30, 34, 0.55)"
  edge-dark: "rgba(255, 255, 255, 0.11)"
  edge-strong-dark: "rgba(255, 255, 255, 0.18)"
  rule-dark: "rgba(255, 255, 255, 0.07)"
  ink-dark: "#f1f3f7"
  ink-2-dark: "#d5d9e0"
  muted-dark: "#98a0ad"
  accent-dark: "#5aa9ff"
  alert-ink-dark: "#ff8a80"
  alert-wash-dark: "rgba(255, 138, 128, 0.08)"
  eink-paper-dark: "linear-gradient(105deg, #1f2d40 0%, #281f40 45%, #401f40 100%)"
  eink-paper-solid-light: "#fafaf7"
  eink-paper-solid-dark: "#281f40"
  eink-ink-dark: "#f7f7f9"
  eink-dim-dark: "#c4c1ca"
  eink-mid-dark: "#85828b"
  signal: "#ff6a13"
  signal-dark: "#ff7a2a"
  signal-ink: "#b23f00"
  signal-ink-dark: "#ff9e63"
  mix-1-light: "#2f7de1"
  mix-2-light: "#e2536a"
  mix-3-light: "#1fa874"
  mix-4-light: "#7d5ce0"
  mix-5-light: "#d99a0b"
  mix-6-light: "#0f9fb8"
  mix-7-light: "#7b8594"
  mix-1-dark: "#5aa9ff"
  mix-2-dark: "#ff6b81"
  mix-3-dark: "#3ddc97"
  mix-4-dark: "#a78bfa"
  mix-5-dark: "#fbbf24"
  mix-6-dark: "#22d3ee"
  mix-7-dark: "#94a3b8"
typography:
  dialog-title:
    fontSize: "18px"
  distribution-total:
    fontSize: "30px"
  compact-body:
    fontSize: "13px"
  pixel-unit:
    fontSize: "24px"
  page-title:
    fontFamily: '"Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "22px"
    fontWeight: 650
  panel-title:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "15px"
    fontWeight: 650
  body:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "12px"
    letterSpacing: "0.08em"
  numeral:
    fontFamily: 'Bahnschrift, "Segoe UI Variable Display", "Segoe UI", sans-serif'
    fontSize: "15px"
    fontFeature: '"tnum"'
  pixel-display:
    fontFamily: '"GST Pixel", "Microsoft YaHei UI", monospace'
    fontSize: "60px"
    lineHeight: 1
  pixel-text:
    fontFamily: '"GST Pixel", "Microsoft YaHei UI", monospace'
    fontSize: "12px"
    lineHeight: 1
rounded:
  tag: "4px"
  pill: "999px"
  key: "9px"
  screen: "11px"
  panel: "16px"
  dialog: "16px"
spacing:
  page-gutter: "28px"
  panel-gap: "16px"
  row-inline: "18px"
components:
  glass-panel:
    backgroundColor: "{colors.glass-light}"
    rounded: "{rounded.panel}"
  button-primary:
    backgroundColor: "{colors.ink-light}"
    textColor: "{colors.glass-solid-light}"
    rounded: "{rounded.key}"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.glass-2-light}"
    textColor: "{colors.ink-2-light}"
    rounded: "{rounded.key}"
    height: "32px"
  nav-key:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2-light}"
    rounded: "{rounded.key}"
    height: "44px"
  nav-key-active:
    backgroundColor: "{colors.on-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.key}"
    height: "44px"
  eink-screen:
    backgroundColor: "{colors.eink-paper-light}"
    textColor: "{colors.eink-ink-light}"
    rounded: "{rounded.screen}"
  toggle:
    width: "52px"
    height: "28px"
    rounded: "{rounded.pill}"
---

# Design System: 全局软件计时器

## Overview

**Creative North Star: "玻璃里的墨水屏仪器"**

GST 的窗口是一块浮在柔和光晕上的云母玻璃，今天的读数印在嵌进玻璃的哑光墨水屏上。玻璃负责轻和透，墨水屏负责安静、清楚、不发光。浅色是带冷蓝、粉、紫光晕的白玻璃，深色是同样光晕下的烟色玻璃；墨水屏浅色是近白的纸，深色是蓝紫渐变的深色纸。

这是 Operate 界面：用户从托盘打开窗口，几秒内读完今天的数字就关掉。材质只做到真实的程度：半透明、轻微饱和、一圈细描边和一行上沿高光；墨水屏是内凹的哑光纸面加一点颗粒。拒绝统计卡片网格、渐变文字、霓虹发光和层层叠加的毛玻璃。

**Key Characteristics:**

- 每页一个主图：概览是墨水屏读数屏，统计页是走纸记录仪，成就页是墨水屏日历刻度盘，其他区域退后。
- 像素字只在墨水屏里：读数屏、成就页日历刻度盘和设置屏里的文字和数字使用像素点阵字体（方舟像素 12px），按物理像素对齐主要读数（100% / 125% / 150% 对应 60 / 72 / 96 物理像素）；走纸记录仪的纸面借用墨水屏材质，刻度和数值仍用 Bahnschrift 和界面字体；屏外不用像素字。
- 信号橙只表示“此刻”：侧栏“正在记录”灯、前台运行指示灯、托盘运行空心环、走纸记录仪上今天那根记录针旁的小灯。
- 强调色表示选中和焦点：当前导航项的左侧内条、键盘焦点环、文字选区、搜索命中、开关开启态、排序按钮、添加软件对话框的选中行（`--accent` 14% 底加左侧内条）和达成后的 6666 小时终极成就铭牌。
- mix 色是软件身份色：用来标识软件，旁边总有软件名。
- 所有时长使用等宽数字并右对齐。

## Colors

一层玻璃外壳、两档墨色、一块墨水屏，加上三个功能色：信号橙、强调色、警示色。软件身份色另成一组。

### 玻璃外壳

- **底色** `--base` (#eceef3 / #17171a)：`body` 的底色，上面叠一层 `--glow` 光晕（左上蓝、右上粉、下方紫三个径向渐变）。光晕只在 `body` 画一次，`body` 不滚动，所以光晕固定不动。
- **玻璃** `--glass` (rgba(255,255,255,.50) / rgba(40,40,46,.42))：页面顶层面板；**侧栏** `--side` (rgba(255,255,255,.38) / rgba(30,30,34,.55))。
- **不透明玻璃** `--glass-solid` (#f6f7f9 / #1e1e22)：对话框、悬停说明、读数卡、焦点环间隔色，以及透明效果关闭时的面板。“该功能暂未完成”提示气泡反过来，沿用 `--ink` 底、`--glass-solid` 字。吸顶表头用 `--head-solid`（浅色同 `--glass-solid`，深色 #212027）。
- **子板** `--glass-2` (rgba(255,255,255,.55) / rgba(255,255,255,.06))：面板里的子板和按钮；**浅填充** `--chip` (rgba(20,30,60,.06) / rgba(255,255,255,.07))：分段选择器轨道、搜索框、悬停行；**选中底** `--on` (rgba(255,255,255,.75) / rgba(255,255,255,.10))：当前导航项、分段选择器选中项。
- **描边** `--edge` (rgba(255,255,255,.75) / rgba(255,255,255,.11))：面板和子板的细描边；`--edge-strong` (rgba(20,30,60,.18) / rgba(255,255,255,.18))：面板里控件和对话框次要按钮的线；**分隔线** `--rule` (rgba(20,30,60,.07) / rgba(255,255,255,.07))：表格行线和侧栏分隔。
- **高光与投影**：`--glass-hi` (rgba(255,255,255,.8) / rgba(255,255,255,.07)) 是上沿高光；`--glass-shadow` 是面板投影（浅色 `0 18px 46px rgba(60,70,110,.14), 0 0 0 1px rgba(20,30,60,.06)`，深色 `0 24px 60px rgba(0,0,0,.35)`）。

### 墨色

- **墨色** `--ink` (#17191d / #f1f3f7)：正文、数字和主按键底色。
- **次墨** `--ink-2` (#33373e / #d5d9e0)：面板标题、按钮文字、导航项。
- **次要墨** `--muted` (#5a606c / #98a0ad)：说明、表头和单位。

### 墨水屏

- **纸面** `--eink-paper`：浅色 #fafaf7；深色是 105° 渐变 `#1f2d40 → #281f40 → #401f40`。SVG 填充用纯色 `--eink-paper-solid`（#fafaf7 / #281f40），表盘指针描边用 `--eink-dial-paper`（浅色同纸面，深色 #293244）。
- **墨** `--eink-ink` (#0b0b0a / #f7f7f9)：主读数；**暗墨** `--eink-dim` (#45443f / #c4c1ca)：标签和说明；**灰墨** `--eink-mid` (#7c7b76 / #85828b)：只用于刻度等图形，不作文字。
- **淡轨** `--eink-track` (rgba(11,11,10,.12) / rgba(247,247,249,.14))：未走过的刻线和未点亮的容量环段；**残影** `--eink-ghost` (rgba(11,11,10,.04) / rgba(247,247,249,.05))。
- **颗粒** `--eink-grain`：浅色 .06 `multiply`，深色 .45 `soft-light`。

### 信号橙

- **信号橙** (#ff6a13，深色 #ff7a2a)：只用于“此刻 / 正在记录”的指示灯，见 Key Characteristics。文字和托盘运行空心环用 **信号橙墨** (#b23f00 / #ff9e63)。

### 强调色

- **强调色** `--accent` (#2f7de1 / #5aa9ff)：选中和焦点，见 Key Characteristics。键盘焦点环是 2px `--glass-solid` 间隔加 2px 强调色。

### 警示色

- **警示墨** `--alert-ink` (#b42318 / #ff8a80) 和 **警示底** `--alert-wash` (rgba(180,35,24,.10) / rgba(255,138,128,.08))：错误、警告和移除类元素（警告条、对话框错误、统计区间错误、隐藏列表的移除按钮）。不借用信号橙。

### 身份色

- 七个软件身份色 `--mix-1` 到 `--mix-7`：浅色 #2f7de1 #e2536a #1fa874 #7d5ce0 #d99a0b #0f9fb8 #7b8594，深色 #5aa9ff #ff6b81 #3ddc97 #a78bfa #fbbf24 #22d3ee #94a3b8。全 app 都可以用来标识软件，深色下可以带轻微同色微光；同一个软件在同一页里颜色一致。身份色不单独承载信息，旁边必须有软件名。目前只有今日分布在用，按列表顺序循环取色。

### 对比度规则

- 正文和小字达到 4.5:1；墨水屏大字（像素字 24px 及以上）至少 3:1；刻度、焦点环等图形至少 3:1。半透明底按叠在对比最差的光晕中心上计算。
- 低于 3:1 的两处是 2026-11-23 用户接受的偏差，不要当成缺陷修掉：表盘指针 ±5° 内让开的已走过细刻线（2.17 / 2.32，整点刻线让开后仍有 4.47 / 5.04），以及开关关闭态的淡 `--edge-strong` 描边。
- 文字按底色取色：玻璃面板、侧栏、`--glass-solid` 上用 `--ink` / `--ink-2` / `--muted`；`--chip`、`--on` 底上（含悬停、按下和选中态）只用 `--ink` / `--ink-2`，不用 `--muted`（分段选择器、当前导航项、按钮悬停、悬停行、默认图标座都在同一规则里把 `--muted` 改指 `--ink-2`）；直接画在光晕背景上的文字（统计区间工具条、警告条、面板外的读取提示、成就范围条、页头）用 `--ink` / `--ink-2`，不用 `--muted`，警告条和统计区间错误用 `--alert-wash` 叠 `--glass-solid` 的不透明底；`--alert-wash` 上用 `--alert-ink`；墨水屏里主读数 `--eink-ink`、标签说明 `--eink-dim`。
- 浅色 `--accent` 对玻璃只有约 3.3:1，不能用作文字，只作图形。
- 浅色 `--muted` 取 #5a606c，不能再调浅；深色 `--alert-wash` 不透明度取 .08，不能再调高。
- 深色 `--muted` 在 `--glass-2` 子板上不到 4.5:1，所以在今日分布色板和已点亮的里程碑铭牌里，`--muted` 局部改指 `--ink-2`；全局的深色 `--muted` 不变。

## Typography

- 界面文字：Segoe UI Variable Text 和 Microsoft YaHei UI。面板标题 15px/650，正文 14px，标签和表头 12px，字距 0.04 到 0.12em。
- 页面标题：Segoe UI Variable Display 22px/650，回退到界面字体。
- 界面里的数字：Bahnschrift 等宽数字，表格里 15px。走纸记录仪上的刻度和数值也用 Bahnschrift 和界面字体。
- 墨水屏：GST Pixel（方舟像素字体 12px，SIL OFL 1.1，`src/assets/fonts/`），只用在屏内。主读数 60px，单位和软件名 24px，标签和说明 12px；成就页主读数 48px。按物理像素对齐主要读数（100% / 125% / 150% 对应 60 / 72 / 96 物理像素），像素才不会糊。
- 时长遵循用户在设置里选的格式，默认一位小数小时（`8.3小时`），也可以显示小时加分钟（`8小时35分钟`）。墨水屏里数字和单位分开排版，数字大、单位小。

## Layout

- 侧栏固定 232px（1200px 以下 196px）：钟表标志、导航、底部的记录状态和版本号。
- 右侧是页头（页标题、日期、导出、更多）和独立滚动的正文。单日日期按钮只在概览和后台显示；软件、统计、成就有自己的时间范围，设置页不看数据，这四页不显示它。页边距 28px，面板间距 16px。
- 概览：墨水屏读数屏占满宽度；下方是台账表（主列）和右栏（今日分布 + 正在运行，300 到 360px）。1320px 以下“最常用”移到读数屏第二行；900px 以下右栏移到台账下方。
- 软件页：特别关注占满第一行（九列表格，可横向滚动）；隐藏软件列表和已发现软件并排在第二行。内容区 760px 以下改为一栏。
- 统计页自上而下：区间条（分段选择器、当前区间与对比区间小字、右端“包含隐藏软件”开关）→ 每日趋势（走纸记录仪，占满宽度，是唯一主导区）→ 有“无软件明细”日子时的一行提示 → 区间排行与开着没用两栏台账 → 会话台账 → 作息面板（四格）。窗口 1200px 以下两栏台账改为一栏，作息改为两格一行。
- 成就页自上而下：墨水屏（左侧日历刻度盘，右侧连续天数和区间读数，占满宽度，是主导区）→ 一行范围说明和“包含隐藏软件”开关 → 个人纪录（两格）→ 里程碑铭牌（六块一排）→ 软件来去。窗口 1200px 以下点阵格子和读数栏收窄。
- 设置页采用全宽单栏。顶部墨水屏栏显示应用名称、当前版本和数据存储方式，下方依次排列运行、显示和隐私。

## Elevation & Depth

- 玻璃只有一层：只有侧栏和页面顶层面板（`.panel`、`.readout`、`.software-panel`）带 `backdrop-filter: blur(30px) saturate(1.4)`，同屏最多 6 个模糊层（统计页的侧栏加 5 块面板已到上限），不嵌套，模糊半径不按组件调。面板配方：`--glass` 底、内收 1px `--edge` 描边（`outline`，不占盒子）、`--glass-shadow` 投影加 2px `--glass-hi` 上沿高光、圆角 16px。
- 子板只用半透明填充：面板里的子板、按钮、分段选择器、表格行和提示卡用 `--glass-2`、`--chip` 或 `--on`，不再模糊。页头按钮同样不加模糊。
- 浮层不透明：对话框、悬停说明和读数卡用 `--glass-solid`，吸顶表头用 `--head-solid`；“该功能暂未完成”提示气泡是 `--ink` 底、`--glass-solid` 字。对话框背后的遮罩保留 2px 模糊，不计入 6 个模糊层。
- 墨水屏内凹：`inset 0 1px 3px rgba(0,0,0,.28), inset 0 0 0 1px rgba(0,0,0,.10), 0 1px 0 var(--glass-hi)`，纸面上一层 SVG 噪点颗粒和一层自上而下的哑光渐变，不发光。
- 三种回退切换同一组 token（`--glass-surface`、`--side-surface`、`--glass-filter`）：Windows“透明效果”关闭时根元素带 `data-glass="off"`（启动时和窗口重新可见时读注册表，只读、不保存），`prefers-reduced-transparency: reduce` 媒体查询，以及 `@supports not (backdrop-filter: …)`。三者效果相同：面板和侧栏改用 `--glass-solid`、去掉模糊，光晕保留。强制颜色模式下面板和墨水屏用系统色 `Canvas` / `CanvasText` 和内收 `outline: 1px solid CanvasText`，光晕、颗粒和残影都去掉；只靠阴影画边的控件同样加内收 `outline`，盒子不变；焦点环改为 2px `Highlight` 描边。

## Shapes

- 标签 4px，按钮、导航项和输入框 9px，墨水屏 11px，面板 16px，对话框 16px，开关和胶囊 999px。
- 指示灯是 8px 圆点：前台运行为信号橙实心加 8px 微光，正在记录灯缓慢呼吸，托盘运行为信号橙墨空心圆环（概览列表与台账一致），后台运行为 `--muted` 空心圆环，未运行为暗灰实心。
- 墨水屏表盘：两圈 48 段容量环（每段半小时，满圈 24 小时），环外一圈 96 条刻线（每 15 分钟一条，整点 24 条更长），三角指针标出今天已经过去的时间。

## Components

- **侧栏**：`--side` 玻璃，右侧 1px `--edge`。
- **导航**：平的导航项，悬停 `--chip` 底；当前页 `--on` 底加 `--edge` 描边和左侧 3px `--accent` 内条。未开放项变暗，带“未开放”标签，悬停或聚焦时显示“该功能暂未完成”。
- **面板**：玻璃面板配方（见 Elevation）。
- **页头按钮**：`--glass-2` 子板加 `--edge` 线，圆角 9px，不加模糊。未开放的日期、导出、更多外观相同，文字 `--ink-2`，悬停和按下不改外观。面板里的“更多”“查看名单”“编辑”和普通按钮是 `--glass-2` 底加 1px `--edge-strong` 线。
- **读数屏**：墨水屏配方，内容是表盘、今日记录、今日活跃、最常用。最常用的软件图标半去色（`grayscale(.55) saturate(.7) contrast(1.05)`）印在屏上，不用混合模式。
- **残影**：只在概览“今日记录”“今日活跃”两个大号读数后面（成就页和设置屏没有残影），叠一层本窗口里上一次显示的值，向右下偏移 2px，颜色 `--eink-ghost`，读屏隐藏。数值还没变过、概览数据的统计日期变了（窗口藏在托盘或停在别的页面时跨天也一样）、或同一天里读数变小时都不画；统计日期取后端概览数据里的 `usage_date`，不用前端时钟；切换时长格式时清空；不做动画。
- **表盘**：容量刻度，不是时间轴。外圈点亮段数 = 今日记录（实墨 `--eink-ink`），内圈 = 今日活跃（灰墨 `--eink-mid`），未点亮段是淡轨；刻度写作 0h/6h/12h/18h。外圈刻线只表示“今日已过”：已走过的整点刻线实墨，其他已走过刻线灰墨，未走过的淡轨；离指针 ±5° 内的已走过刻线取本色与淡轨各半，让指针读成干净的三角。指针和午夜标记用 `--eink-ink`，指针带 1.5px `--eink-dial-paper` 描边；中心的“今日已过 HH:MM”用 GST Pixel，也是两项读数的上限。
- **设置屏**：墨水屏配方，没有残影。
- **台账表**：软件名和进程名分两行；累计和今天右对齐；状态由指示灯加文字表示；行线 `--rule`，悬停行 `--chip`。
- **软件图标**：图标直接放在玻璃上，不垫底色；浅色主题下加一圈沿图标自身轮廓的 0.5px 细边和 1px 轻微抬起投影（`drop-shadow`），白色图标也看得见，透明边角仍是玻璃。没有图标时显示首字母，`--chip` 底加 `--edge-strong` 线。
- **墨水屏点阵热力图（日历刻度盘）**：整块放在墨水屏里，每月一个 7 列点阵（周一在前），月份之间用 `--eink-ink` 22% 的点状刻线分隔，月头写“用过 N 天 · X小时”（近一年改用小格子，只写“用过 N 天”，完整数字在悬停说明里）。格子按 `--eink-ink` 的 9% / 44% / 70% / 100% 分四级：没用（活跃不到 5 分钟，保留浅底描边）、不到 1 小时、不到 3 小时、3 小时以上，不发光；还没到的日子是虚线框，本机开始记录之前的日子只有一个暗点，今天加一圈外框。右侧读数：当前连续、最长连续（下面小字写起止日期）、“{范围}里用过 N 天”“{范围}活跃”，以及过滤说明和图例。每格有“日期 活跃 X小时”的读屏标签，另附视觉隐藏的逐日表格。
- **走纸记录仪趋势图**：纸面用墨水屏配方（纸面、颗粒、内凹边），两端是平的 `--eink-mid` 细条滚轴，中间横向走纸。每天一根记录针柱，记录浅、活跃深（`--eink-ink`）；活跃率是一条 `--eink-dim` 细描线（超过 40 天按 7 天一段算），日均活跃是一条带三角标的 `--eink-mid` 虚线刻度。左侧刻度 0h 到 24h，右侧是活跃率刻度。没有记录的日子画成虚线空槽，标“无记录”。区间到今天为止时，今天的针柱顶端有记录笔（笔臂 `--eink-mid`），日期旁亮一盏信号橙小灯。10 天以内逐日标注日期和数值，窗口窄时依次缩成短数值、只标日期；40 天以内标周一，更长标月份，未标数值的日子悬停显示读数卡。面板头放图例和区间合计：记录、活跃（带“比上期 ±N%”或“无对比”）和活跃率。图本身带一句汇总的读屏说明，另附视觉隐藏的逐日表格。
- **里程碑铭牌**：六块铭牌，10 / 50 / 100 / 500 / 1000 / 6666 小时。已点亮的铭牌是 `--glass-2` 子板加 `--edge` 线，每个软件只出现在它达到的最高一档上，列出最多三个软件和解锁日期，其余写“另 N 个软件”；这一档的软件都升到更高档时写“都已升到更高一档”。未点亮的铭牌是内收虚线 `--edge-strong` 空槽，文字 `--muted`，写“未点亮”，下面是累计焦点最多的软件到这一档的进度刻度（“最接近 X · N%”，百分比向下取整）。6666 小时写“终极成就”，达成前和其他档一样是空槽，达成后才换成 1.5px `--accent` 描边。
- **今日分布**：总活跃时长、色条、可滚动的图例行，放在 `--glass-2` 子板里；色条用软件身份色，深色下每段带 `0 0 12px` 同色 40% 微光。
- **统计台账**：区间排行、开着没用、会话三张台账沿用软件台账的写法（图标加名称、右对齐数字、行线）。名次变化写“新上榜”、上升或下降箭头加名次差、“持平”，读屏另有“上升 N 名”之类的文字；开着没用每行下面一条细条，浅色是窗口开着的时间，深色是焦点。
- **滑动开关**：立体滑块。凹下去的 `--chip` 轨道（开启时 `--accent`）带内阴影和 1px 描边（关闭时淡 `--edge-strong`），22px 左上受光的球面圆钮带钮边、抬起投影和高光点；滑动略过冲，按下时圆钮拉长。
- **分段选择器**：主题三档（跟随系统 / 浅色 / 深色）、统计区间六档（近 7 天 / 本周 / 本月 / 近 30 天 / 今年 / 自定义，自定义展开两个日期框）、热力图范围三档（近 90 天 / 近半年 / 近一年）。轨道 `--chip`，选中项 `--on` 底加 `--edge` 线。
- **对话框**：`--glass-solid` 不透明面板，圆角 16px，`--edge-strong` 外框和远阴影；次要按钮（“取消”“退出软件”）和添加软件对话框的搜索框加 1px `--edge-strong` 线。
- **按钮**：主按钮是深色按键（墨色底、`--glass-solid` 字，“添加”带加号图标），次按钮是 `--glass-2` 子板。
- **动效**：记录灯缓慢呼吸；按键和对话框过渡 120 到 220ms；开关圆钮滑动 240ms 略过冲。减少动态效果时呼吸和过渡关闭，开关圆钮改成不过冲、按下不拉长。

## Do's and Don'ts

- **Do** 像素字体只用在墨水屏里（读数屏、日历刻度盘、设置屏；走纸记录仪纸面不用），并且按物理像素对齐主要读数（100% / 125% / 150% 对应 60 / 72 / 96 物理像素）。
- **Do** 状态同时用指示灯和文字表达，不只靠颜色；身份色旁边总有软件名。
- **Do** 选中和焦点用强调色，错误和移除用警示色。
- **Do** 成就页只记录，不设目标：写“用过 / 没用”“用过 N 天”，5 分钟门槛写成过滤说明（“活跃不到 5 分钟的日子不算在内，免得开机看一眼也被记上”）。
- **Don't** 用霓虹描边文字或渐变文字。
- **Don't** 让毛玻璃层层叠加或嵌套模糊：子板、按钮、浮层都不加 `backdrop-filter`（对话框遮罩的 2px 模糊除外，不计入上限），同屏模糊层不超过 6 个（统计页已到上限）。
- **Don't** 在墨水屏之外使用像素字或颗粒纹理。
- **Don't** 把信号橙用在装饰、选中、焦点、未激活状态或大面积背景上。
- **Don't** 引入统计卡片网格。统计页和成就页也一样，每页只有一个主图。
- **Don't** 在页面上写“达标 / 未达标”、“今天还差几分钟”、倒计时或“保持连续”之类的提示，也不为连续天数发通知。
