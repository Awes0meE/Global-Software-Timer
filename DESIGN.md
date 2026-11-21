---
name: 全局软件计时器
description: GST 桌面计时仪器：概览、软件管理、统计、成就与设置界面（浅色 / 深色）
colors:
  modal-scrim: "rgb(0 0 0 / 45%)"
  icon-well: "#767d85"
  knob-top-light: "#ffffff"
  knob-middle-light: "#d9dadc"
  knob-base-light: "#b4b7ba"
  knob-top-dark: "#e7e8ea"
  knob-middle-dark: "#a9acb0"
  knob-base-dark: "#7d8085"
  case-light: "#dcdee1"
  panel-light: "#e9eaec"
  panel-raised-light: "#f4f5f6"
  panel-sunken-light: "#e1e3e6"
  edge-light: "#c7cace"
  ink-light: "#1b1d20"
  muted-light: "#5b6068"
  lcd-light: "#c0cabc"
  lcd-ink-light: "#17211a"
  lcd-dim-light: "#3c483f"
  case-dark: "#111214"
  panel-dark: "#1a1b1e"
  panel-raised-dark: "#222327"
  panel-sunken-dark: "#151618"
  edge-dark: "#2b2d31"
  ink-dark: "#ecebe6"
  muted-dark: "#a3a19a"
  lcd-dark: "#0a110d"
  lcd-ink-dark: "#c2f5d3"
  lcd-dim-dark: "#79a58b"
  signal: "#ff6a13"
  signal-dark: "#ff7a2a"
  signal-ink: "#b23f00"
  signal-ink-dark: "#ff9e63"
typography:
  dialog-title:
    fontSize: "18px"
  distribution-total:
    fontSize: "30px"
  compact-body:
    fontSize: "13px"
  lcd-unit:
    fontSize: "24px"
  page-title:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif'
    fontSize: "22px"
    fontWeight: 650
  panel-title:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif'
    fontSize: "15px"
    fontWeight: 650
  body:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif'
    fontSize: "12px"
    letterSpacing: "0.08em"
  numeral:
    fontFamily: 'Bahnschrift, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontFeature: '"tnum"'
  lcd-display:
    fontFamily: '"GST Pixel", monospace'
    fontSize: "60px"
    lineHeight: 1
  lcd-text:
    fontFamily: '"GST Pixel", monospace'
    fontSize: "12px"
    lineHeight: 1
rounded:
  tag: "4px"
  pill: "999px"
  key: "6px"
  case: "10px"
  dialog: "12px"
  lcd: "6px"
spacing:
  page-gutter: "28px"
  panel-gap: "16px"
  row-inline: "18px"
components:
  button-primary:
    backgroundColor: "{colors.ink-light}"
    textColor: "{colors.panel-raised-light}"
    rounded: "{rounded.key}"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.panel-raised-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.key}"
    height: "32px"
  nav-key:
    backgroundColor: "{colors.panel-raised-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.key}"
    height: "44px"
  nav-key-active:
    backgroundColor: "{colors.panel-sunken-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.key}"
    height: "44px"
  lcd-window:
    backgroundColor: "{colors.lcd-light}"
    textColor: "{colors.lcd-ink-light}"
    rounded: "{rounded.lcd}"
  toggle:
    width: "52px"
    height: "28px"
    rounded: "14px"
---

# Design System: 全局软件计时器

## Overview

**Creative North Star: "桌面精密仪器"**

GST 像一台放在桌上的计时仪器，不是网页看板。窗口是一个仪器机壳：浅色是阳极氧化铝，深色是石墨。今天的读数显示在机壳顶部一块凹进去的点阵液晶屏里，下面是对齐的软件台账，旁边是分布色板和前台运行指示灯。参照物是博朗式桌面计算器、闹钟和实验台测量仪，以及车站钟和计时码表的 24 小时表盘。

这是 Operate 界面：用户从托盘打开窗口，几秒内读完今天的数字就关掉。材质只做到真实仪器的程度：细微的高光和阴影、凹陷的读数窗、刻字感的小标签。拒绝统计卡片网格、渐变文字和霓虹发光。

**Key Characteristics:**

- 一块主导区：概览首屏由液晶读数窗压住，其他区域退后。统计页的主导区是走纸记录仪，成就页是液晶日历刻度盘。
- 液晶屏里的文字和数字全部使用像素点阵字体（方舟像素 12px），按物理像素对齐主要读数（100% / 125% / 150% 对应 60 / 72 / 96 物理像素）。
- 信号橙只表示“正在发生”：前台运行指示灯、正在记录灯（包括走纸记录仪上今天那根记录针旁的小灯）、开关亮灯和键盘焦点。主操作是深色按键，不用橙色。唯一的例外是达成后的 6666 小时终极成就铭牌，用信号橙描边。
- 分布图的多种颜色只出现在“今日分布”那块带框的色板里。
- 所有时长使用等宽数字并右对齐。

## Colors

两套中性色机壳加一个信号色；液晶屏有自己的一套墨色。

### Primary

- **信号橙** (#ff6a13，深色 #ff7a2a)：前台运行指示灯、正在记录灯、开关亮灯、键盘焦点环和错误提示。文字场景改用 **信号橙墨** (#b23f00 / #ff9e63)，保证对比度。

### Neutral

- **铝机壳 / 石墨机壳** (#dcdee1 / #111214)：页面底色。浅色是偏冷的阳极氧化铝，不是暖米色。
- **面板** (#e9eaec / #1a1b1e)：侧栏和所有面板；**凸起面板** (#f4f5f6 / #222327) 用于按键；**凹陷面板** (#e1e3e6 / #151618) 用于当前导航、表头、搜索框和开关槽。
- **墨色** (#1b1d20 / #ecebe6)：正文、数字和主按键底色；**次要墨** (#5b6068 / #a3a19a)：说明、表头和单位，两套主题都达到 4.5:1 以上。
- **边线** (#c7cace / #2b2d31)：面板描边和表格行线。

### LCD

- **反射式液晶** (#c0cabc，墨 #17211a，暗字 #3c483f)：浅色主题，大号数字带 1px 投影，模拟液晶字段压在背板上的影子；12px 小字不加投影，避免笔画糊开。
- **背光液晶** (#0a110d，墨 #c2f5d3，暗字 #79a58b)：深色主题，数字带轻微荧光。
- 未点亮的表盘分段使用 8% 左右的墨色作为“鬼影”。

### Distribution plate

七个分类色 (`--mix-1` 到 `--mix-7`)，深浅主题各有一套。它们只出现在今日分布的色条和图例里。

## Typography

- 界面文字：Segoe UI Variable Text 和 Microsoft YaHei UI。页面标题 22px/650，面板标题 15px/650，正文 14px，标签和表头 12px，字距 0.04 到 0.12em。
- 界面里的数字：Bahnschrift 等宽数字，表格里 15px。
- 液晶屏：GST Pixel（方舟像素字体 12px，SIL OFL 1.1，`src/assets/fonts/`）。主读数 60px，单位和软件名 24px，标签和说明 12px。按物理像素对齐主要读数（100% / 125% / 150% 对应 60 / 72 / 96 物理像素），像素才不会糊。
- 时长遵循用户在设置里选的格式，默认一位小数小时（`8.3小时`），也可以显示小时加分钟（`8小时35分钟`）。液晶屏里数字和单位分开排版，数字大、单位小。

## Layout

- 侧栏固定 232px（1200px 以下 196px）：钟表标志、按键式导航、底部的记录状态和版本号。
- 右侧是页头（页标题、日期、导出、更多）和独立滚动的正文。单日日期按钮只在概览和后台显示；软件、统计、成就有自己的时间范围，设置页不看数据，这四页不显示它，页边距 28px，面板间距 16px。
- 概览：液晶读数窗占满宽度；下方是台账表（主列）和右栏（今日分布 + 正在运行，300 到 360px）。1320px 以下“最常用”移到读数窗第二行；900px 以下右栏移到台账下方。
- 软件页：特别关注占满第一行（九列表格，可横向滚动）；隐藏软件列表和已发现软件并排在第二行。内容区 760px 以下改为一栏。
- 统计页自上而下：区间条（分段选择器、当前区间与对比区间小字、右端“包含隐藏软件”开关）→ 每日趋势（走纸记录仪，占满宽度，是唯一主导区）→ 有“无软件明细”日子时的一行提示 → 区间排行与开着没用两栏台账 → 会话台账 → 作息面板（四格）。窗口 1200px 以下两栏台账改为一栏，作息改为两格一行。
- 成就页自上而下：液晶屏（左侧日历刻度盘，右侧连续天数和区间读数，占满宽度，是主导区）→ 一行范围说明和“包含隐藏软件”开关 → 个人纪录（两格）→ 里程碑铭牌（六块一排）→ 软件来去。窗口 1200px 以下点阵格子和读数栏收窄。
- 设置页采用全宽单栏。顶部液晶栏显示应用名称、当前版本和数据存储方式，下方依次排列运行、显示和隐私。

## Elevation & Depth

- 面板：只用一种层级，即顶部 1px 内高光、1px 边线和 1px 近阴影，像嵌在机壳上的面板。不加大面积柔和阴影，不做悬浮卡片。面板标题是刻字效果：次要墨色加 1px 高光。
- 按键：凸起；按下时下移 1px，阴影转为内阴影。
- 凹陷：液晶屏、搜索框、开关槽和设置图标座使用内阴影。
- 对话框：更深的远阴影，背景压暗并轻微模糊。

## Shapes

- 按键和输入框圆角 6px，面板 10px，对话框 12px，液晶屏 6px，开关 14px。
- 指示灯是 8px 圆点：亮灯为信号橙加光晕，托盘运行为信号橙空心圆环（概览列表与台账一致），后台运行为灰色空心圆环，未运行为暗灰实心。
- 液晶表盘是 48 段圆环，满圈 24 小时；三角指针标出今天已经过去的时间。

## Components

- **导航按键**：可用页面都是凸起的按键，当前页是按下去的状态（内阴影）；未开放项是平的、变暗，带“未开放”刻字标签，悬停或聚焦时显示“该功能暂未完成”。页头里未开放的日期、导出、更多同样是平的描边按钮。
- **液晶读数窗**：表盘、今日记录、今日活跃、最常用。最常用的软件图标去色后印在液晶墨色里。
- **液晶表盘**：容量刻度，不是时间轴。外圈点亮段数 = 今日记录，内圈 = 今日活跃，每段半小时；刻度写作 0h/6h/12h/18h；三角指针和中心的“今日已过 HH:MM”标出今天已经过去的时间，也是两项读数的上限。
- **台账表**：软件名和进程名分两行；累计和今天右对齐；状态由指示灯加文字表示。
- **今日分布色板**：总活跃时长、色条、可滚动的图例行。
- **滑动开关**：凹槽、金属旋钮、左侧小灯窗，开启时灯亮。
- **分段选择器**：主题三档（跟随系统 / 浅色 / 深色）、统计区间六档（近 7 天 / 本周 / 本月 / 近 30 天 / 今年 / 自定义，自定义展开两个日期框）、热力图范围三档（近 90 天 / 近半年 / 近一年），选中项凸起。
- **走纸记录仪趋势图**：凹陷纸槽，两端是滚轴，中间横向走纸。每天一根记录针柱，记录浅、活跃深；活跃率是一条细描线（超过 40 天按 7 天一段算），日均活跃是一条带三角标的虚线刻度。左侧刻度 0h 到 24h，右侧是活跃率刻度。没有记录的日子画成空槽，标“无记录”。区间到今天为止时，今天的针柱顶端有记录笔，日期旁亮一盏信号橙小灯。10 天以内逐日标注日期和数值，窗口窄时依次缩成短数值、只标日期；40 天以内标周一，更长标月份，未标数值的日子悬停显示读数卡。面板头放图例和区间合计：记录、活跃（带“比上期 ±N%”或“无对比”）和活跃率。图本身带一句汇总的读屏说明，另附视觉隐藏的逐日表格。
- **液晶点阵热力图（日历刻度盘）**：整块放在液晶屏里，每月一个 7 列点阵（周一在前），月份之间用点状刻线分隔，月头写“用过 N 天 · X小时”（近一年改用小格子，只写“用过 N 天”，完整数字在悬停说明里）。格子四级墨色：没用（活跃不到 5 分钟，保留样稿的浅底描边）、不到 1 小时、不到 3 小时、3 小时以上；还没到的日子是虚线框，本机开始记录之前的日子只有一个暗点，今天加一圈外框。右侧读数：当前连续、最长连续（下面小字写起止日期）、“{范围}里用过 N 天”“{范围}活跃”，以及过滤说明和图例。每格有“日期 活跃 X小时”的读屏标签，另附视觉隐藏的逐日表格。
- **里程碑铭牌**：六块刻字铭牌，10 / 50 / 100 / 500 / 1000 / 6666 小时。已点亮的铭牌凸起、四角有螺钉，每个软件只出现在它达到的最高一档上，列出最多三个软件和解锁日期，其余写“另 N 个软件”；这一档的软件都升到更高档时写“都已升到更高一档”。未点亮的铭牌是凹陷空槽，写“未点亮”，下面是累计焦点最多的软件到这一档的进度刻度（“最接近 X · N%”，百分比向下取整）。6666 小时刻“终极成就”，达成前和其他档一样是凹槽，达成后才换成信号橙描边。
- **统计台账**：区间排行、开着没用、会话三张台账沿用软件台账的写法（图标加名称、右对齐数字、行线）。名次变化写“新上榜”、上升或下降箭头加名次差、“持平”，读屏另有“上升 N 名”之类的文字；开着没用每行下面一条细条，浅色是窗口开着的时间，深色是焦点。
- **按钮**：主按钮是深色按键（墨色底、浅色字，“添加”带加号图标），次按钮是凸起面板。
- **动效**：记录灯缓慢呼吸，开关、按键和对话框过渡 120 到 220ms，减少动态效果时全部关闭。

## Do's and Don'ts

- **Do** 液晶屏里只用像素字体，并且按物理像素对齐主要读数（100% / 125% / 150% 对应 60 / 72 / 96 物理像素）。
- **Do** 状态同时用指示灯和文字表达，不只靠颜色。
- **Do** 新增的分类色只放进带框的色板里。
- **Do** 成就页只记录，不设目标：写“用过 / 没用”“用过 N 天”，5 分钟门槛写成过滤说明（“活跃不到 5 分钟的日子不算在内，免得开机看一眼也被记上”）。
- **Don't** 把信号橙用在装饰、未激活状态或大面积背景上。
- **Don't** 引入统计卡片网格、渐变文字、玻璃拟态或霓虹发光。统计页和成就页也一样，每页只有一个主图。
- **Don't** 在页面上写“达标 / 未达标”、“今天还差几分钟”、倒计时或“保持连续”之类的提示，也不为连续天数发通知。
- **Don't** 在液晶屏之外使用点阵网格纹理。
