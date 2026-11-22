# 云母玻璃 + 墨水屏全局视觉改版设计草案

状态：草案，产品决定已确认（2026-11-22），待实现；对应版本 v0.4.0。前一版是 `2026-11-22-timeline-data-collection-design.md`（v0.3.1，只加逐段采集），后一版是 `2026-11-22-timeline-page-design.md`（v0.5.0，时间轴页直接按本规格的视觉来做）。

样稿都在仓库外，不入库（里面有第三方图标）：`F:\XJTLU\科研_DIY\Global_Software_Timer\local-mockups-2026-11-22-timeline\`。其中 `overview-glass.html?theme=light|dark&screen=eink` 是定稿配色，`style-sketch.html?style=glass` 是玻璃风格参照，`eink-dark-picker.html` 是深色墨水屏挑色页。下文标「样稿值」的数值都取自这些文件。

## 目标与范围

把全 app 从「桌面精密仪器（铝/石墨机壳 + 点阵液晶）」换成「云母玻璃外壳 + 墨水屏读数」。浅色、深色两套主题都改，默认跟随系统，设置页的 跟随系统 / 浅色 / 深色 不变。

| 做 | 不做 |
| --- | --- |
| 重写颜色、材质、圆角 token，删除液晶 token | 不加功能，不改数据、schema、口径和文案用词（「只记录，不设目标」照旧） |
| 背景光晕层、玻璃面板、墨水屏读数（像素字体保留） | 不做皮肤切换，不保留液晶皮肤 |
| 逐个组件迁移（见组件迁移表） | 侧栏「时间轴」仍是 `available: false`，显示「未开放」 |
| 重写 `DESIGN.md`，重拍 README 截图 | 不启用原生 Mica / Acrylic，不改 `tauri.conf.json` 的窗口配置 |
| 减少透明效果、Win10、强制颜色的回退 | 不新增动画，不改布局、字号和页面结构 |

应用图标（拟物时钟）保留。

## 北极星

**「玻璃里的墨水屏仪器」**：窗口是一块浮在柔和光晕上的云母玻璃，读数印在嵌进玻璃的哑光墨水屏上。玻璃负责轻和透，墨水屏负责安静、清楚、不发光。每页仍然只有一个主图（概览读数屏、统计走纸记录仪、成就日历刻度盘），其他区域退后。

## Token 架构

保留语义还成立的名字（`--ink*`、`--muted`、`--edge`、`--signal*`、`--mix-*`、`--focus`、字体、字号、`--ease`），只改值；材质变了的换新名字。

| 旧组（styles.css:14–107） | 旧 token | 新 token |
| --- | --- | --- |
| 机壳 | `--case` | `--base`（底色）+ `--glow`（光晕层），见下节 |
| 面板材质 | `--panel`、`--panel-raised` | `--glass`（面板）、`--glass-2`（面板里的子板、按钮） |
| 凹槽 | `--panel-sunken` | `--chip`（浅色填充，不再画内阴影） |
| 描边 | `--edge`、`--edge-strong` | 名字保留，值改成半透明；新增 `--rule`（表格分隔线） |
| 焦点环间隔色 | `--focus` 里的 `--panel-raised`（styles.css:53） | `--glass-solid` |
| 刻字光影 | `--highlight` | `--glass-hi`（上沿高光）；面板投影改用 `--glass-shadow`。`--shade`、`--shade-deep` 名字保留，只作少量投影的颜色（跳转链接、开关圆钮） |
| 旋钮 | `--knob-top/-middle/-base` | 删除 |
| 液晶 | `--lcd`、`--lcd-deep`、`--lcd-ink`、`--lcd-dim`、`--lcd-ghost`、`--lcd-glow`、`--lcd-grid` | 删除，换成 `--eink-*` |
| 选中态 | （无，现用信号橙） | `--accent`、`--on`（当前导航项底色） |
| 圆角 | `--radius-case 10`、`--radius-key 6`、`--radius-dialog 12` | `--radius-panel 16`、`--radius-key 9`、`--radius-screen 11`、`--radius-dialog 16`；`--radius-tag`、`--radius-pill` 不变 |
| 像素字号 | `--lcd-display-size` | 改名 `--pixel-display-size`，按 dppx 取值的规则不变（styles.css:1780–1785） |

不变：`--signal`、`--signal-ink`、`--signal-wash`、`--lamp-off`、`--modal-scrim`、`--icon-well`、`--font-*`、`--type-*`、`--panel-gutter`、`--panel-gap`。`--faint` 保留但只用于图形，原来用作文字的地方（styles.css:287、300、399，AchievementsPage.css:575、782）改用 `--muted`。`.modal-backdrop` 里的 `color-mix(… var(--case) …)`（styles.css:1431）改用 `--base`。

**新 token 取值**（墨水屏是决策书定稿值，其余是样稿值）：

| token | 浅色 | 深色 |
| --- | --- | --- |
| `--base` | `#eceef3` | `#17171a` |
| `--ink` / `--ink-2` / `--muted` | `#17191d` / `#33373e` / `#5a606c`（样稿 `#626875` 在侧栏上不到 4.5:1，见对比度表） | `#f1f3f7` / `#d5d9e0` / `#98a0ad` |
| `--glass` | `rgba(255,255,255,.50)` | `rgba(40,40,46,.42)` |
| `--glass-solid`（回退用） | `#f6f7f9` | `#1e1e22` |
| `--glass-2` / `--chip` / `--on` | `rgba(255,255,255,.55)` / `rgba(20,30,60,.06)` / `rgba(255,255,255,.75)` | `rgba(255,255,255,.06)` / `rgba(255,255,255,.07)` / `rgba(255,255,255,.10)` |
| `--side`（侧栏） | `rgba(255,255,255,.38)` | `rgba(30,30,34,.55)` |
| `--edge` / `--rule` | `rgba(255,255,255,.75)` / `rgba(20,30,60,.07)` | `rgba(255,255,255,.11)` / `rgba(255,255,255,.07)` |
| `--glass-hi` | `rgba(255,255,255,.8)` | `rgba(255,255,255,.07)` |
| `--glass-shadow` | `0 18px 46px rgba(60,70,110,.14), 0 0 0 1px rgba(20,30,60,.06)` | `0 24px 60px rgba(0,0,0,.35)` |
| `--accent` | `#2f7de1` | `#5aa9ff` |
| `--alert-ink` / `--alert-wash` | `#b42318` / `rgba(180,35,24,.10)` | `#ff8a80` / `rgba(255,138,128,.08)` |
| `--eink-paper` | `#fafaf7` | `linear-gradient(105deg, #1f2d40 0%, #281f40 45%, #401f40 100%)` |
| `--eink-paper-solid`（SVG 填充用） | `#fafaf7` | `#281f40` |
| `--eink-ink` / `--eink-dim` / `--eink-mid` | `#0b0b0a` / `#45443f` / `#7c7b76` | `#f7f7f9` / `#c4c1ca` / `#85828b` |
| `--eink-track`（未走过） | `rgba(11,11,10,.12)` | `rgba(247,247,249,.14)` |
| `--eink-ghost`（残影） | `rgba(11,11,10,.04)` | `rgba(247,247,249,.05)` |
| `--eink-grain` / 混合方式 | `.06` / `multiply` | `.45` / `soft-light`（样稿值） |
| `--mix-1…7` | `#2f7de1 #e2536a #1fa874 #7d5ce0 #d99a0b #0f9fb8 #7b8594` | `#5aa9ff #ff6b81 #3ddc97 #a78bfa #fbbf24 #22d3ee #94a3b8` |

## 背景光晕层

- `body` 的 `background: var(--case)`（styles.css:121）改成 `background: var(--glow), var(--base)`。`body` 是 `overflow: hidden`，页面在内部滚动，所以光晕固定不动，不随内容滚动。
- `--glow`（决策书值）：
  - 深色：`radial-gradient(820px 600px at 10% -4%, rgba(80,150,255,.30), transparent 62%), radial-gradient(760px 640px at 96% 14%, rgba(236,92,170,.24), transparent 60%), radial-gradient(860px 600px at 52% 108%, rgba(150,110,255,.28), transparent 62%)`
  - 浅色：结构相同，颜色依次为 `rgba(90,160,255,.34)`、`rgba(240,120,190,.26)`、`rgba(160,130,255,.30)`，位置取样稿的 `8% -6%`、`98% 10%`、`52% 110%`。
- 光晕只在 `body` 画一次，面板、弹窗、子板都不再画光晕。

## 玻璃面板配方与上限

```css
background: var(--glass); border: 1px solid var(--edge); border-radius: var(--radius-panel);
box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-hi);
backdrop-filter: blur(30px) saturate(1.4);
```

| 规则 | 值 |
| --- | --- |
| 带 `backdrop-filter` 的元素 | 只有侧栏和页面顶层面板（`.panel`、`.readout` 等），同屏最多 6 个 |
| 嵌套 | 不允许：面板里的子板、按钮、分段选择器、表格行、提示卡只用半透明填充，不再模糊 |
| 页头按钮 | `--glass-2` + `--edge`，圆角 9px，不加模糊（样稿给按钮加了 `blur(20px)`，这里去掉，省一层合成） |
| 对话框 | `--glass-solid` 不透明面板，圆角 16px；`.modal-backdrop` 保留现有 `blur(2px)`（styles.css:1432） |
| 模糊半径 | 统一 30px，不按组件调 |

光晕是平滑的径向渐变，模糊前后几乎一样，玻璃感主要来自半透明、饱和度和描边。所以性能不达标时，去掉 `backdrop-filter`、只留半透明，外观差别很小，这就是性能回退。

## 原生 Mica 还是纯 CSS：用纯 CSS

现状（`src-tauri/tauri.conf.json`）：一个窗口，系统标题栏，没有 `transparent`、`decorations`、`windowEffects`；`capabilities/default.json` 没有 `allow-set-effects`；Cargo 没有 window-vibrancy。

结论：**只用 CSS，不改窗口配置。** 原因有三点。第一，光晕层铺满整个窗口，就算开了原生 Mica 也会被盖住，看不出区别。第二，原生 Mica 要开 `transparent` 和窗口效果，只有 Win11 有，Win10 只能退到 Acrylic，而 Acrylic 拖动窗口时有已知的卡顿问题。第三，纯 CSS 在 Win10 和 Win11 上画出来一样。标题栏继续用系统标题栏，深浅色由现有 `setTheme` 控制（theme.ts）。所以 v0.4.0 不做 Win11 原生增强，也不需要管理员权限。

**回退**：统一成一个开关 `:root[data-glass="off"]`。打开后所有面板改用 `--glass-solid`、去掉 `backdrop-filter`，光晕层保留。

| 触发条件 | 做法 |
| --- | --- |
| Windows「透明效果」关闭 | 启动时、以及窗口重新可见时，读 `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize\EnableTransparency`（DWORD，0 = 关）。用一个新的只读命令返回布尔值，前端据此设 `data-glass`。只读注册表，不落库；`Win32_System_Registry` 已启用，tray_icons.rs:86 起有同类 HKCU 读取 |
| `@media (prefers-reduced-transparency: reduce)` | 同上；WebView2 是否支持要实测，所以不能只靠它 |
| `@supports not (backdrop-filter: blur(1px))` | 同上 |
| `@media (forced-colors: active)` | 面板用系统色 `Canvas`/`CanvasText`；光晕、颗粒、残影都去掉 |
| Windows 10 | 不单独分支，CSS 和 Win11 一样；只需要在 Win10 上验收 |
| 低功耗 / 低端机 | 不自动检测，跟随「透明效果」开关 |

## 墨水屏配方

适用于现在所有用 `.lcd` 或液晶 token 的地方，以及走纸记录仪的纸面。类名和组件名（`.lcd*`、`LcdDial`）这一版不改，改了只会扩大 diff，还要改测试（App.test.tsx:322–342、AchievementsPage.test.tsx:234 依赖这些类名）。

| 部分 | 做法（替换 styles.css:592–642 的液晶配方） |
| --- | --- |
| 纸面 | `background: var(--eink-paper)`，圆角 `--radius-screen` 11px；深色下用 105° 渐变 |
| 颗粒 | `::before` 换成 SVG `feTurbulence` 噪点（样稿 overview-glass.html:71），不透明度 `--eink-grain`，浅色 `multiply`、深色 `soft-light`；`pointer-events: none`。替换原来的 3px 点阵网格 |
| 哑光 | `::after` 换成 `linear-gradient(180deg, rgba(255,255,255,.10), transparent 30%, rgba(0,0,0,.015))`，替换原来 168° 的玻璃反光 |
| 内凹边 | `box-shadow: inset 0 1px 3px rgba(0,0,0,.28), inset 0 0 0 1px rgba(0,0,0,.10), 0 1px 0 var(--glass-hi)` |
| 发光 | 无。删掉 `text-shadow: var(--lcd-glow)` 和深色表盘的绿色 `drop-shadow`（styles.css:759–765） |
| 残影 | 大号读数后面叠一层**本窗口里上一次显示的值**，向右下偏移 2px，颜色 `--eink-ghost`，`aria-hidden`；数值还没变过时不画；不做动画 |
| 文字 | 主读数 `--eink-ink`，标签和说明 `--eink-dim`；`--eink-mid` 只用于刻度等图形，不用于文字 |
| 像素字 | GST Pixel 只用在屏内；字号和按物理像素对齐的规则不变（60 / 57.6 / 64，成就页 48） |
| 屏上图标 | `filter: grayscale(.55) saturate(.7) contrast(1.05)`，不用混合模式；删除深色下的 `sepia + hue-rotate` 和 `screen`（styles.css:727–737） |

**表盘墨色规则**：两圈 48 段容量环的语义不变，外圈是今日记录、内圈是今日活跃，`litSegments = floor(seconds/1800)`（LcdDial.tsx:29–35），所以 App.test 断言的 17 个 `is-lit` 不受影响。在环外（外圈半径 78，SVG 184）加一圈 96 条刻线（每 15 分钟一条，整点 24 条更长），只表示「今日已过」，和现有指针是同一个信息；条数和长短按定稿样稿 overview-glass.html 的表盘。

| 元素 | 墨色 |
| --- | --- |
| 已走过的整点刻线 | 实墨 `--eink-ink` |
| 已走过的其他刻线 | 灰墨 `--eink-mid` |
| 未走过的刻线、容量环未点亮段 | 淡轨 `--eink-track` |
| 容量环的点亮段 | 外圈实墨 `--eink-ink`，内圈灰墨 `--eink-mid` |
| 指针、午夜标记 | `--eink-ink`；中心读数「今日已过 HH:MM」用 GST Pixel |

v0.5.0 回放表盘的刻度沿用这三条刻线规则。样稿的表盘只有 96 条刻线，没有容量环；本版按「已定」第 1 条保留容量环。

## 组件迁移表

| 组件 / 位置 | 现在 | v0.4.0 |
| --- | --- | --- |
| `body`（styles.css:121） | `--case` 纯色 | 光晕层 + `--base` |
| 侧栏 `.sidebar`（193） | 机壳色 | `--side` 玻璃，右侧 1px `--edge` |
| 导航 `.nav-key`（247–295） | 凸起按键，当前页按下 | 平的导航项；当前页 `--on` 底 + `--edge` + 左侧 3px `--accent` 内条；未开放项不变 |
| 面板 `.panel`、`.readout`（492–503、588） | 1px 高光 + 边线 + 近阴影 | 玻璃面板配方 |
| 页头按钮 `.header-button`（360） | 凸起按键 | `--glass-2` 子板，圆角 9px |
| 今日读数 TodayReadout（`.lcd`，592–737） | 点阵液晶 | 墨水屏配方 + 残影 + 图标半去色 |
| 表盘 LcdDial（746–797、1993） | 液晶分段 + 深色荧光 | 墨水屏表盘墨色规则 |
| 设置页 `.lcd.settings-lcd`（App.tsx:614–630；styles 1598–1611） | 液晶栏 | 墨水屏配方（无残影） |
| 成就热力图 ActivityHeatmap（`.lcd.ach-dial`，AchievementsPage.css:55–318） | `--lcd-ink` 9/44/70/100% 分级，深色 l3 发光 | 同样的分级改用 `--eink-ink`，删除 l3 发光；刻线 `--ach-rule` 改用 `--eink-ink` 22% |
| 走纸记录仪 TrendRecorder（StatisticsPage.css:242–383） | `.paper` = `--panel-raised`，金属滚轴，旋钮色笔臂 | `.paper` 改用墨水屏纸面、颗粒和内凹边；针柱和文字改用 `--eink-*`；滚轴改成平的 `--eink-mid` 细条；笔臂 `--eink-mid`；`.pen-lamp` 信号橙保留（正在记录） |
| 里程碑铭牌 MilestoneShelf（AchievementsPage.css:476–541） | 螺钉、凸起/凹槽 | `--glass-2` 子板，去掉螺钉；未点亮为虚线 `--edge` + `--muted`；6666 达成后用 `--accent` 描边 |
| 今日分布 `.mix-plate`（958–978） | 唯一允许 mix 色的带框色板 | `--glass-2` 子板；深色下色条加 `0 0 12px` 同色 40% 微光 |
| 开关 `.toggle` / `.toggle-knob`（1680–1717） | 金属旋钮 + 信号橙灯 | 白色圆钮 + 柔和投影；开启态轨道 `--accent` |
| 分段选择器 `.segmented`（1737–1746）与统计/成就的同类控件 | 凸起选中项 | 轨道 `--chip`，选中项 `--on` + `--edge` |
| 对话框 `.dialog`（1436） | 机壳面板 | `--glass-solid`，圆角 16px |
| 刻字效果（`text-shadow: 0 1px 0 var(--highlight)`：styles.css:524，AchievementsPage.css:48、555、601） | 刻字 | 删除；随刻字和液晶发光一起失效的 `text-shadow: none` 覆盖（styles.css:659，AchievementsPage.css:171、295、321）一起删 |
| 深色选择器覆盖（styles.css:614、640、734、759、763；ach 236、241） | 液晶专用 | 随液晶配方一起删除或改写 |

## 信号橙与强调色

信号橙只用于「此刻 / 正在记录」：侧栏「正在记录」灯（呼吸动画保留）、「前台运行」状态点（带 8px 微光）、「托盘运行」空心环（定稿样稿就是这样）、走纸记录仪今天那根针旁的灯，以及 v0.5.0 时间轴的「此刻」标记。

现在用信号橙、但不属于「此刻」的地方，改用 `--accent`：键盘焦点环 `--focus`（styles.css:53）、`::selection`（145）、搜索命中 `mark`（1335）、添加软件对话框的选中行（1543–1549）、开关开启态（1705）、后台表格的排序按钮（1957–1979）。错误、警告和移除类元素（`.warning` 438、`.dialog-error` 1473、`.stats-range-error` StatisticsPage.css:75、隐藏列表的 `.software-remove-button` 1232–1245）改用新的 `--alert-ink` / `--alert-wash`（见「已定」第 3 条）。

## mix 色

DESIGN.md 原来的「mix 色只出现在今日分布色板」（DESIGN.md:132、158、210，styles.css:945 注释）废除。改成：`--mix-1…7` 是软件身份色，全 app 都可以用来标识软件，深色下可以带轻微同色微光。同一个软件在同一页里颜色要一致。mix 色不能单独承载信息，旁边必须有软件名。这一版实际仍然只有 TodayMix 在用 mix 色（TodayMix.tsx:13，按列表顺序循环取色），分配规则不改；时间轴页的分配规则由 v0.5.0 规格定。

## 字体

| 用途 | 字体 |
| --- | --- |
| 正文、标签 | `--font-ui`（Segoe UI Variable Text 起头，不变） |
| 页面标题 22px | Segoe UI Variable Display，回退到 `--font-ui` |
| 时长、表格数字 | `--font-num`（Bahnschrift，等宽数字） |
| 屏内读数 | `--font-pixel`（GST Pixel），只在墨水屏内使用 |

字号、字重、字距都不变。像素字体的预加载（index.html:7–14，fontPreload.test.ts）不变。

## 动效

不新增 keyframes，也不新增过渡。现有的 `lamp-breathe`、`backdrop-in`、`dialog-in` 和 120–220ms 的过渡保留。残影不做动画。全局 `prefers-reduced-motion` 规则（styles.css:1856–1864）不变。

## 对比度目标

正文和小字要达到 WCAG AA 4.5:1；读数屏大字（像素字 ≥ 24px）至少 3:1；刻度、焦点环等图形至少 3:1。下面是按决策书或样稿值算出的结果。半透明底都按最坏情况计算：叠在对比最差的光晕中心上（两套主题都是左上的蓝光晕，侧栏正好在那里），不计 `saturate(1.4)`。

| 组合 | 浅色 | 深色（三个渐变色标里最差的） |
| --- | --- | --- |
| 屏内主字 `--eink-ink` | 18.8 | 13.0 |
| 屏内次字 `--eink-dim` | 9.3 | 7.9 |
| 屏内刻度 `--eink-mid`（只用于图形） | 4.1 | 3.7 |
| 玻璃上 `--ink` / `--ink-2` | 14.4 / 9.8 | 11.2 / 8.8 |
| 玻璃上 `--muted` | 5.2（样稿 `#626875` 为 4.56） | 4.7 |
| 侧栏 `--side` 上 `--muted`（「未开放」、侧栏页脚） | 4.9（样稿值 4.3，不达标） | 5.3 |
| 玻璃上的 `--chip` 里 `--muted` | 4.6 | 3.8，不达标 |
| 玻璃上 `--signal-ink` | 4.8 | 6.1 |
| `--accent`（只用于图形） | 3.3 | 5.1 |
| 玻璃上 `--alert-ink` | 5.4 | 5.5 |
| 玻璃上的 `--alert-wash` 里 `--alert-ink` | 4.6 | 约 4.8（`.08`；按样稿最初设想的 `.14` 只有 4.3，不达标） |

所以浅色 `--muted` 取 `#5a606c`，不能再调浅；`--chip` 底上的文字（分段选择器未选项等）用 `--ink-2`，不用 `--muted`。`--accent` 在浅色下不能用作文字。深色 `--alert-wash` 的不透明度因此取 `.08`，不能再调高。

## 性能验收

| 场景 | 标准 |
| --- | --- |
| 预览模式（Edge，1440×900），Performance 面板录 5 秒，滚动软件页「已发现软件」列表和统计页台账 | 没有超过 50ms 的帧；平均 ≥ 55 fps；打开 4× CPU 降速后平均 ≥ 30 fps |
| 安装版，在本机反复拖动窗口、在 1180×760 和最大化之间调整大小，各 10 次 | 没有可见的卡顿或撕裂，录屏留证 |
| 安装版，概览页静止 1 分钟 | WebView2 进程平均 CPU 不比 v0.3.0 同场景高出 1 个百分点以上 |
| `data-glass="off"` | 上面三项都要达到；任何一项不达标时，先去掉 `backdrop-filter` 再测 |

## 验收标准

1. `rg -- "--lcd-|--knob-|--case\b|--radius-case|--panel-raised|--panel-sunken|var\(--panel[,)]|--highlight\b" src` 没有结果；`rg "backdrop-filter" src` 的每一处都在「玻璃面板配方与上限」允许的元素上，没有嵌套。
2. `rg "var\(--signal" src` 剩下的使用都属于「信号橙与强调色」列出的此刻类元素。
3. `npm.cmd run check` 通过；现有测试只因 token 改名而改动，类名断言（`.lcd-ring-recorded path.is-lit` 为 17 个等）不改。
4. 预览模式截图：6 页 × 浅色/深色，加上 `?empty`、`?format=hm`，1440×900 和 1180×760 各一组；控制台无错误，窄窗口没有横向滚动条。截图对照定稿样稿逐页看。
5. 对比度表里每一项都用实现后的计算值复核，达到目标。
6. 关闭 Windows「设置 → 个性化 → 颜色 → 透明效果」后，重新打开窗口，所有面板不透明，文字对比度不下降；再打开透明效果，玻璃恢复。
7. 打开 Windows 对比度主题（forced-colors）后，所有文字和焦点环都看得见。
8. 在 Windows 10 上（实机或虚拟机）安装后，玻璃和墨水屏的显示与 Win11 一致。
9. 像素读数在 100% / 125% / 150% 缩放下边缘清晰，不发虚。
10. 侧栏「时间轴」仍显示「未开放」；`src-tauri` 除版本号外只改透明效果的只读命令及其测试，schema（仍为 v0.3.1 的 3）和其他命令不变。
11. 性能验收表全部达到。

## 文档与发布要更新的地方

- `DESIGN.md` 重写，顺序不变：
  1. frontmatter：删掉 knob、lcd、case 类颜色，加 glass、eink、accent，改圆角；
  2. Overview：新北极星和 Key Characteristics；
  3. Colors：分玻璃外壳、墨色、墨水屏、信号橙、强调色、身份色几段；
  4. Typography；
  5. Layout：不变；
  6. Elevation：玻璃只有一层，墨水屏内凹；
  7. Shapes；
  8. Components：逐个对应组件迁移表；
  9. Do's and Don'ts。

  Don't 要写明：霓虹描边文字、渐变文字、毛玻璃层层叠加或嵌套模糊、屏外用像素字和颗粒纹理、信号橙做装饰、统计卡片网格。原来的「Don't 玻璃拟态」（DESIGN.md:213）和「液晶表盘」描述（DESIGN.md:194）删掉。
- 代码注释：`src/styles.css:1–6` 的文件头，`index.html:7` 的预加载注释（「LCD pixel font」）和 `index.html:16–27` 的 THESIS / OWN-WORLD 注释。
- `README.md`：L61、L90–91、L137、L321、L450 的「液晶」字样改成墨水屏；`docs/assets/` 下 12 张截图全部重拍。方法：`node scripts/ui-preview/collect-demo-icons.mjs` 取本地图标，输出目录 `scripts/ui-preview/demo-icons/` 已被 gitignore，图标不入库；然后 `npm.cmd run preview:ui`，用 `?page=…&theme=…` 在 1440×900 下截图；数据只来自 `mock-data.ts`。图注「截图均为示例数据」（L53）保留。README 开发小节（L398）已写了 `?theme`、`?format=hm`、`?empty`，补上 `?page=` 和取图标这一步。
- `PRODUCT.md:37`：「dot matrices in the LCD」改成墨水屏。
- `memory.md`：Product Decisions 的 UI 方向（v0.3.0 时在 L13）整段改写，信号橙规则改，mix 色限制删；Latest published release、Current Repository State、Release State 各加 v0.4.0 一行。行号以 v0.3.1 改完后为准。
- `AGENTS.md`：在 v0.3.1 小节后加 `v0.4.0 additionally includes`，写明玻璃 + 墨水屏取代「The v0.2 desktop UI」里的 desk-instrument 和 LCD 描述，不改数据和口径，`时间轴` 仍未开放，并链接本规格。
- `docs/CURRENT_STATE.md`：L3 加版本句；「发布与验证」节加本版的截图和性能验收证据。口径表不变。
- `PRIVACY.md`：改版本号；在 Permissions 段加一句：会读取 Windows 的透明效果设置，只用于显示，不保存。
- `2026-11-21-statistics-and-achievements-design.md`：L32「点阵 LCD 样式」和 L41「液晶屏」后面注明「v0.4.0 起为墨水屏」；L42 分段选择器「当前项凸起」改为 `--on` 选中项；L43 6666 小时铭牌达成后改为 `--accent` 描边（「已定」第 2 条）。
- `CHANGELOG.md` 的 `## Unreleased` 用英文条目；新建 `docs/releases/v0.4.0.md`，升级说明写「数据库结构不变（仍为 schema 3）」；发布提交按 17686c8 的 9 个文件改版本号（包括 `src-tauri/.backlog-qa/tauri.conf.json`、`docs/ui-redesign-backlog.md:9`）。

## 已知限制

- `backdrop-filter` 只能模糊页面自己画的光晕，透不出桌面和其他窗口，这不是真正的系统 Mica。
- WebView2 是否支持 `prefers-reduced-transparency` 未验证；注册表要在启动时和窗口重新可见时重读，系统里切换透明效果后，要到下次重新可见才生效。
- 不检测电池或节电模式；Windows 节电模式会不会把 `EnableTransparency` 置 0，需要实测。
- 残影只记得本窗口打开以来的上一次值，重新打开窗口后，第一次刷新前没有残影。
- 类名和组件名仍带 `lcd`（`.lcd`、`LcdDial`），和设计用语不一致，留到以后有改动需要时再顺手改名。
- 颜色对比度是按样稿值和最坏光晕位置估算的，实现后要按实际渲染复核。

## 已定（2026-11-22，用户确认全部按推荐）

1. **表盘**：保留两圈容量环（今日记录、今日活跃），环外加 96 条刻线，按「表盘墨色规则」上墨；不改成样稿的纯时钟。
2. **6666 小时铭牌**：达成后用 `--accent` 描边，不再用信号橙；统计/成就规格 L43 和 memory.md 的旧规则随本版改写。
3. **错误、警告和移除按钮**：新增 `--alert-ink`、`--alert-wash`，不再借用信号橙。初始值：浅色 `#b42318` / `rgba(180,35,24,.10)`，深色 `#ff8a80` / `rgba(255,138,128,.08)`；文字在玻璃面板和 `--alert-wash` 上都要达到 4.5:1，实现后按对比度表复核。适用于 `.warning`、`.dialog-error`、`.stats-range-error`、`.software-remove-button`。
4. **键盘焦点环、开关开启态、选中类元素**：统一用 `--accent`（见「信号橙与强调色」）。
5. **mix 色**：改用样稿值（见新 token 取值表）。
6. **透明效果只读命令**：加。这是 v0.4.0 唯一的后端改动，只读注册表、不落库。

## 待确认

1. **Windows 10 验收**：有没有 Win10 实机或虚拟机？没有的话，验收标准第 8 条只能用 Win11 加 `@supports` 强制回退来近似。
