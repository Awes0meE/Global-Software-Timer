# 云母玻璃 + 墨水屏全局视觉改版实现计划（v0.4.0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 待执行。

**目标：** 把全 app 从「铝 / 石墨机壳 + 点阵液晶」换成「云母玻璃外壳 + 墨水屏读数」：浅色、深色两套 token 重写，`body` 画一次背景光晕，侧栏和页面顶层面板用半透明玻璃（同屏最多 6 个模糊层、不嵌套），读数屏换成哑光墨水屏（像素字体保留，加颗粒、残影和 96 条刻线）。加一个只读命令读取 Windows「透明效果」开关，关掉时退回不透明面板。不加功能，不改数据、schema、口径、文案、布局和字号。

**规格（唯一依据，产品决定已定）：** [`docs/superpowers/specs/2026-11-22-glass-eink-redesign-design.md`](../specs/2026-11-22-glass-eink-redesign-design.md)。本计划里的「验收 N」指该规格「验收标准」的第 N 条（1–11）；「迁移表」指「组件迁移表」。下一版规格 `2026-11-22-timeline-page-design.md`（v0.5.0）只作背景：时间轴页沿用本版的 token 和表盘刻线规则，本计划不实现它。

**分支：** `feat/glass-eink-redesign`，独立 worktree `.worktrees/glass-eink`，从 `main` 上的 v0.3.1 发布提交（标题 `chore(release): publish 0.3.1`）建。

- 本计划文件是该分支的第一个提交：`docs(plan): plan the v0.4.0 glass and e-ink redesign`。
- 不在 `main` 上实现。全部任务完成后按用户要求合入本地 `main`（快进）；推送、发布、安装都要用户在会话里另行明确同意。

**架构：**

- **CSS token 是唯一的开关。** 新 token 先和旧 token 并存（任务 2），逐页迁移（任务 4–14），最后一次删掉旧 token（任务 15），所以每个提交之后 app 都能正常使用。
- **回退走三个「切换 token」**：面板和侧栏只写 `background: var(--glass-surface)` / `var(--side-surface)`、`backdrop-filter: var(--glass-filter)`；`:root[data-glass="off"]`、`@media (prefers-reduced-transparency: reduce)`、`@supports not (backdrop-filter: blur(1px))` 三处只改这三个 token，不复制面板规则。
- **墨水屏是一份共用配方**：先用在 `.lcd`（概览、设置、成就），任务 14 把 `.paper`（走纸记录仪）加进同一个选择器。类名 `.lcd*`、组件名 `LcdDial` 不改（规格「墨水屏配方」）。
- **后端只加一个只读命令** `get_transparency_effects_enabled`（新模块 `src-tauri/src/appearance.rs`），读 `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize\EnableTransparency`，不落库；前端 `src/glass.ts` 在启动和窗口重新可见时调用它，设或去掉 `<html data-glass="off">`。
- **检查自动化**：对比度、旧 token 清除、信号橙用途、模糊层数、像素字范围、keyframes 不新增，都写成 vitest；视觉和帧率用浏览器预览 + Edge（仓库内新增一个 CDP 小脚本 `scripts/ui-preview/probe.mjs`）。

**技术栈：** React 18 / TypeScript / Vite 8 / Vitest 4（jsdom）、纯 CSS（无预处理器）、Tauri v2 / Rust（windows-sys 0.59，`Win32_System_Registry` 已启用）、Microsoft Edge（headless 与 CDP）、Node 24（自带 `WebSocket`）。

**检查命令（PowerShell，在 worktree 根目录）：**

```powershell
. .\scripts\dev-env.ps1
npx.cmd vitest run src/__tests__/<本任务的测试文件>   # TDD 时的定向测试
npm.cmd run check                                    # 发布脚本回归、vitest、vite build、cargo fmt --check、cargo test、npm audit
```

每个任务提交前都跑完整的 `npm.cmd run check`。

---

## 依据

- 规格：`docs/superpowers/specs/2026-11-22-glass-eink-redesign-design.md`（token 表、光晕、玻璃配方与上限、回退、墨水屏配方、表盘墨色规则、迁移表、信号橙与强调色、mix 色、字体、动效、对比度、性能、验收 1–11、文档与发布）。规格里的 `styles.css` 行号与 v0.3.1 一致（已核对：14–107、121、145、193、247–295、360、438、492–503、572–797、1431–1432、1680–1717、1737–1746、1780–1785、1856–1864、1957–1979、1993 都对得上），本计划沿用这些行号，执行时以选择器为准。README 等文档的行号在 v0.3.1 发布提交后会偏 1 行（例如「液晶」字样现在在 README L61、L91、L137、L322、L451），一律按内容定位。
- 样稿（仓库外，只取数值，不复制文件、图标和截图进仓库）：`F:\XJTLU\科研_DIY\Global_Software_Timer\local-mockups-2026-11-22-timeline\overview-glass.html?theme=light|dark&screen=eink`（定稿配色、墨水屏、表盘刻线：96 条，半径 62→76 / 整点 62→80，线宽 2 / 3.4，在 172px 的盘里）、`style-sketch.html?style=glass`（玻璃参照）、`eink-dark-picker.html`。
- 现有代码：
  - `src/styles.css`（2032 行，token 在 14–107）、`src/components/StatisticsPage.css`（走纸记录仪 231–384）、`src/components/AchievementsPage.css`（日历刻度盘 55–332、铭牌 476–612）。
  - `src/theme.ts`（`paint` 写 `data-theme`，`applyThemePreference` 调原生 `setTheme`）、`src/main.tsx`（`paintInitialTheme()`）、`src/App.tsx`（`useEffect(() => applyThemePreference(theme), [theme])` 在 212 行；侧栏 396–453；设置页 `.lcd.settings-lcd` 在 613–630）、`src/visiblePolling.ts`（`visibilitychange` 写法）。
  - `src/components/TodayReadout.tsx`、`LcdDial.tsx`（`SIZE = 184`，外圈 78/66、内圈 61/53，指针三角在半径 81–90，午夜标记 `y=45..53`）、`TodayMix.tsx`（`mixColor(index)` 内联 `backgroundColor`）、`MilestoneShelf.tsx`（四颗 `.ach-screw` 在 147–154）、`ActivityHeatmap.tsx`、`TrendRecorder.tsx`。
  - `index.html`（7 行预加载注释、16–27 行 THESIS / OWN-WORLD 注释）、`vite.config.ts`（`test` 块）、`scripts/ui-preview/`（`tauri-core.ts` 对未知命令抛错；`?theme`、`?format=hm`、`?empty`、`?page=`、`?dialog=add`）。
  - `src-tauri/src/lib.rs`（`invoke_handler` 在 90–109 行）、`commands.rs`（`#[tauri::command(async)]` 写法，如 `get_app_settings`）、`tray_icons.rs` 的 `mod registry`（同类 HKCU 只读写法：`RegOpenKeyExW` / `RegGetValueW` / `wide()`）。`build.rs` 是默认的 `tauri_build::build()`，应用自定义命令不需要在 `capabilities/default.json` 登记。
- 测试现状：`App.test.tsx:322–342`（`.lcd-ring-recorded path.is-lit` 17 个）、`AchievementsPage.test.tsx:234`（`.lcd.ach-dial`）、`fontPreload.test.ts`（用 `index.html?raw` 解析预加载）。各页面测试用 `vi.mock("@tauri-apps/api/core", () => ({ invoke }))`，`StatisticsPage.test.tsx:201` 用 `vi.stubGlobal("ResizeObserver", …)`。
- 已验证的工具事实（写计划时实测）：
  - Vitest 默认把 `.css` 请求（包括 `?raw`）转成空字符串；在 `vite.config.ts` 的 `test` 里加 `css: { include: [/\.css\?raw$/] }` 后，`import css from "../styles.css?raw"` 能拿到原文，普通 `.css` 导入不受影响。
  - 用规格的 token 值复算对比度，规格表里的数值全部复现（例如浅色玻璃上 `--muted` 5.16、深色 `--chip` 里 `--muted` 3.81）；另发现两处规格表没覆盖的组合，见「实现时的取舍」第 1 条。

---

## 开工前必读的约束

1. **开发版和本地安装包会改生产库。** `npm.cmd run tauri dev` 和本地构建的安装版与正式版共用 `%APPDATA%\com.globalsoftwaretimer.app\global-software-timer.sqlite3`。本计划**不运行开发版，也不运行本地构建的安装包**。所有视觉检查用浏览器预览 `npm.cmd run preview:ui`（示例数据在 `scripts/ui-preview/`；本 worktree 用端口 1431，见「视觉检查方法」），加 headless Edge 截图和 vitest 组件测试。真机外观只在发布之后、经用户同意再看（见「本机验收」）。`npm.cmd run release:build` 只构建、不运行，可以跑。
2. **样稿在仓库外，含第三方图标。** 不复制样稿文件、图标或样稿截图进仓库，只取数值（颜色、半径、尺寸、噪点参数）。样稿截图只放 scratchpad。
3. **仓库是公开的。** 不提交任何真实使用数据。入库的截图只来自 `mock-data.ts` 的示例数据；`docs/CURRENT_STATE.md` 只写通过与否、帧率、耗时这类数字。
4. **无遥测、无联网、无管理员权限。** 新命令只读 HKCU 的一个 DWORD，不写注册表、不落库。`probe.mjs` 只连本机预览和本机 Edge 调试端口。
5. **提交。** Conventional Commits，一个任务一个提交，作者只用用户本人，不加 `Co-Authored-By` 或任何 Claude 署名。没有提交许可时保留改动并报告建议的提交信息。
6. **测试里不要写出被禁止的字面量。** 验收 1、2 用 `rg` 扫整个 `src`（含 `src/__tests__`），所以新测试里的旧 token 名、`var(--signal`、`backdrop-filter` 都用字符串拼出来（例如 `"--" + "lcd-"`），CSS 注释里也不要写 `backdrop-filter`。

---

## 口径（实现时以此为准）

| 项目 | 规则 | 规格位置 |
| --- | --- | --- |
| 模糊层 | 只有 `.sidebar` 和页面顶层面板 `.panel`、`.readout`、`.software-panel` 用 `backdrop-filter: var(--glass-filter)`（`blur(30px) saturate(1.4)`）；`.modal-backdrop` 保留 `blur(2px)`。每页 DOM 里匹配这些选择器的元素 ≤ 6 个，且互不嵌套。统计页正好 6 个（侧栏 + 5 块面板） | 玻璃面板配方与上限 |
| 子板 | 面板里的按钮、分段选择器、表格行、提示卡、铭牌、色板只用半透明填充（`--glass-2` / `--chip` / `--on`），不模糊 | 同上 |
| 浮层 | 对话框、帮助气泡、趋势悬停卡、跳转链接、提示气泡用不透明 `--glass-solid`（提示气泡沿用 `--ink` 底） | 同上；本计划取舍 9 |
| 文字颜色按底色 | 玻璃面板、侧栏、`--glass-solid`：`--ink` / `--ink-2` / `--muted`。`--chip` 上：`--ink` / `--ink-2`，不用 `--muted`。`--glass-2` 上：同玻璃，但深色主题在 `.mix-plate`、`.ach-plate.is-reached` 内 `--muted` 改指 `--ink-2`（取舍 1）。`--alert-wash` 上：`--alert-ink`。墨水屏：主读数 `--eink-ink`，标签说明 `--eink-dim`，`--eink-mid` 只画图形 | 对比度目标、墨水屏配方 |
| 直接画在光晕背景上的文字 | 不在任何面板里、直接落在 `B = over(蓝光晕中心, --base)` 上的元素：统计页 `.stats-range` 工具条（`.stats-range-caption`、`.stats-custom-range` 的「至」、`.stats-hidden-toggle` 标签、`.stats-range-error`、分段选择器）、各页 `main` 下的 `.warning`（概览、软件、后台、统计、成就、设置）、面板外的 `.empty-state`（概览「正在读取概览…」、统计、成就、后台的读取中提示）、App.tsx 的 Suspense 读取提示、页头标题和页头按钮。`B` 上 `--muted` 只有 4.15 / 4.14，不用；这些位置的说明文字用 `--ink-2`（7.86 / 7.71）。`.warning`、`.stats-range-error` 用不透明底：`background: linear-gradient(var(--alert-wash), var(--alert-wash)), var(--glass-solid)`（`--alert-ink` 在其上 5.21 / 6.37；直接叠在 `B` 上只有 3.72 / 4.26）。页头按钮 `--ink-2` 在 `--glass-2` 叠 `B` 上（9.96 / 6.45，contrast.test「--ink-2 on glass-2 over B」），未开放的日期、导出、更多相同（决策 1B） | 对比度目标；取舍 23 |
| `--chip`、`--on` 底（含 hover / active / 选中） | 凡是 `background` 或 `background-color` 用到 `var(--chip)` 或 `var(--on)` 的规则，同一规则里加 `--muted: var(--ink-2);`，让其后代的 `--muted` 文字自动变成 `--ink-2`（深色 `--muted` 在 chip 上 3.81、在 `--on` 上 3.47）。涉及的状态：导航项 hover（`--chip`）与当前项（`--on`）、页头按钮和次按钮 hover（`--on`）/ active（`--chip`）、概览与后台的行 hover（`.usage-row`、`.background-row`，行内 `.software-cell small` 原为 `--muted`）、添加软件行 hover、`.add-software-close:hover`、分段选择器轨道与选中项、搜索框、`.stats-date`、`.stats-note`、`.settings-row-icon`、`.default-mark`、编辑态 `.text-action`。无文字的 `.toggle`、`.mix-bar`、`.idle-bar`、`.rhythm-track` 是白名单，不写（`.toggle` 的关闭态轮廓要用原来的 `--muted`，取舍 9）。由 contrast.test 的结构测试守住（任务 2） | 对比度目标（「`--chip` 底上的文字用 `--ink-2`」）；取舍 26 |
| 投影颜色 `--shade` / `--shade-deep` | 只留在白名单选择器：`.skip-link`、`.toggle-knob`（规格点名），以及浮层 `.unavailable-tooltip-bubble`、`.active-help-popover`、`.trend-tip`（取舍 24）。按钮、面板、凹槽、熄灭的灯（`.lamp` 456 行的内阴影）都去掉。任务 15 的测试守住 | Token 架构（`--shade` 一行） |
| 信号橙 | 只用于此刻：`.lamp.is-lit`、`.status-badge.running .lamp`（8px 微光）、`lamp-breathe`、`.status-badge.tray .lamp`（空心环）、`.pen-lamp`。其余全部改走 `--accent` 或 `--alert-*` | 信号橙与强调色 |
| 强调色 | `--focus`、`::selection`、搜索命中 `mark`、添加软件选中行、开关开启态、后台排序按钮、当前导航内条、分段选中、6666 铭牌描边。浅色 `--accent` 只作图形（3.3:1），不作文字 | 同上 |
| 警示色 | `.warning`、`.dialog-error`、`.stats-range-error`、`.software-remove-button` 用 `--alert-ink` / `--alert-wash` | 已定 3 |
| mix 色 | `--mix-1…7` 是软件身份色；本版仍只有 TodayMix 用，分配规则（按列表顺序循环）不改；深色色条加 `0 0 12px` 同色 40% 微光 | mix 色 |
| 像素字 | `--font-pixel` 只出现在以 `.lcd` 开头的选择器里；主读数 60 / 57.6 / 64px（1 / 1.25 / 1.5 dppx），成就页 48px；token 名 `--pixel-display-size` | 字体、墨水屏配方 |
| 残影 | 只在概览「今日记录」「今日活跃」两个大号读数后面；内容是本窗口里上一次**显示的**读数，结构与主读数相同（同样的 `<b>` 数字 + `<small>` 单位、同样的 flex / baseline / gap / 换行），整体向右下偏 2px，`--eink-ghost`，`aria-hidden`，文字放在 `data-text` 属性里用 `::before` 画出（DOM 里没有文本节点）；没变过不画；不做动画 | 墨水屏配方 |
| 刻线 | 96 条，每 15 分钟一条，整点 24 条更长；`minutesToday = getHours() × 60 + getMinutes()`（整数，秒数舍去，沿用 `LcdDial.tsx:58` 现有写法）；第 i 条在 `i × 15 < minutesToday` 时算走过（00:00:30 → 0 条，12:00 → 48 条，23:59 → 96 条） | 表盘墨色规则 |
| 对比度阈值 | 文字 4.5:1；读数屏 ≥ 24px 像素字 3:1；图形（刻度、焦点环、强调色）3:1。半透明底按「蓝光晕中心 ∘ `--base`」最坏情况合成，不计 `saturate`；三种底都要算：直接的背景 `B`、玻璃 `G = over(--glass, B)`、侧栏 `S = over(--side, B)`，外加 `--glass-solid` | 对比度目标 |
| 布局 | 不改布局、字号、页面结构。`.sidebar`、`.panel`、`.readout`、`.software-panel` 自身的外框位置和尺寸与 v0.3.1 **完全一致**；面板边线是内收的 `outline`（决策 2A，取舍 11），不占盒子，面板里的内容位置也不变（实测 0px），验收容差 ≤ 1px。（历史：原先按规格配方用 1px `border`，以为外框不变、内容各边内缩 1px；实测外框也会动，已被 2A 取代，见取舍 25） | 目标与范围 |
| 动效 | `@keyframes` 只有 `lamp-breathe`、`backdrop-in`、`dialog-in`；不新增过渡；残影不动画 | 动效 |

### 实现时的取舍（规格没写明或与代码有出入的地方）

其中 1、2、7、21 与规格原文直接冲突，4、5、6、14、23、24、25 影响外观但规格没写；按 `AGENTS.md`「规格与实现有影响行为的冲突时停下来问」，这 11 条在任务 0 一次性交给用户逐条拍板，拍板前不开始任务 2。用户否决哪一条，就按规格原文做，并改掉本计划里对应的步骤。

**用户已确认（2026-11-23）：11 条全部按本计划的推荐做法执行，没有否决。** 下面各条末尾逐条记录。

1. **深色 `--glass-2` 子板上的 `--muted` 只有 3.93:1。** 规格对比度表只算了玻璃（4.73）和 `--chip`（3.81，规格已规定改用 `--ink-2`），没算 `--glass-2`。深色下 `--glass-2` 上有小字的地方只有今日分布色板（`.mix-row strong` 百分比、空状态）和已点亮铭牌（`.ach-plate-tier small`、`.ach-plate-state`、`.ach-plate-date`、`.ach-plate-more`、`.ach-progress`、`.ach-plate-rule.is-titled`）。做法：一条规则 `:root[data-theme="dark"] :is(.mix-plate, .ach-plate.is-reached) { --muted: var(--ink-2); }`，浅色（5.77）不动；对比度测试把这一组合列进去。备选：把深色 `--muted` 全局提到 `#a8afbb`（玻璃 5.65、`--glass-2` 4.70、`--chip` 4.55），改动规格定的样稿值，需用户拍板。**用户已确认（2026-11-23）：局部改指**（深色 `.mix-plate`、`.ach-plate.is-reached` 内 `--muted` 改指 `--ink-2`），深色 `--muted` 全局值不变。
2. **刻线放在哪里。** 规格要求刻线在外圈（半径 78）之外、SVG 仍是 184（中心 92），只剩 14px；样稿刻线长 14 / 18px，放不下。做法：起点半径 81，普通刻线到 89、整点到 91（长度比 0.8，接近样稿的 14:18），线宽沿用样稿 2 / 3.4，`stroke-linecap: butt`。半径 81 处 96 条刻线间距约 5.3px，不糊。**与规格「条数和长短按定稿样稿」冲突**，任务 0 请用户拍板；备选是按样稿 14 / 18px 画，但那要把 `SIZE` 加大或把两圈容量环内缩（改几何，`App.test` 的类名断言不受影响，但读数屏里表盘变大或变挤）。**用户已确认（2026-11-23）：同意偏离样稿，刻线从半径 81 起，长 8 / 10px，几何不变。**
3. **指针和刻线重叠。** 现有三角指针在半径 81–90，正好落在刻线带上；改指针位置会改 `LcdDial` 的几何。做法：指针几何不变，画在刻线之后，加 `stroke: var(--eink-paper-solid); stroke-width: 1.5; paint-order: stroke`，用纸色描边把它和左右刻线隔开（这就是 `--eink-paper-solid`「SVG 填充用」的用途）。任务 11 的视觉检查专门看这一处；不好看再找用户商量。
4. **`--edge-strong` 的新值规格没给。** 规格只说「名字保留，值改成半透明」。它用于滚动条、刻度、虚线、`.software-mark` 描边、对话框描边等需要比 `--edge` 更清楚的线。取：浅色 `rgba(20, 30, 60, 0.18)`，深色 `rgba(255, 255, 255, 0.18)`。**用户已确认（2026-11-23）。**
5. **表格分隔线换成 `--rule`。** 浅色新 `--edge` 是白色高光（`rgba(255,255,255,.75)`），在白玻璃上看不见，所以所有「行与行之间」的 `border-*: 1px solid var(--edge)` 改用 `--rule`；面板、按钮、导航当前项、侧栏右边线这类「物体轮廓」才用 `--edge`。清单见任务 5、6、7、8、9。**用户已确认（2026-11-23）。**
6. **吸顶表头必须不透明。** `.focused-table-head`（特别关注表）和 `.background-table th`（后台表）是 `position: sticky`，下面的行会从半透明表头里透上来。做法：这两处用 `--glass-solid`；不吸顶的 `.usage-head`、`.stats-head` 按样稿去掉底色，只留 `--rule` 分隔线和 `--muted` 文字。玻璃开启时吸顶表头会比面板略实一点，任务 6 视觉检查确认。**用户已确认（2026-11-23）。** **用户已确认（2026-11-23，看过对比图）：决策 E-B**——深色下 `--glass-solid`（rgb(30, 30, 34)）比玻璃面板整体偏暗，表头改用略亮的中性不透明色，取面板平均色 rgb(33, 32, 39)。深色值只能写在 token 块里，所以新增 token `--head-solid`：浅色 `var(--glass-solid)`（浅色外观不变），深色 `#212027`；`.focused-table-head` 和 `.background-table th` 的 `background` 改用 `var(--head-solid)`，补画面板边线的 `box-shadow`（取舍 11）不动。`--muted` 表头字在深色 `--head-solid` 上 6.13（`--glass-solid` 上 6.30），`--ink`（排序中的列）14.53，contrast.test「--muted on head-solid」「--ink on head-solid」守住。玻璃开启时，表头紧邻的面板主体（后台表、特别关注表左段）约 rgb(30, 30, 35)，表头比它亮 1.00–1.03:1，这就是用户在 E-B 对比图里看过并选定的样子。不透明回退（`&glass=off`、减少透明度、不支持 `backdrop-filter`）下面板就是 `--glass-solid`，深色表头同样比面板亮 1.03:1；回退下这一差异没有单独给用户看过，任务 16 验收回退截图时一并请用户确认。备选 E-A（往 `--accent` 偏 8%）未采用。
7. **未点亮铭牌和对话框的描边。** 规格写「未点亮为虚线 `--edge`」，但浅色 `--edge` 在玻璃上看不见（同第 5 条）。做法：未点亮铭牌用 `1px dashed var(--edge-strong)`，对话框描边也用 `--edge-strong`。**与规格「虚线 `--edge`」冲突**，任务 0 请用户拍板；用户坚持 `--edge` 时，浅色未点亮铭牌的虚线基本看不见，要在报告里说明。**用户已确认（2026-11-23）：同意偏离规格，未点亮铭牌虚线和对话框描边都用 `--edge-strong`。**
8. **`::selection` 和搜索命中不能直接用实色 `--accent`。** 深色下 `--ink` 压在 `#5aa9ff` 上只有约 2.2:1，浅色 `--accent` 又不能作文字。做法：`::selection { background: color-mix(in srgb, var(--accent) 30%, transparent); color: inherit; }`；`mark { background: color-mix(in srgb, var(--accent) 16%, transparent); color: inherit; box-shadow: 0 1px 0 var(--accent); }`。对比度测试覆盖（实算 6.6–12.1）。
9. **规格没写的浮层与控件：** 趋势悬停卡 `.trend-tip`、帮助气泡 `.active-help-popover`、跳转链接 `.skip-link` 改用 `--glass-solid`（不是顶层面板，不能模糊）；提示气泡 `.unavailable-tooltip-bubble` 保持 `--ink` 底，字色 `--glass-solid`；主按钮 `.button-primary`、`.panel-add-button` 保持「深色按键」（`--ink` 底、`--glass-solid` 字），只去掉高光内阴影；开关关闭态轨道 `--chip` 加 `inset 0 0 0 1px var(--muted)`，保证关闭的开关在玻璃上有 3:1 的轮廓；开关里的小灯窗 `.toggle::before` 删除（它是信号橙灯，开启态改由 `--accent` 轨道表达）。（2026-11-23：开关的扁平做法将被立体滑块取代，方案待用户选定，见任务 7 末尾「开关将重做」。）
10. **扁平控件不再「按下」。** 导航项、页头按钮、次按钮去掉 `transform: translateY(1px)` 和内阴影按下态，`:active` 只换底色（`--chip`）；现有过渡时长不变，不新增动画。
11. **描边画法。** 面板原按规格配方用 `border: 1px solid var(--edge)`（已被决策 2A 取代，见下）；按钮、分段选中项、导航当前项这类固定高度的控件用 `inset 0 0 0 1px` 阴影画同色描边，不改盒子尺寸。**用户已确认（2026-11-23，看过对比图）：面板改用决策 2A**——`border: 0; outline: 1px solid var(--edge); outline-offset: -1px;`，外框和内容位置都与 v0.3.1 一致（实测 0px 位移）；`outline` 盖住了面板最上面一行的 `inset 0 1px 0 var(--glass-hi)` 高光，所以高光改成 `inset 0 2px 0 var(--glass-hi)`，顶边仍是「边线 + 一行高光」（边线那一行叠在高光上，深色下顶边比两侧边线略亮，1x 下几乎看不出，接受）；forced-colors 下面板用 `outline: 1px solid CanvasText`，不加 `border`。内收 `outline` 画在面板的定位子元素之下：吸顶、不透明的 `.focused-table-head` 和 `.background-table th` 会盖住面板左右边线，所以它们用内阴影补画同色边线（`.focused-table-head { box-shadow: inset 1px 0 0 var(--edge), inset -1px 0 0 var(--edge); }`，`th:first-child` / `th:last-child` 各补一侧），不改盒子。**面板内控件用决策 3C**：`.panel`、`.software-panel`、`.readout` 里的 `.panel-link`（更多、查看名单）、`.text-action`（编辑）和普通 `.button`（不含 `.button-primary`、`.panel-add-button`）用 `--glass-2` 底 + `inset 0 0 0 1px var(--edge-strong)`，两个主题相同，焦点环叠在这条线外面。**用户已确认（2026-11-23，看过对比图）：对话框用决策 D-A**——对话框是不透明的 `--glass-solid`，`--edge` 线在上面太淡（浅色 取消 / 退出软件 边线对对话框底只有 1.06:1，搜索框 1.03:1），所以对话框的次要按钮（添加软件对话框的「取消」、关闭对话框的「退出软件」：`:is(.dialog, .add-software-dialog) .button:not(.button-primary)`）和添加软件对话框的搜索框 `.add-software-search` 也用 3C 的线 `inset 0 0 0 1px var(--edge-strong)`（线叠在填充上、对对话框底 `--glass-solid`：浅色 1.39 / 1.61:1，深色 2.12 / 2.18:1）；填充不变（按钮 `--glass-2`，搜索框 `--chip`）；键盘焦点时线和 `--focus` 叠在一起。这几个选择器直接并进 3C 的两条规则（静止、`:focus-visible`），搜索框的线只在那里声明一次，共用的搜索框规则里只有 `.discovered-search` 带 `--edge` 线，不依赖规则先后。软件页面板里的 `.discovered-search` 不变（仍是 `--edge` 线）。
12. **侧栏层级。** 侧栏有了 `backdrop-filter` 就成为层叠上下文，「时间轴 未开放」提示气泡（向右伸进正文区）会被后面的玻璃面板盖住。做法：`.sidebar { position: relative; z-index: 4; }`（页头是 3）。任务 4 用 probe 聚焦该按钮截图确认。
13. **mix 色微光会被裁掉。** `.mix-bar` 现在 `overflow: hidden`，色段的外发光看不见。做法：去掉 `overflow: hidden`，首尾色段各自带圆角；色段颜色另写进 CSS 变量 `--mix-color`（TodayMix 内联 style 多一个属性），微光强度用主题 token `--mix-glow`（浅色 `0%`、深色 `40%`），这样不需要深色选择器。
14. **残影的范围、比较对象和画法。** 迁移表只给 TodayReadout 写了「残影」，设置页明确「无残影」；成就页的大号读数在切换范围时换的是另一个量，画上一次的值会误导，所以不加。比较的是格式化后显示的文字（`8.8` 变 `8.9` 才算变），切换时长格式时清空残影，避免新旧格式叠在一起。残影复用主读数的结构（`formatDurationPartsZh` 拆出的 `<b>` / `<small>`，同一套 `.lcd-value` 样式），所以单位字号、基线、间距、`format=hm` 的两组数字和换行都和上一次的读数一模一样，只是整体偏 2px；文字写在 `data-text` 里由 `::before` 画出，不产生文本节点，不和 `getByText` 撞车。**用户已确认（2026-11-23）：残影只加在概览的两个读数上。**
15. **走纸记录仪只改颜色和纸面。** 迁移表只说「针柱和文字改用 `--eink-*`」，字体不改（仍是 `--font-num` / `--font-ui`；像素字体只「允许」在屏内用，不是必须，改字体还会改标签宽度和 `TrendRecorder` 的避让计算）。`.recorder` 槽去掉凹槽底色和内阴影，保留 `padding` 和三列网格；滚轴变成 3px 宽的 `--eink-mid` 细条，仍占原来的 14px 列。
16. **`--radius-case` 的去处。** 面板 → `--radius-panel`（16px）；`.software-icon-lg`（44px 图标）→ `--radius-screen`（11px，最接近原来的 10px）；`.lcd` 原来用 `--radius-key` → `--radius-screen`。
17. **屏上图标。** 规格的去色滤镜用在 `.lcd img`（同时覆盖「最常用」图标和设置页屏里的时钟标志），去掉原来的 `mix-blend-mode`、`opacity: 0.85` 和深色的 `sepia + hue-rotate`。浅色 `--icon-well` 图标底座不变。
18. **forced-colors 下的焦点环。** 强制颜色模式会把 `box-shadow` 置为 `none`，现有焦点环（`outline: none` + `box-shadow`）在对比度主题下本来就看不见。做法：`@media (forced-colors: active)` 里 `:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }`；导航当前项、分段选中项加 `outline: 1px solid Highlight`，开关开启态 `forced-color-adjust: none; background: Highlight`。`url()` 背景（颗粒）在强制颜色下不会被自动去掉，显式 `display: none`。实现时补充（任务 3）：选中标记的 `outline` 会盖过 `:focus-visible`，所以另加 `:is(.nav-key.is-active, .segmented-option.is-selected):focus-visible` 把焦点环恢复为 2px；开启态的圆钮改用 `HighlightText`；关闭态开关原来只靠阴影和填充，强制颜色下完全看不见，所以加 `.toggle { outline: 1px solid ButtonText; outline-offset: -1px; }` 和 `.toggle-knob { forced-color-adjust: none; background: ButtonText; }`（只在强制颜色块里，不改盒子，焦点环仍然优先）。
19. **透明效果读取。** 值不存在或读失败按「开」处理（Windows 默认开）。前端只把 `false` 当作关；返回值不是布尔（测试替身、预览）一律按开。开时去掉 `data-glass` 属性，关时设 `data-glass="off"`。不缓存到 `localStorage`：关了透明效果的用户启动时可能先看到一帧玻璃，接受。「窗口重新可见」用 `visibilitychange`（`visiblePolling.ts` 同款）。
20. **`rg "backdrop-filter" src` 会多出一处 `@supports not (backdrop-filter: blur(1px))`。** 这是规格要求的回退条件，不是元素；验收 1 按「允许的元素 + 这一处条件」判断。
21. **性能基线。** 规格写「不比 v0.3.0 高」，但发布前本机装的会是 v0.3.1（界面与 v0.3.0 相同，只多了采集）。用安装 v0.4.0 前的 v0.3.1 作基线，在 `docs/CURRENT_STATE.md` 写明。**与规格原文冲突**，任务 0 请用户拍板；用户要求严格按 v0.3.0 时，需要先装回 v0.3.0 测基线（会经过一次降级安装，数据库 schema 3 → 旧版能否打开要先确认），所以推荐 v0.3.1。**用户已确认（2026-11-23）：同意偏离规格，性能基线用 v0.3.1。**预览帧率在**有界面的** Edge 窗口里测（headless 用软件渲染，不代表 WebView2），并先在 v0.3.1 界面上测一份基线（任务 1）。
22. **Windows 10（规格待确认 1）。** 有 Win10 实机或虚拟机：发布后按「本机验收」装正式安装包对照。没有：验收 8 用「Win11 + 透明效果关」和预览 `?glass=off` 截图近似，`docs/CURRENT_STATE.md` 写明未在 Win10 实测。两种情况代码相同（规格：不单独分支）。规格待确认 1 原说用「Win11 + `@supports` 强制回退」近似；三处回退（`data-glass="off"`、`prefers-reduced-transparency`、`@supports not`）只改同一组切换 token（`--glass-surface`、`--side-surface`、`--glass-filter`），`fallbacks.test.ts` 已断言三处取值一致，所以 `?glass=off` 的画面与 `@supports` 回退逐像素相同，是等价的近似。要直接模拟 `@supports` 回退也可以：`probe.mjs shot --eval` 里把样式表中的 `@supports not (backdrop-filter: blur(1px))` 规则的条件改成恒真（`CSSSupportsRule` 不可改条件时，就复制它的 `:root` 规则插到表尾），截图应与 `?glass=off` 一致。
23. **直接落在光晕背景上的文字。** 规格对比度表只算了玻璃、侧栏和子板，没算不在任何面板里的文字（统计页区间工具条、各页 `.warning`、面板外的读取提示）。按规格最坏情况实算：`B` 上 `--muted` 4.15 / 4.14、`--alert-ink` 4.32 / 4.78、`--alert-wash` 叠 `B` 后 3.72 / 4.26（浅色 / 深色）；除深色 `--alert-ink` 直接在 `B` 上之外都低于 4.5。做法（不改规格的样稿值）：这些位置的说明文字从 `--muted` 改用 `--ink-2`；`.warning` 和 `.stats-range-error` 改用不透明底 `linear-gradient(var(--alert-wash), var(--alert-wash)), var(--glass-solid)`（5.21 / 6.37）。`.stats-range-error` 因此加 `padding: 2px 8px; border-radius: var(--radius-tag)`，只在出错时出现，工具条其余项不动。备选是给整条 `.stats-range` 加 `--glass-2` 底（改变工具条外观），需用户拍板。**用户已确认（2026-11-23）：用推荐做法（`--ink-2` 文字 + 不透明警示底），工具条不加底。**
24. **浮层投影。** 规格把 `--shade` / `--shade-deep` 限定为「跳转链接、开关圆钮」的少量投影。浮层（提示气泡、帮助气泡、趋势悬停卡）浮在玻璃之上，没有投影会和下面的面板粘在一起，所以保留一层小投影，白名单为 `.skip-link`、`.toggle-knob`、`.unavailable-tooltip-bubble`、`.active-help-popover`、`.trend-tip`；主按钮、`.panel-add-button`、熄灭的灯等其余用法全部去掉。**用户已确认（2026-11-23）。**
25. **面板描边导致的 1px 内缩（已被决策 2A 取代）。** 现行做法：面板边线是内收 `outline`（取舍 11），不占盒子，外框和内容都不动，验收仍写「外框完全一致、内容 ≤ 1px」。**用户已确认（2026-11-23，看过对比图）。** 历史：规格配方原是 `border: 1px solid var(--edge)`，v0.3.1 的面板描边是 `box-shadow`，不占盒子；本条起初假设 `box-sizing: border-box` 下面板外框不变、只是内容各边内缩 1px，并因此决定不逐个抵消子元素 padding（2026-11-23 用户同意过）。实测 border 版并非如此：自适应高度的面板各高 2px，各页面板外框偏移 0.5–8px（统计最多 8、成就 6、概览 4、后台 2、设置 0.5），所以改用 2A。
26. **`--chip` / `--on` 底局部改指 `--muted`。** 规格要求 chip 底上的文字用 `--ink-2`；hover、active、选中态会把行、按钮临时变成 chip 或 `--on` 底，行内原本是 `--muted` 的小字（例如 `.software-cell small`）深色下只剩 3.81 / 3.47。做法：所有以 `--chip` / `--on` 为底色的规则同时写 `--muted: var(--ink-2)`，不逐个改后代选择器（无文字的 `.toggle`、`.mix-bar`、`.idle-bar`、`.rhythm-track` 除外）；浅色下这些小字也会变深一档，符合规格「chip 底上用 `--ink-2`」。行悬停也可以改用别的填充，但深色下 `--glass-2`（3.93）和 `--on`（3.47）同样压低 `--muted`，所以不换填充、只改指。

---

## 规格小节 → 任务

| 规格小节 | 任务 |
| --- | --- |
| Token 架构（新增 / 改值 / 删除） | 2（新增、墨色和 mix 改值、圆角）、5（`--edge`、`--edge-strong` 改值）、15（删除旧 token、改名收尾） |
| 背景光晕层 | 2 |
| 玻璃面板配方与上限 | 3（切换 token）、4（侧栏）、5（面板配方 + 模糊层 DOM 测试）、6–9（子板不模糊） |
| 原生 Mica 还是纯 CSS、回退 | 3（只读命令、`data-glass`、三处回退、forced-colors） |
| 墨水屏配方 | 10（共用配方、读数文字、设置屏、图标去色）、12（残影）、13（热力图）、14（走纸纸面） |
| 表盘墨色规则 | 11 |
| 迁移表：`body` | 2 |
| 迁移表：侧栏、导航、页头按钮 | 4 |
| 迁移表：面板、今日分布 | 5 |
| 迁移表：对话框 | 6 |
| 迁移表：开关、分段选择器 | 7 |
| 迁移表：里程碑铭牌 | 9 |
| 迁移表：今日读数、设置屏 | 10、12 |
| 迁移表：表盘 | 11 |
| 迁移表：成就热力图 | 13 |
| 迁移表：走纸记录仪 | 14 |
| 迁移表：刻字效果、深色选择器覆盖 | 各页任务里删除，15 用测试兜底 |
| 信号橙与强调色 | 4（焦点环、选区）、6（`mark`、选中行、排序、`.warning`、`.dialog-error`、移除按钮）、7（开关）、8（`.stats-range-error`）、9（6666 描边）、15（测试兜底） |
| mix 色 | 2（取值）、5（微光）、18（DESIGN.md） |
| 字体 | 4（页面标题 Display 字体）、10 / 15（像素字范围测试） |
| 动效 | 15（keyframes 测试）；各任务不新增过渡 |
| 对比度目标 | 2（自动测试，含背景 `B` 上的组合和 chip 改指守卫）、4–9（hover / 选中态改指 `--muted`）、5 / 6 / 8（直接落在背景上的文字和警示条）、16（复核） |
| 性能验收 | 1（工具 + 基线）、16（预览部分）、「本机验收」（安装版部分） |
| 验收 1、2 | 15（测试）+ 20（发布前再跑一次 `rg`） |
| 验收 3 | 每个任务 |
| 验收 4、9（预览近似） | 16 |
| 验收 5 | 2、16 |
| 验收 6、7、8、9、11（真机） | 「本机验收」（3 有单元测试，7 在 16 用模拟先看） |
| 验收 10 | 3（App.test「未开放」守卫）、20（`git diff --stat` 对 v0.3.1 发布提交 `-- src-tauri`） |
| 文档与发布 | 17（截图）、18（DESIGN.md）、19（其余文档、注释）、20（发布） |

---

## 文件结构

新建：

- `scripts/ui-preview/probe.mjs`：用 CDP 驱动本机 Edge，做带媒体模拟 / 缩放的截图、元素位置导出和滚动帧计时。
- `src/glass.ts`：`applyGlass(enabled)`、`startTransparencyWatch(read?)`。
- `src/__tests__/support/css.ts`：读三份 CSS 原文、拆规则、取主题 token、解析颜色、合成、算 WCAG 对比度（文件名不带 `.test`，不会被当成测试跑）。
- `src/__tests__/cssSupport.test.ts`、`contrast.test.ts`、`glass.test.ts`、`fallbacks.test.ts`、`glassSurfaces.test.tsx`、`LcdDial.test.tsx`、`designTokens.test.ts`。
- `src-tauri/src/appearance.rs`。
- `docs/releases/v0.4.0.md`（发布时）；本计划 `docs/superpowers/plans/2026-11-22-glass-eink-redesign.md`。

修改：

- 样式：`src/styles.css`、`src/components/StatisticsPage.css`、`src/components/AchievementsPage.css`。
- 组件：`src/components/TodayReadout.tsx`（残影）、`LcdDial.tsx`（刻线）、`TodayMix.tsx`（`--mix-color`）、`MilestoneShelf.tsx`（去螺钉）；`src/App.tsx`（挂 `startTransparencyWatch`）；`src/api.ts`（命令包装）。
- 配置与预览：`vite.config.ts`（`test.css.include`）、`scripts/ui-preview/tauri-core.ts`（新命令、`?glass=off`、`?tick`）、`scripts/ui-preview/vite.config.ts`（注释里的查询参数和另开端口的写法）。
- 后端：`src-tauri/src/lib.rs`（`pub mod appearance;`、注册命令）、`src-tauri/src/commands.rs`（命令）。
- 测试：`TodayReadout.test.tsx`、`TodayMix.test.tsx`、`AchievementsPage.test.tsx`、`App.test.tsx` 只**新增**用例，不改现有断言。
- 注释与文档：`index.html`（注释）、`DESIGN.md`、`README.md`、`docs/assets/ui-*.png`（12 张）、`PRODUCT.md`、`memory.md`、`AGENTS.md`、`docs/CURRENT_STATE.md`、`PRIVACY.md`、`CHANGELOG.md`、`docs/superpowers/specs/2026-11-21-statistics-and-achievements-design.md`、本规格状态行。
- 版本号（发布时）：`package.json`、`package-lock.json`（两处）、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`、`src-tauri/.backlog-qa/tauri.conf.json`，另加 `docs/ui-redesign-backlog.md` 的版本句。

不做：

- 原生 Mica / Acrylic、`tauri.conf.json` 窗口配置、`capabilities/default.json`、Cargo 依赖。
- 类名和组件名改名（`.lcd*`、`LcdDial`）、布局 / 字号 / 文案改动、新功能、开放「时间轴」。
- 数据、schema（仍为 3）、采集、其他命令。

---

## 视觉检查方法（各任务引用）

**预览服务器**（后台运行，只从本 worktree 起，端口 **1431**）：

```powershell
npm.cmd run preview:ui -- --port 1431 --strictPort
$base = "http://localhost:1431"
```

  `preview:ui` 默认的 1421 被外层 `.claude/launch.json` 的 `ui-preview-main`（服务 `v01-implementation`，即 `main`）占用，其他会话可能一直开着它；在 1421 上截图会悄悄截到 `main` 的 v0.3.1 界面。所以本计划一律用 1431。每次开始视觉步骤前先确认 1431 是本 worktree 的服务：`Get-NetTCPConnection -LocalPort 1431 -State Listen` 取 `OwningProcess`，再用 `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` 看 `CommandLine` 或工作目录在 `.worktrees\glass-eink` 下；不是就停掉重起。下文所有 URL 都以 `$base` 开头。

页面：概览 `$base/?theme=<t>`，其余 `?theme=<t>&page=software|background|statistics|achievements|settings`；附加参数 `&empty`、`&format=hm`、`&glass=off`（任务 3 起）、`&tick`（任务 12 起）、`&dialog=add`。

**示例数据随墙钟变。** `mock-data.ts` 的 `dayScale()`、表盘的「今日已过 HH:MM」和任务 11 起的走过刻线都取当前时间；不同时刻截的图读数和刻线数不同，上午还接近空数据。凡是要和别的截图逐张对比的（任务 1 基线、任务 16 对照、任务 17 README），一律用 `probe.mjs shot --time 22:01` 固定虚拟时间；下面的 headless 命令不能固定时间，只用于各任务的快速自查。

**任务 3 之后的补充（2026-11-23）：** `--time` 只固定时刻，示例数据还随**日期**变（统计页 1180×760 隔一天高度就不同），所以凡是要逐张对比的截图一律再加 `--date 2026-11-22`，对照 `$scratch\gst-glass\baseline-dated\`（v0.3.1 发布提交 `d0b4be1` 在 2026-11-22 22:01 的同一套截图、布局和帧率，取代 `baseline\`）。要截焦点环时加 `--focus`（headless 页面默认没有焦点，`el.focus()` 不会触发 `:focus-visible`）；表盘等过渡可能没走完时加 `--settle 2500`。

**headless 截图**（快速自查；`$scratch` 是会话 scratchpad，截图不入库）：

```powershell
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$out = "$scratch\gst-glass\task-<N>"
$edgeProfile = "$scratch\gst-glass\edge-profile"
New-Item -ItemType Directory -Force $out, $edgeProfile | Out-Null
foreach ($theme in "light", "dark") {
  foreach ($page in "overview", "software", "background", "statistics", "achievements", "settings") {
    foreach ($size in "1440,900", "1180,760") {
      $query = "theme=$theme"
      if ($page -ne "overview") { $query += "&page=$page" }
      $png = Join-Path $out "$page-$theme-$($size -replace ',', 'x').png"
      Start-Process -Wait -FilePath $edge -ArgumentList @(
        "--headless=new", "--screenshot=$png", "--window-size=$size",
        "--user-data-dir=$edgeProfile", "--virtual-time-budget=4000",
        "$base/?$query")
    }
  }
}
```

各任务只跑它列出的页面（改 `foreach` 的列表即可）。需要媒体模拟（forced-colors、reduced-transparency）、设备缩放、聚焦某元素后截图、控制台错误时，用任务 1 的 `probe.mjs shot`。

**样稿截图**（只放 scratchpad）：用同样的命令截 `file:///F:/XJTLU/科研_DIY/Global_Software_Timer/local-mockups-2026-11-22-timeline/overview-glass.html?theme=<t>&screen=eink` 和 `style-sketch.html?style=glass`，1440×900。

**对照方式**：概览页对照 `overview-glass.html` 同主题截图（侧栏玻璃、导航当前项、面板质感、墨水屏纸色与颗粒、表盘刻线、页头按钮、表格分隔线）；其他页对照任务 1 的 v0.3.1 基线截图看布局没变、对照 `style-sketch.html?style=glass` 看材质一致。每次在会话里用一两句话报告差异，不把截图放进仓库。

---

## 执行顺序与审查关口

- 顺序执行：任务 0 → 1 → 2 → 3 → … → 20。任务 4、5 只依赖任务 2、3；任务 6–9 依赖任务 5（`--edge` 改值和全部行分隔线在任务 5 一起改），彼此之间可以按需调换；10 → 11 → 12 有依赖；13、14 依赖 10；15 依赖 4–14 全部完成。
- 有可测行为的任务先写失败测试、确认失败、再实现；纯样式迁移任务以视觉检查和任务 2 / 15 的 token 测试为准。
- 每个任务结束按 `AGENTS.md` 的审查关口走完再提交：
  1. 跑 `npm.cmd run check`；
  2. 自查 `git diff`：没有顺手改动、没有调试输出、没有真实数据、没有样稿文件或图标；
  3. 规格符合性审查：逐条对照本任务列出的规格小节和迁移表行；确认现有测试断言没被改（只允许因 token 改名而改）；
  4. 代码质量审查：选择器是否删干净、有无残留的旧 token、有无新增深色选择器（token 块和取舍 1 那一条除外）、有无新增动画；
  5. 视觉检查（本任务列出的页面、主题、尺寸），在会话里报告；
  6. 修完审查意见，再按任务末尾的提交信息提交。

---

## 任务 0：准备 worktree，提交本计划

- [ ] 确认 `main` 的最新提交是 v0.3.1 发布提交：

```powershell
cd F:\XJTLU\科研_DIY\Global_Software_Timer\.worktrees\v01-implementation
git log -1 --format=%s main   # 应为 chore(release): publish 0.3.1
git status --short            # 应为空
```

- [ ] 建 worktree 和分支，联接 `node_modules`：

```powershell
git worktree add ..\glass-eink -b feat/glass-eink-redesign main
cd ..\glass-eink
cmd /c mklink /J node_modules ..\v01-implementation\node_modules
```

  `node_modules` 是目录联接，以后用 `cmd /c rmdir node_modules` 移除，不要用 `Remove-Item -Recurse`。可以设 `$env:CARGO_TARGET_DIR` 指向 `..\v01-implementation\src-tauri\target` 共用编译缓存；跑 `npm.cmd run release:build` 前必须清掉（见任务 20）。

- [ ] 基线：`. .\scripts\dev-env.ps1`，`npm.cmd run check` 全部通过，记下 vitest 与 Rust 测试数量，后面每个任务只增不减。
- [x] **开工前确认（一次问完）。** 在会话里把「实现时的取舍」里与规格冲突或影响外观的 11 条交给用户逐条拍板，每条一句话写明「规格原文 / 本计划做法 / 备选」：
  - 与规格原文冲突：1（深色子板 `--muted`：局部改指还是全局提亮）、2（刻线长 8 / 10px 而非样稿 14 / 18px）、7（未点亮铭牌虚线用 `--edge-strong` 而非 `--edge`）、21（性能基线用 v0.3.1 而非 v0.3.0）。
  - 规格没写、影响外观：4（`--edge-strong` 取值）、5（行分隔线改 `--rule`）、6（吸顶表头不透明）、14（残影范围与画法）、23（背景上的文字改 `--ink-2`、警示条不透明底）、24（浮层保留小投影）、25（面板内容内缩 1px）。
  - 把用户的答复逐条记进本计划对应的取舍条目（「用户已确认：…」），否决的条目按规格原文改写对应任务步骤。用户没答复完不开始任务 2。
- [ ] 把本计划复制到 `docs/superpowers/plans/2026-11-22-glass-eink-redesign.md`，规格状态行不动。

提交：`docs(plan): plan the v0.4.0 glass and e-ink redesign`

---

## 任务 1：预览探针与 v0.3.1 基线

**文件：** `scripts/ui-preview/probe.mjs`（新建）、`scripts/ui-preview/vite.config.ts`（只改注释）

**对应规格：** 性能验收第 1 行、验收 4（控制台无错误、窄窗口无横向滚动）、验收 7 / 9 的预览近似。

- [ ] **Step 1：写脚本**（Node 24，零依赖，用全局 `WebSocket` 和 `fetch`）：

```text
node scripts/ui-preview/probe.mjs shot   --url <u> --size 1440x900 [--time 22:01] [--scale 1.25] [--media forced-colors=active] [--media prefers-reduced-transparency=reduce] [--eval "<js>"] --out <png>
node scripts/ui-preview/probe.mjs layout --url <u> --size 1180x760 [--time 22:01] --out <json>
node scripts/ui-preview/probe.mjs frames --url <u> --size 1440x900 --scroll <selector> [--seconds 5] [--cpu 4] [--headed] [--trace <json>]
```

  - 启动 Edge：`--remote-debugging-port=<空闲端口>`、`--user-data-dir=<os.tmpdir() 下新建的临时目录>`、默认 `--headless=new`；`--headed` 时开普通窗口（帧计时用）。从 `http://127.0.0.1:<port>/json/list` 取页面的 `webSocketDebuggerUrl`。结束时关 Edge、删临时目录。只连 `127.0.0.1`。
  - 公共：`Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor: scale ?? 1, mobile: false })`；`Emulation.setEmulatedMedia({ features })`；`--time HH:MM` 时在导航前用 `Page.addScriptToEvaluateOnNewDocument` 注入一段 `Date` 替身：把「今天 HH:MM:00」作为起点，之后按真实流逝前进（`new Date()`、`Date.now()` 都走替身，带参数的 `new Date(...)` 照旧），这样 `dayScale()`、表盘指针和刻线固定在同一时刻。`Page.navigate` 后等 `document.fonts.ready`，再等到页面真的切到 `?page=` 指定的页：`.nav-key[aria-current="page"]` 的文字等于该页的中文标签（概览 / 软件 / 后台 / 统计 / 成就 / 设置），并且 `.page-header h2` 的文字也等于它（概览先渲染，只等 `h2` 出现会截到错页），最多等 10 秒，超时以退出码 3 退出；之后再等 600ms（预览替身有 60ms 延迟）。收集 `Runtime.exceptionThrown` 和 `console.error`，结束时打印并在有错误时以退出码 2 退出。
  - `--eval`：用 `Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true })` 执行，表达式可以返回 Promise（例如 `new Promise(r => setTimeout(r, 6000))`、先点击再等一帧），脚本等它完成后才截图；表达式抛错按控制台错误处理。在文件头注释里写明这一点。
  - `shot`：执行 `--eval`（例如聚焦 `.nav-key[aria-disabled="true"]`），再 `Page.captureScreenshot`。
  - `layout`：输出 JSON：`.sidebar`、`.page-header`、`.nav-key`、`.panel`、`.readout`、`.software-panel`、`.lcd`、`.lcd-value b`、`.lcd-ghost b`、`.lcd-ghost small`、`.lcd-dial`、`.paper`、`.ach-plate`、`.toggle`、`.segmented-option` 每个元素的 `getBoundingClientRect()`（取整到 0.5px），以及 `document.documentElement.scrollWidth > clientWidth`、`.workspace` 内各页面容器 `scrollWidth > clientWidth`（特别关注表自己的横向滚动不算）。
  - `frames`：可选 `Emulation.setCPUThrottlingRate({ rate })`；在页面里用 `requestAnimationFrame` 每帧把 `--scroll` 指向的元素 `scrollTop` 往返推进 8px，持续 `--seconds` 秒，记录相邻 rAF 的间隔；同时在页面里开 `PerformanceObserver({ type: "long-animation-frame", buffered: true })` 记下时长 > 50ms 的长动画帧。`--trace <json>` 时另用 CDP `Tracing.start({ categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame", transferMode: "ReturnAsStream" })` 录同一段，存成 JSON（可直接拖进 DevTools Performance 面板，就是规格说的录制方法），并从 trace 里的 `DrawFrame`（新版为 `PipelineReporter`）事件算出合成器实际呈现的帧间隔。输出 `{ frames, avgFps, maxFrameMs, over50ms, loafOver50ms, trace: { frames, avgFps, maxFrameMs, over50ms } | null, scrollHeight, clientHeight }`。`scrollHeight <= clientHeight` 时报错退出（说明没滚起来）。rAF 和 trace 结果不一致时以 trace 为准。
  - 文件头注释写清：只用于浏览器预览，不连接真实应用；Edge 窗口和临时配置在结束时清理。
- [ ] **Step 2：更新预览注释。** `scripts/ui-preview/vite.config.ts` 第 2 行的查询参数注释补全为 `?theme=light|dark, ?page=…, ?format=hm, ?empty, ?dialog=add`（`?glass=off` 在任务 3 加，`?tick` 在任务 12 加），第 1 行补一句：worktree 里另开时用 `npm run preview:ui -- --port <n> --strictPort`，避免和 `main` 的预览抢 1421。
- [ ] **Step 3：在 v0.3.1 界面上取基线**（全部放 `$scratch\gst-glass\baseline\`，不入库；全部用 `probe.mjs` 并加 `--time 22:01`，保证和任务 16 同一时刻对比）：
  - `shot`：6 页 × 2 主题 × 2 尺寸（1440×900、1180×760）；`&empty`、`&format=hm` 也各截 6 页 × 2 主题 × 2 尺寸。
  - `layout`：上面三组（普通、`&empty`、`&format=hm`）各 6 页 × 2 主题 × 2 尺寸。
  - `frames --headed --trace`：软件页 `--scroll .discovered-scroll`、统计页 `--scroll .stats-page`，各跑 1× 和 `--cpu 4`，两主题。
  - 样稿截图（见「视觉检查方法」）。
- [ ] **Step 4：检查**：`npm.cmd run check`（脚本不进构建，确认没误改别的）；`node scripts/ui-preview/probe.mjs shot --url $base/?page=statistics --size 1440x900 --time 22:01 --out $scratch\gst-glass\probe-smoke.png` 能出图、退出码 0、截到的是统计页；`--eval "new Promise(r => setTimeout(() => r(1), 1000))"` 能等满 1 秒再截。
- [ ] **Step 5：审查关口。** 重点：脚本不写仓库、不连外网、不碰用户的 Edge 配置。

提交：`chore(preview): add an Edge probe for emulated screenshots, layout and frame timing`

---

## 任务 2：新 token、背景光晕和对比度测试

**文件：** `src/styles.css`（token 块 14–107、`body` 120–126、`.modal-backdrop` 1431）、`vite.config.ts`、`src/__tests__/support/css.ts`（新建）、`src/__tests__/cssSupport.test.ts`（新建）、`src/__tests__/contrast.test.ts`（新建）

**对应规格：** Token 架构（新 token 取值表）、背景光晕层、mix 色（取值）、对比度目标、验收 5。

- [ ] **Step 1：让 vitest 读到 CSS 原文。** `vite.config.ts` 的 `test` 块加 `css: { include: [/\.css\?raw$/] }`（已实测：不加时 `?raw` 是空串）。
- [ ] **Step 2：写测试工具** `src/__tests__/support/css.ts`：
  - `import styles from "../../styles.css?raw"`，以及 `../../components/AchievementsPage.css?raw`、`StatisticsPage.css?raw`；`allCss()` 返回三份原文。
  - `parseRules(css)`：去注释，按花括号深度拆出 `{ atRules: string[], selector: string, selectors: string[], declarations: Record<string, string> }`，`@media` / `@supports` / `@container` 递归，`@keyframes` 单独记名。拆分规则：
    - 扫描时跟踪引号（`'` / `"`，含转义）和圆括号深度；花括号、`;`、`,` 只在**引号外且圆括号深度为 0** 时才算分隔符。
    - 声明按顶层 `;` 拆、再按第一个顶层 `:` 分出属性名和值，值原样保留（颗粒的 `url("data:image/svg+xml;utf8,…")` 里有 `;` 和 `,`，`--glow` 是跨多行、逗号分隔的三段 `radial-gradient(…)`）。
    - 选择器列表按顶层 `,` 拆进 `selectors`（`:is(th, td)`、`:is(:hover, :focus-visible)`、`:not(:first-child, :last-child)`、`:has(img:not([hidden]))`、`:is(.mix-plate, .ach-plate.is-reached)` 都不能被拆开）。
    - `@media` / `@supports` 的前导条件原样存进 `atRules`。
  - 写一个小的自测 `src/__tests__/cssSupport.test.ts`：一条含 `url("data:image/svg+xml;utf8,<svg …;…,…>")` 的声明拆成一个值；`a:is(.x, .y) b, c` 拆成两个选择器；多行 `--glow` 值完整保留；`@supports not (backdrop-filter: blur(1px)) { :root { … } }` 的条件原样记下。
  - `themeTokens(theme)`：取 `:root, :root[data-theme="light"]` 块；深色再用 `:root[data-theme="dark"]` 块覆盖；`resolve(value)` 递归替换 `var(--x)`。
  - 颜色：解析 `#rgb` / `#rrggbb` / `rgb()` / `rgba()`（逗号和 `/` 两种写法）、`color-mix(in srgb, A p%, transparent)`；`over(fg, bg)` 按 alpha 合成；`luminance`、`contrast`（WCAG：$(L_1+0.05)/(L_2+0.05)$，$L_1 \ge L_2$）。
  - `glowCenter(theme)`：取 `--glow` 第一个 `radial-gradient` 的颜色（左上蓝光晕）；`backdrop(theme) = over(glowCenter, --base)`。
  - `paperStops(theme)`：`--eink-paper` 是颜色时返回它，是 `linear-gradient` 时返回各色标。
- [ ] **Step 3：写失败测试** `contrast.test.ts`，两套主题各跑一遍（`B = backdrop(theme)`，`G = over(--glass, B)`，`S = over(--side, B)`）：

| 组合 | 阈值 |
| --- | --- |
| 直接在背景上：`--ink`、`--ink-2` 在 `B` 上（统计区间工具条、面板外的读取提示、页头标题；`--muted` 在 `B` 上只有约 4.15，不列入，按取舍 23 不用） | 4.5 |
| `--ink-2` 在 `over(--chip, B)` 上（统计页工具条里的分段选择器未选项） | 4.5 |
| `--ink` 在 `over(--glass-2, B)` 上（页头按钮）、在 `over(--on, B)` 上（页头按钮 hover） | 4.5 |
| `--alert-ink` 在 `over(--alert-wash, --glass-solid)` 上（`.warning`、`.stats-range-error` 的不透明底，取舍 23） | 4.5 |
| `--ink`、`--ink-2`、`--muted` 在 `G` 上 | 4.5 |
| `--muted` 在 `S` 上 | 4.5 |
| `--ink-2` 在 `over(--chip, G)` 上 | 4.5 |
| `--ink-2` 在 `over(--glass-2, G)` 上；浅色 `--muted` 在 `over(--glass-2, G)` 上（深色这一行在任务 5 按取舍 1 的结论加入） | 4.5 |
| `--ink` 在 `over(--on, G)` 上 | 4.5 |
| `--signal-ink` 在 `G` 上 | 4.5 |
| `--alert-ink` 在 `G` 上、在 `over(--alert-wash, G)` 上 | 4.5 |
| `--accent` 在 `G` 上、在 `--glass-solid` 上（焦点环间隔色） | 3 |
| `--ink` 在 `over(accent 30%, G)`（选区）和 `over(accent 16%, G)`（`mark`）上 | 4.5 |
| `--ink`、`--ink-2`、`--muted` 在 `--glass-solid` 上，且**不低于**在 `G` 上的值（验收 6「对比度不下降」） | 4.5 |
| `--eink-ink`、`--eink-dim` 在每个纸面色标上 | 4.5 |
| `--eink-mid` 在每个纸面色标上 | 3 |

  失败时用 `toBeGreaterThanOrEqual` 的消息带上「组合名 + 实算值」。

  同一文件再加两组：

  - `it("matches the spec's token table")`：按规格「新 token 取值」表逐项断言 `themeTokens("light")` / `themeTokens("dark")` 的原始值（比较前去空白、统一小写、`0.5` 与 `.5` 视为相同）：`--base`、`--ink`、`--ink-2`、`--muted`、`--glass`、`--glass-solid`、`--glass-2`、`--chip`、`--on`、`--side`、`--rule`、`--glass-hi`、`--glass-shadow`、`--accent`、`--alert-ink`、`--alert-wash`、`--eink-paper`、`--eink-paper-solid`、`--eink-ink`、`--eink-dim`、`--eink-mid`、`--eink-track`、`--eink-ghost`、`--eink-grain`、`--eink-grain-blend`、`--mix-1…7`，以及圆角 `--radius-panel 16px`、`--radius-key 9px`、`--radius-screen 11px`、`--radius-dialog 16px`；`--glow` 断言三段的位置和颜色。`--edge`、`--edge-strong` 在任务 5 改值时补进这张表。
  - `it("re-points --muted on chip and on surfaces")`（口径表「`--chip`、`--on` 底」，取舍 26）：遍历三份 CSS 的全部规则，凡是 `background` 或 `background-color` 的值含 `var(--chip)` 或 `var(--on)` 的，同一规则必须声明 `--muted: var(--ink-2)`；白名单只有无文字的 `.toggle`、`.mix-bar`、`.idle-bar`、`.rhythm-track`（按 `selectors` 精确匹配，含它们的伪类变体）。本任务还没有这样的规则，测试先作为守卫存在，任务 4–14 新写的规则都要满足它。

- [ ] **Step 4：确认失败**：`npx.cmd vitest run src/__tests__/cssSupport.test.ts src/__tests__/contrast.test.ts`（token 还不存在、工具还没写）。
- [ ] **Step 5：实现 token。** 在两个 token 块里**新增**（旧 token 本任务不删，任务 15 删）：

```css
/* 浅色（:root, :root[data-theme="light"]） */
--base: #eceef3;
--glow:
  radial-gradient(820px 600px at 8% -6%, rgba(90, 160, 255, 0.34), transparent 62%),
  radial-gradient(760px 640px at 98% 10%, rgba(240, 120, 190, 0.26), transparent 60%),
  radial-gradient(860px 600px at 52% 110%, rgba(160, 130, 255, 0.3), transparent 62%);
--glass: rgba(255, 255, 255, 0.5);
--glass-solid: #f6f7f9;
--glass-2: rgba(255, 255, 255, 0.55);
--chip: rgba(20, 30, 60, 0.06);
--on: rgba(255, 255, 255, 0.75);
--side: rgba(255, 255, 255, 0.38);
--rule: rgba(20, 30, 60, 0.07);
--glass-hi: rgba(255, 255, 255, 0.8);
--glass-shadow: 0 18px 46px rgba(60, 70, 110, 0.14), 0 0 0 1px rgba(20, 30, 60, 0.06);
--accent: #2f7de1;
--alert-ink: #b42318;
--alert-wash: rgba(180, 35, 24, 0.1);
--eink-paper: #fafaf7;
--eink-paper-solid: #fafaf7;
--eink-ink: #0b0b0a;
--eink-dim: #45443f;
--eink-mid: #7c7b76;
--eink-track: rgba(11, 11, 10, 0.12);
--eink-ghost: rgba(11, 11, 10, 0.04);
--eink-grain: 0.06;
--eink-grain-blend: multiply;
--mix-glow: 0%;
--radius-panel: 16px;
--radius-screen: 11px;
```

  深色块：`--base: #17171a`；`--glow` 用规格的深色三段（`10% -4%` / `96% 14%` / `52% 108%`，`rgba(80,150,255,.30)` / `rgba(236,92,170,.24)` / `rgba(150,110,255,.28)`）；`--glass: rgba(40, 40, 46, 0.42)`、`--glass-solid: #1e1e22`、`--glass-2: rgba(255, 255, 255, 0.06)`、`--chip: rgba(255, 255, 255, 0.07)`、`--on: rgba(255, 255, 255, 0.1)`、`--side: rgba(30, 30, 34, 0.55)`、`--rule: rgba(255, 255, 255, 0.07)`、`--glass-hi: rgba(255, 255, 255, 0.07)`、`--glass-shadow: 0 24px 60px rgba(0, 0, 0, 0.35)`、`--accent: #5aa9ff`、`--alert-ink: #ff8a80`、`--alert-wash: rgba(255, 138, 128, 0.08)`、`--eink-paper: linear-gradient(105deg, #1f2d40 0%, #281f40 45%, #401f40 100%)`、`--eink-paper-solid: #281f40`、`--eink-ink: #f7f7f9`、`--eink-dim: #c4c1ca`、`--eink-mid: #85828b`、`--eink-track: rgba(247, 247, 249, 0.14)`、`--eink-ghost: rgba(247, 247, 249, 0.05)`、`--eink-grain: 0.45`、`--eink-grain-blend: soft-light`、`--mix-glow: 40%`。

  **改值**（两块各自）：`--ink` / `--ink-2` / `--muted` 改为 `#17191d` / `#33373e` / `#5a606c` 与 `#f1f3f7` / `#d5d9e0` / `#98a0ad`；`--mix-1…7` 改为规格的两组；`--radius-key: 9px`、`--radius-dialog: 16px`（只在浅色块，深色继承）。

  **用上光晕**：`body { background: var(--glow), var(--base); }`（121 行）；`.modal-backdrop` 只把 `color-mix` 里的 `--case` 换成 `--base`，整行写成 `background: color-mix(in srgb, var(--base) 55%, var(--modal-scrim));`（1431 行；不要把整个背景换成不透明的 `--base`，那会把对话框后面的界面全盖住）。
- [ ] **Step 6：通过测试**，`npm.cmd run check`。
- [ ] **Step 7：视觉检查**：概览、设置两页 × 两主题 × 1440×900。此时面板还是旧的不透明面板，只确认光晕在窗口四角、随页面滚动不动、没有色带断层，旧界面仍可用。
- [ ] **Step 8：审查关口。** 规格符合性：逐项对照「新 token 取值」表；光晕浅色位置用 `8% -6%`、`98% 10%`、`52% 110%`。

提交：`feat(ui): add glass, e-ink and accent tokens over a glow background`

---

## 任务 3：透明效果只读命令与回退开关

**文件：** `src-tauri/src/appearance.rs`（新建）、`src-tauri/src/lib.rs`、`src-tauri/src/commands.rs`、`src/api.ts`、`src/glass.ts`（新建）、`src/App.tsx`、`src/styles.css`（`:root` 切换 token、回退块、forced-colors 块）、`scripts/ui-preview/tauri-core.ts`、`scripts/ui-preview/vite.config.ts`（注释）、`src/__tests__/glass.test.ts`、`src/__tests__/fallbacks.test.ts`、`src/__tests__/App.test.tsx`（只新增一个用例）

**对应规格：** 「原生 Mica 还是纯 CSS」整节（回退表每一行）、已定 6、验收 6 / 7 / 10 的代码部分。

- [ ] **Step 1：写失败测试（Rust）**，`appearance.rs` 里 `#[cfg(test)] mod tests`：
  - `missing_or_unreadable_value_counts_as_on`：`transparency_from_dword(None) == true`。
  - `zero_turns_transparency_off`：`Some(0) == false`；`Some(1)`、`Some(2)` 为 `true`。
  - `#[cfg(windows)] reads_the_current_user_setting_read_only`：调用 `transparency_effects_enabled()` 不 panic；再用 `std::process::Command::new("reg").args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "/v", "EnableTransparency"])` 读同一个值（只读），两者一致（`reg` 找不到值时期望 `true`）。
- [ ] **Step 2：确认失败**：`cargo test --manifest-path src-tauri\Cargo.toml --lib appearance`。
- [ ] **Step 3：实现（Rust）。**

```rust
//! Windows appearance settings the UI follows. Read-only; nothing is stored.

/// Whether Windows "Transparency effects" is on. A missing or unreadable
/// value counts as on, which is the Windows default.
pub fn transparency_effects_enabled() -> bool {
    transparency_from_dword(read_enable_transparency())
}

pub fn transparency_from_dword(value: Option<u32>) -> bool {
    value != Some(0)
}

#[cfg(target_os = "windows")]
fn read_enable_transparency() -> Option<u32>;   // RegGetValueW(HKEY_CURRENT_USER, …\Personalize, "EnableTransparency", RRF_RT_REG_DWORD, …)

#[cfg(not(target_os = "windows"))]
fn read_enable_transparency() -> Option<u32> { None }
```

  `RegGetValueW` 直接对 `HKEY_CURRENT_USER` + 子键路径调用，不需要 `RegOpenKeyExW`；`wide()` 照 `tray_icons.rs` 的写法在本模块里写一份（几行，不为它抽公共模块）。`lib.rs` 加 `pub mod appearance;`；`commands.rs` 加：

```rust
/// Read-only: whether Windows transparency effects are on. Not stored.
#[tauri::command(async)]
pub fn get_transparency_effects_enabled() -> bool {
    crate::appearance::transparency_effects_enabled()
}
```

  `lib.rs` 的 `generate_handler!` 里加 `commands::get_transparency_effects_enabled`。不改 `capabilities/default.json`、`Cargo.toml`（`Win32_System_Registry` 已启用）。
- [ ] **Step 4：写失败测试（前端）**：
  - `src/__tests__/glass.test.ts`（`vi.mock("@tauri-apps/api/core")`）：
    - `invoke` 返回 `false` → `document.documentElement.dataset.glass === "off"`；返回 `true` → 属性被去掉；返回 `undefined` / 对象 / 抛错 → 属性不存在（按开）。
    - 页面隐藏时不读；`visibilitychange` 且 `document.hidden === false` 时再读一次（先 `false` 后 `true`，属性随之去掉）。
    - 返回的清理函数移除监听，之后的 `visibilitychange` 不再触发读取。
    - 慢请求返回前又触发一次：只按最后一次结果设属性（用序号丢弃过期结果）。
  - `src/__tests__/fallbacks.test.ts`（用 `support/css.ts`）：
    - `:root` 定义 `--glass-surface: var(--glass)`、`--side-surface: var(--side)`、`--glass-filter: blur(30px) saturate(1.4)`。
    - `:root[data-glass="off"]`、`@media (prefers-reduced-transparency: reduce)` 下的 `:root`、`@supports not (backdrop-filter: blur(1px))` 下的 `:root` 三处，都把 `--glass-surface`、`--side-surface` 设为 `var(--glass-solid)`，`--glass-filter` 设为 `none`。
    - `@media (forced-colors: active)` 里有 `:focus-visible` 的 `outline`，并且把 `.lcd::before`、`.lcd::after` 设为 `display: none`。
    - `@media (forced-colors: active)` 里 `body` 的 `background` 是 `Canvas`，不含 `var(--glow)`（光晕去掉）。任务 12 再加「`.lcd-ghost` 为 `display: none`」，任务 14 再加「`.paper` 在 Canvas / CanvasText 规则里，`.paper::before`、`.paper::after` 为 `display: none`」。
  - `App.test.tsx` 新增 `it("asks Windows whether transparency effects are on")`：渲染后 `mockInvoke` 被以 `"get_transparency_effects_enabled"` 调用过。
  - `App.test.tsx` 新增 `it("still marks the timeline entry as unavailable")`（验收 10 的自动化部分）：侧栏「时间轴」按钮 `aria-disabled="true"`，且按钮内有文字为「未开放」的 `em`（它是 `aria-hidden`，用 `container.querySelector` 而不是 `getByText` 取）。本版之前就成立，写完即通过，作为回归守卫。
- [ ] **Step 5：确认失败**：`npx.cmd vitest run src/__tests__/glass.test.ts src/__tests__/fallbacks.test.ts`。
- [ ] **Step 6：实现（前端）。**
  - `src/api.ts`：`export async function getTransparencyEffectsEnabled(): Promise<boolean> { return invoke<boolean>("get_transparency_effects_enabled"); }`。
  - `src/glass.ts`：

```ts
/** Opaque panels when Windows transparency effects are off; glass otherwise. */
export function applyGlass(enabled: boolean): void;

/**
 * Reads the Windows setting now and whenever the window becomes visible again.
 * Anything but `false` (an error, a test double, the browser preview) keeps glass on.
 * Returns a cleanup that stops listening.
 */
export function startTransparencyWatch(read: () => Promise<unknown> = getTransparencyEffectsEnabled): () => void;
```

  - `src/App.tsx`：紧接 212 行加 `useEffect(() => startTransparencyWatch(), []);`。
  - `src/styles.css`，token 块之后：

```css
:root {
  --glass-surface: var(--glass);
  --side-surface: var(--side);
  --glass-filter: blur(30px) saturate(1.4);
}

/* Opaque panels, glow kept: Windows transparency off, reduced transparency, or no blur support. */
:root[data-glass="off"] {
  --glass-surface: var(--glass-solid);
  --side-surface: var(--glass-solid);
  --glass-filter: none;
}

@media (prefers-reduced-transparency: reduce) {
  :root { /* 同上三行 */ }
}

@supports not (backdrop-filter: blur(1px)) {
  :root { /* 同上三行 */ }
}
```

  - `@media (forced-colors: active)` 块（放在文件末尾 `prefers-reduced-motion` 块旁）：`body { background: Canvas; }`；`.sidebar, .panel, .readout, .software-panel, .lcd, .dialog, .add-software-dialog { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }`；`.lcd::before, .lcd::after { display: none; }`；`:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }`；`.nav-key.is-active, .segmented-option.is-selected { outline: 1px solid Highlight; }`；`.toggle.is-on { forced-color-adjust: none; background: Highlight; }`（取舍 18）。
  - 预览替身 `tauri-core.ts`：`case "get_transparency_effects_enabled": return (params.get("glass") !== "off") as T;`；`scripts/ui-preview/vite.config.ts` 注释加 `?glass=off`。
- [ ] **Step 7：通过测试**：定向 vitest、`cargo test --manifest-path src-tauri\Cargo.toml --lib appearance`、`npm.cmd run check`。
- [ ] **Step 8：视觉检查**：此时还没有元素用切换 token，外观应与任务 2 相同；`?glass=off` 打开概览不报错（`probe.mjs shot` 退出码 0）。
- [ ] **Step 9：审查关口。** 规格符合性：回退表六行逐行核对（Win10 不单独分支、低功耗不检测）；只读注册表、不落库、不新增 Cargo 特性；验收 10：`git diff --stat main -- src-tauri` 只有 `appearance.rs`、`lib.rs`、`commands.rs`。

提交：`feat(ui): fall back to opaque panels when Windows transparency is off`

---

## 任务 4：侧栏、导航、页头与按钮

**文件：** `src/styles.css`（`::selection` 145、`--focus` 53、滚动条 155–158、`.skip-link` 166–175、`.sidebar` 193–201、`.brand` 203–210、`.nav-key` 247–304、`.sidebar-footer` 306–332、`.page-header h2` 348–352、按钮 360–436、`.lamp.is-lit` 459–463、提示气泡 1051–1065）

**对应规格：** 迁移表「侧栏」「导航」「页头按钮」；信号橙与强调色（焦点环、选区）；字体（页面标题）；取舍 8、9、10、11、12。

- [ ] **Step 1：侧栏**：

```css
.sidebar {
  position: relative;
  z-index: 4; /* its tooltips reach over the glass panels */
  /* padding、flex 不变 */
  background: var(--side-surface);
  border-right: 1px solid var(--edge);
  backdrop-filter: var(--glass-filter);
}
```

  删掉 `box-shadow: inset -1px 0 0 var(--highlight)`。`.brand` 下边线、`.sidebar-footer` 上边线改 `1px solid var(--rule)`，删掉两处 `--highlight` 阴影。
- [ ] **Step 2：导航**（247–304）：`.nav-key` 底色透明；`:not([aria-disabled="true"]):hover` → `background: var(--chip); --muted: var(--ink-2);`（口径表「`--chip`、`--on` 底」）；`.nav-key.is-active, .nav-key.is-active:hover` → `--muted: var(--ink-2); color: var(--ink); font-weight: 600; background: var(--on); box-shadow: inset 3px 0 0 var(--accent), inset 0 0 0 1px var(--edge), 0 4px 14px rgba(0, 0, 0, 0.08);`（最后一段是样稿值）；删除凸起态（263–269）和按下态的 `transform`、内阴影（275–284，`:active` 只设 `background: var(--on)`）。未开放项：`color` 和 `em` 的 `--faint` → `--muted`（287、300），`em` 边框 `--edge-strong` 不变。
- [ ] **Step 3：页头与按钮。** `.page-header h2` 加 `font-family: "Segoe UI Variable Display", var(--font-ui);`（字号字重不变）。`.header-button, .button, .panel-link, .text-action`：`background: var(--glass-2)`，`box-shadow: inset 0 0 0 1px var(--edge)`，删高光和 `0 1px 2px var(--shade)`；`:hover` → `background: var(--on); --muted: var(--ink-2);`；`:active` → `background: var(--chip); --muted: var(--ink-2);`，删 `transform` 和内阴影（取舍 10）；禁用态 `color: var(--faint)` → `--muted`（399）。`.panel-link` 保持透明底 + `inset 0 0 0 1px var(--edge)`。`.button-primary, .panel-add-button`：`color: var(--glass-solid)`，`box-shadow: none`（去掉原来的 `--shade-deep` 投影，口径表「投影颜色」）；hover `color-mix(in srgb, var(--ink) 86%, var(--glass-solid))`。`.panel-add-button:active, .button-primary:active` 的 `translateY` 删除（1152–1155）。页头里直接落在背景上的文字（标题、页头按钮）按口径表「直接画在光晕背景上的文字」核对：标题 `--ink`，按钮 `--ink-2` 在 `--glass-2` 上（共用按钮规则的 `color: var(--ink-2)`）。**用户已确认（2026-11-23，看过对比图）：未开放的页头按钮用决策 1B**——日期按钮、导出、更多（始终 `aria-disabled`）保留 `--glass-2` 底和 `inset 0 0 0 1px var(--edge)` 线，不改成透明底；文字用 `--ink-2`，不用 `--muted`；悬停、按下时外观不变。**面板内控件用决策 3C**（取代上面「`.panel-link` 保持透明底」）：面板里的 `.panel-link`、`.text-action`、普通 `.button` 用 `--glass-2` 底 + 1px `--edge-strong` 线，见取舍 11；未开放的面板内「更多」同样用 `--ink-2` 文字（深色 `--muted` 在 `--glass-2` 上只有 3.93）。
- [ ] **Step 4：焦点、选区、杂项。** `--focus: 0 0 0 2px var(--glass-solid), 0 0 0 4px var(--accent);`（两个 token 块里只在浅色块定义一次，深色继承）。`::selection` 按取舍 8。`.skip-link` 底色 `--glass-solid`。`.unavailable-tooltip-bubble` 的 `color: var(--panel)` → `--glass-solid`。`.lamp.is-lit, .status-badge.running .lamp` 的 `0 0 9px var(--signal)` → `0 0 8px var(--signal)`（规格「带 8px 微光」），其余不变；熄灭的 `.lamp`（456 行）删掉 `inset 0 1px 1px var(--shade-deep)` 内阴影，只留 `--lamp-off` 底色。提示气泡 `.unavailable-tooltip-bubble` 的 `0 4px 12px var(--shade-deep)`（1063）保留（取舍 24 白名单）。`.panel-head h2, .software-panel-head h2, .settings-group h3` 的 `text-shadow`（524）删除。
- [ ] **Step 5：检查**：`npm.cmd run check`（现有导航、主题测试不应受影响）。
- [ ] **Step 6：视觉检查**：概览、统计两页 × 两主题 × 1440×900 和 1180×760；对照 `overview-glass.html` 的侧栏和导航当前项。另用 `probe.mjs shot --eval "document.querySelector('.nav-key[aria-disabled=true]').focus()"` 截一张，确认「该功能暂未完成」气泡在侧栏右侧、没被正文盖住（取舍 12）；再用 `--eval` 聚焦一个页头按钮，确认 `--accent` 焦点环清楚。
- [ ] **Step 7：审查关口。** 迁移表三行逐行核对；`rg "translateY\(1px\)" src/styles.css` 只剩不属于导航和按钮的地方（应为 0）。

提交：`feat(ui): turn the sidebar, navigation and header buttons into glass`

---

## 任务 5：玻璃面板配方与概览页

**文件：** `src/styles.css`（token 块的 `--edge`、`--edge-strong`；面板 492–501；概览 815–1042；全部行分隔线；决策 1B、3C 的按钮规则；吸顶表头补画边线；forced-colors 块里面板的 `outline`）、`src/components/StatisticsPage.css`、`src/components/AchievementsPage.css`（只改行分隔线）、`src/components/TodayMix.tsx`、`src/__tests__/TodayMix.test.tsx`（新增用例）、`src/__tests__/glassSurfaces.test.tsx`（新建）、`src/__tests__/contrast.test.ts`（补 `--edge` 取值）、`src/__tests__/fallbacks.test.ts`（决策 2A 的 forced-colors 断言）

**对应规格：** 玻璃面板配方与上限、迁移表「面板」「今日分布」、mix 色（微光）、Token 架构（`--edge` 改值）；取舍 1、4、5、13、16、25、26。

- [ ] **Step 0：** 取舍 1 等 11 条已在任务 0 由用户拍板（2026-11-23，全部按推荐）；取舍 1 选的是「局部改指」，按 Step 4 的「局部改指」分支执行。
- [ ] **Step 1：写失败测试。**
  - 先确认预览替身能过类型检查：建一个临时 `$scratch\tsconfig.preview-check.json`（`extends` 仓库的 `tsconfig.json`，`include` 只写 `src` 和 `scripts/ui-preview/tauri-core.ts`、`mock-data.ts`、`tauri-window.ts`、`autostart.ts`，不含 `scripts/ui-preview/vite.config.ts`——它的 `node:url` 报错是已知的老问题），跑 `npx.cmd tsc --noEmit -p <该文件>`。有类型错就在本任务里就地修这几个文件的类型（只改类型，不改数据），和测试一起提交；临时 tsconfig 不入库。
  - `glassSurfaces.test.tsx`：
    - 用 `support/css.ts` 收集所有带 `backdrop-filter` 声明的规则（属性名用 `"backdrop" + "-filter"` 拼），断言选择器集合恰好是 `.sidebar`、`.panel`、`.readout`、`.software-panel`、`.modal-backdrop`（加上 `@supports not (...)` 条件本身不算规则）。
    - 渲染整个 `<App />`，用预览替身作数据：`vi.mock("@tauri-apps/api/core", () => import("../../scripts/ui-preview/tauri-core"))`，`@tauri-apps/api/window`、`@tauri-apps/plugin-autostart` 同样指向 `scripts/ui-preview/tauri-window.ts`、`autostart.ts`；`vi.stubGlobal("ResizeObserver", …)`（照 `StatisticsPage.test.tsx:201`）。依次点侧栏的 概览 / 软件 / 后台 / 统计 / 成就 / 设置，每页等内容出现后：`querySelectorAll(".sidebar, .panel, .readout, .software-panel")` 的数量 ≤ 6，且每个元素的 `parentElement?.closest(同一选择器)` 为 `null`（不嵌套）。统计页断言正好 6 个，提醒后来的人这一页已到上限。
  - `contrast.test.ts` 的 token 表补 `--edge`、`--edge-strong` 的新值（先写，确认失败）。
  - `TodayMix.test.tsx` 新增：第一个色段 `style.getPropertyValue("--mix-color") === "var(--mix-1)"`，第二个是 `var(--mix-2)`。
- [ ] **Step 2：确认失败**：`npx.cmd vitest run src/__tests__/glassSurfaces.test.tsx src/__tests__/TodayMix.test.tsx`。
- [ ] **Step 3：面板配方**（替换 492–501）：

```css
.panel,
.readout,
.software-panel {
  border: 1px solid var(--edge);
  border-radius: var(--radius-panel);
  background: var(--glass-surface);
  box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-hi);
  backdrop-filter: var(--glass-filter);
}
```

  **用户已确认（2026-11-23，看过对比图）：面板边线用决策 2A**——上面的 `border: 1px solid var(--edge)` 改为 `border: 0; outline: 1px solid var(--edge); outline-offset: -1px;`，高光改为 `inset 0 2px 0 var(--glass-hi)`（见取舍 11、25）。

  `--edge` 改为 `rgba(255, 255, 255, 0.75)` / `rgba(255, 255, 255, 0.11)`；`--edge-strong` 改为 `rgba(20, 30, 60, 0.18)` / `rgba(255, 255, 255, 0.18)`（取舍 4）。
- [ ] **Step 4：全部行分隔线（取舍 5）。** `--edge` 在本任务变成白色高光，所以所有「行与行之间」的分隔线必须在同一个提交里换成 `--rule`，否则后面几页在任务 6–9 之前会出现看不见的分隔线：
  - `styles.css`：`.usage-row`（822）、`.recent-item`（1029）、`.focused-table-row`（1190）、`.hidden-software-row`（1254）、`.discovered-row`（1309）、`.add-software-results`（1526）、`.add-software-row`（1538）、`.add-software-footer`（1563）、`.settings-row`（1629）、`.background-table td`（1998）。
  - `StatisticsPage.css`：`.stats-row`（456）、`.stats-empty`（592）、`.stats-foot`（645）、`.rhythm-grid`（674）、`.rhythm-cell + .rhythm-cell`（686）、1200px 以下的 `.rhythm-cell:nth-child(n + 3)`（760）。
  - `AchievementsPage.css`：`.ach-record + .ach-record`（387，`--highlight` 阴影留给任务 9 删）、`.ach-coming`（731）。
  - 保留 `--edge` 的「物体轮廓」：`.sidebar` 右边线（199）、`.brand`（208）和 `.sidebar-footer`（311）已在任务 4 改 `--rule`。改完 `rg -n "solid var\(--edge\)" src` 只剩 `.sidebar` 和面板配方。
- [ ] **Step 5：概览页。**
  - `.usage-head`（832）：去掉 `background`，文字 `--muted` 不变（取舍 6）。
  - 行悬停（853–856，`.usage-scroll .usage-row:hover`、`.background-row:hover`）：`background: var(--chip); --muted: var(--ink-2);`（行内 `.software-cell small` 是 `--muted`，深色 chip 上只有 3.81，取舍 26）。
  - `.software-icon-lg` 圆角 → `--radius-screen`（920，取舍 16）；`.default-mark` 底色 `--chip`，同一规则加 `--muted: var(--ink-2)`（938）。
  - 面板外的读取提示直接落在背景上（取舍 23）：在 `.empty-state` 规则后加一条 `main > .empty-state, main > p[role="status"] { color: var(--ink-2); }`，一次覆盖概览「正在读取概览…」、统计 / 成就 / 后台的「正在读取…」（都是 `main` 的直接子元素，已核对 StatisticsPage.tsx:174、AchievementsPage.tsx:56、BackgroundPage.tsx:126）和 App.tsx 的 Suspense 读取提示；面板里的 `.empty-state` 不是 `main` 的直接子元素，不受影响。
  - 今日分布：945 行注释改为 `/* Software identity colours; the distribution plate is where they appear today. */`；`.mix-plate` → `background: var(--glass-2); box-shadow: inset 0 0 0 1px var(--edge);`；`.mix-bar` 去掉 `overflow: hidden`，底色 `--chip`；`.mix-segment` 加 `box-shadow: 0 0 12px color-mix(in srgb, var(--mix-color) var(--mix-glow), transparent);`，`:first-child` / `:last-child` 补 `--radius-tag` 圆角（取舍 13）。
  - 取舍 1 若选「局部改指」：加 `:root[data-theme="dark"] :is(.mix-plate, .ach-plate.is-reached) { --muted: var(--ink-2); }`，对比度测试补「深色子板说明文字（`--ink-2`）在 `over(--glass-2, G)` 上 ≥ 4.5」；若选「全局提亮」：改深色 `--muted` 为 `#a8afbb`，对比度测试补「深色 `--muted` 在 `over(--glass-2, G)` 和 `over(--chip, G)` 上 ≥ 4.5」。先写这一行测试、确认失败，再改 CSS。
  - `TodayMix.tsx`：色段 style 加 `"--mix-color": mixColor(index)`（用 `as CSSProperties`），图例圆点不变。
- [ ] **Step 6：通过测试**，`npm.cmd run check`。
- [ ] **Step 7：视觉检查**：概览 × 两主题 × 两尺寸，另加 `&empty`、`&glass=off`；对照 `overview-glass.html`：面板白边与投影、表格分隔线、色板子板、深色色条微光。软件、后台、统计、成就、设置各截一张浅色，确认行分隔线都看得见（其余样式此时还是旧的，属正常）。`probe.mjs layout --time 22:01` 与基线比：`.sidebar`、`.panel`、`.readout`、`.software-panel` 外框完全一致，内容元素差 ≤ 1px（口径表「布局」）。
- [ ] **Step 8：审查关口。** 迁移表「面板」「今日分布」逐行；模糊层测试覆盖六页；`readout` 里的 `.lcd` 此时仍是液晶（任务 10 再换）。

**任务 4、5 遗留到后续任务（2026-11-23）：**

- `.software-panel.is-editing .text-action`、`.software-remove-button`、`.active-help-button` 自己的 `box-shadow` 盖住了焦点环 → 任务 6 改这几条规则时一并恢复。
- 分段选择器选中项的焦点环被选中态盖住 → 任务 7。
- 走纸记录仪的 `.rule-minor`、`.rule-day` 暂时用 `--edge-strong` → 任务 14 改用 `--eink-track`。
- 滚动区和滚动条的直角露出面板 16px 圆角 → 任务 16 验收时处理。
- 导航 `:active` 按任务 4 Step 2 用 `--on`；取舍 10 里「`:active` 只换底色（`--chip`）」只指页头按钮和次按钮。
- `.ach-readout` 加了 `overflow: clip`：玻璃滤镜让 `.readout` 成为热力图里隐藏表格的包含块，表格不认 `height: 1px`，不裁掉就会多出一整段可滚动的空白。
- 胶囊圆角（样稿 `999px`，现用 `--radius-key`）保持不变。
- 吸顶表头 `.focused-table-head`、`.background-table th` 现在用内阴影补画面板左右边线（取舍 11）→ 任务 6 把它们换成 `--glass-solid`（决策 E-B 后底色为 `--head-solid`，见取舍 6）时保留这几条 `box-shadow`，并在 Step 6 用 2x 深色放大截图确认表头行的边线连续。强制颜色下 `box-shadow` 被置为 `none`，不透明表头仍盖住面板的 `CanvasText` 边线 → 同样在任务 6 处理（例如只在 forced-colors 块里给表头两端加 `border-inline: 1px solid CanvasText`，内容移 ≤ 1px），任务 16 Step 3 复查。
- 强制颜色下 `.lcd` 的 `border: 1px solid CanvasText`（任务 3 起）让自适应高度的 `.readout` 高 2px，概览、成就页下方面板和元素下移 2px → 任务 10 改 `.lcd` 时一并改成 `outline: 1px solid CanvasText; outline-offset: -1px`（`fallbacks.test.ts` 里 `.lcd` 的 border 断言要相应改，需协调方或用户同意）。2026-11-23 仍未定：用户还没决定，留给任务 10，之前不改。
- 成就页「查看名单」是唯一可用的 `.panel-link`，决策 3C 后它像按键，却没有 `:hover` / `:active`（v0.3.1 也没有）→ 任务 9 在 hover 规则里加 `.panel-link:not([aria-disabled="true"])`（`--on`、`--muted: var(--ink-2)`），active 规则里同样加（`--chip`）。
- 强制颜色下按钮的 `--glass-2` 底和内阴影边线都会消失，页头「导出」「更多」和面板内「更多」「编辑」「查看名单」只剩文字（一直如此，不是本任务引入）→ 任务 16 验收 7 时在 forced-colors 块里加 `:is(.header-button, .button, .panel-link, .text-action) { outline: 1px solid ButtonText; outline-offset: -1px; }`（同 `.toggle` 的做法）。

提交：`feat(ui): apply the glass panel recipe to every page and restyle the overview`

---

## 任务 6：软件页、后台页、对话框与警示色

**文件：** `src/styles.css`（`.warning` 438–445、软件页 1161–1408、对话框 1424–1569、后台页 1866–2021）

**对应规格：** 迁移表「对话框」；信号橙与强调色（`mark`、添加软件选中行、排序按钮、`.warning`、`.dialog-error`、`.software-remove-button`）；已定 3；取舍 5、6、7、8、9。

- [ ] **Step 1：警示色。** `.warning` 都直接落在光晕背景上（概览 App.tsx:519、设置 App.tsx:611、软件 SoftwarePage.tsx:140–141、后台 BackgroundPage.tsx:125/137、统计 StatisticsPage.tsx:168、成就 AchievementsPage.tsx:54/66，都在 `main` 下、面板外），所以用不透明底（取舍 23）：`background: linear-gradient(var(--alert-wash), var(--alert-wash)), var(--glass-solid); color: var(--alert-ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--alert-ink) 35%, transparent);`。`.dialog-error` → `--alert-ink`（对话框是不透明的 `--glass-solid`）。`.software-remove-button` → `background: var(--alert-wash); color: var(--alert-ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--alert-ink) 45%, transparent);`。
- [ ] **Step 2：软件页。**
  - 行分隔线已在任务 5 改成 `--rule`。
  - `.focused-table-head`（1205，吸顶）→ `background: var(--glass-solid)`（取舍 6）；任务 5 补画面板边线的 `box-shadow` 保留（取舍 11）。**用户已确认（2026-11-23，看过对比图）：决策 E-B**，底色改为 `var(--head-solid)`（浅色等于 `--glass-solid`，深色 `#212027`，见取舍 6）。
  - `.software-panel.is-editing .text-action`（1161–1165）→ `background: var(--on); --muted: var(--ink-2); color: var(--ink); box-shadow: inset 0 0 0 1px var(--edge-strong);`。
  - 搜索框 `.discovered-search, .add-software-search`（1276–1298）：`background: var(--chip); --muted: var(--ink-2);`，`box-shadow: inset 0 0 0 1px var(--edge)`；`:focus-visible` 只用 `var(--focus)`；占位符改 `--ink-2`（`--chip` 底上的字，规格对比度表）。**用户已确认（2026-11-23，看过对比图）：决策 D-A**，添加软件对话框的 `.add-software-search` 改用 `inset 0 0 0 1px var(--edge-strong)`，焦点时 `inset 0 0 0 1px var(--edge-strong), var(--focus)`；`.discovered-search` 不变（见取舍 11）。
  - `mark`（1335–1340）按取舍 8。
  - `.active-help-button` → `background: var(--glass-2); color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--edge-strong);`；`.active-help-popover` → `background: var(--glass-solid)`，描边 `--edge-strong`，投影 `0 12px 30px -8px var(--shade-deep)` 保留（1403，取舍 24 白名单）。
- [ ] **Step 3：对话框。** `.dialog, .add-software-dialog`：`background: var(--glass-solid)`，`box-shadow: 0 0 0 1px var(--edge-strong), 0 24px 60px -16px rgba(0, 0, 0, 0.5)`（去掉 `--highlight`），圆角已是 16px。`.add-software-close:hover`、`.add-software-row:hover` → `background: var(--chip); --muted: var(--ink-2);`（行内的路径小字原为 `--muted`，取舍 26）；`.add-software-row.is-selected` → `background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 -1px var(--accent);`；分隔线已在任务 5 改。`.modal-backdrop` 的 `blur(2px)` 不动。**用户已确认（2026-11-23，看过对比图）：决策 D-A**，对话框次要按钮 `:is(.dialog, .add-software-dialog) .button:not(.button-primary)`（「取消」「退出软件」）加 `inset 0 0 0 1px var(--edge-strong)`，焦点时叠 `var(--focus)`，底色仍是 `--glass-2`（见取舍 11）。
- [ ] **Step 4：后台页。** `.background-table th`（1923，吸顶）→ `--glass-solid`（决策 E-B 后改为 `--head-solid`，见取舍 6），`th:first-child` / `th:last-child` 补画边线的 `box-shadow` 保留（取舍 11）；`td` 下边线已在任务 5 改；`.sort-button:focus-visible` 的 `outline` → `2px solid var(--accent)`；`.sort-button.is-active .sort-icon` → `color: var(--accent)`（图标是图形，3:1 即可）。`.status-badge.tray .lamp` 不动（此刻类）。
- [ ] **Step 5：检查**：`npm.cmd run check`。
- [ ] **Step 6：视觉检查**：软件、后台两页 × 两主题 × 两尺寸，加 `&page=software&dialog=add`（两主题）和 `&glass=off`。重点看：吸顶表头滚动时不透字（用 `probe.mjs shot --eval` 把 `.discovered-scroll`、`.software-table-scroll` 和后台表滚动 200px 后截图）；吸顶表头那一行的面板左右边线连续（`--scale 2` 深色截图，放大看表头行和上下行的边线列）；移除按钮、警示条的红色在两主题都清楚。
- [ ] **Step 7：审查关口。** 本任务涉及的 `var(--signal` 全部移走；`rg "var\(--signal" src/styles.css` 剩下的只在灯、托盘环、`lamp-breathe`、开关（任务 7 再改）上。

提交：`feat(ui): restyle the software and background pages and dialogs for glass`

---

## 任务 7：开关与分段选择器

**文件：** `src/styles.css`（设置行 1622–1677、`.toggle` 1679–1735、`.segmented` 1737–1770）

**对应规格：** 迁移表「开关」「分段选择器」（统计、成就也用同一组类）；信号橙与强调色（开关开启态）；已定 4；取舍 9。

- [ ] **Step 1：开关。** `.toggle`：`background: var(--chip); box-shadow: inset 0 0 0 1px var(--muted);`（无文字，在 contrast.test「chip 改指」规则的白名单里，轮廓保持 `--muted`）；`.toggle.is-on`：`background: var(--accent); box-shadow: none;`；`.toggle-knob`：`background: #fff; box-shadow: 0 1px 3px var(--shade-deep);`（白色圆钮 + 柔和投影）。删除 `.toggle::before`、`.toggle.is-on::before` 两处（1692–1708、1728–1730）和 1721–1723 的空行。位移动画 `transform 200ms` 保留。
- [ ] **Step 2：分段选择器。** `.segmented`：`background: var(--chip); --muted: var(--ink-2);`，删内阴影；`.segmented-option` 文字 `--muted` → `--ink-2`（`--chip` 底，规格对比度表）；`:hover` → `--ink`；`.is-selected`：`background: var(--on); --muted: var(--ink-2); color: var(--ink); box-shadow: inset 0 0 0 1px var(--edge);`（`.segmented-option.is-selected` 原来的 `0 1px 2px var(--shade)` 去掉）。
- [ ] **Step 3：设置行。** `.settings-row` 分隔线已在任务 5 改；`.settings-row-icon` → `background: var(--chip); --muted: var(--ink-2);`，删内阴影（文字 `--ink-2` 不变）。
- [ ] **Step 4：检查**：`npm.cmd run check`（`App.test` 的主题单选、开关测试不受影响）。
- [ ] **Step 5：视觉检查**：设置、统计、成就三页 × 两主题 × 1440×900；对照 `style-sketch.html?style=glass` 的控件。`probe.mjs shot --media forced-colors=active` 看设置页：开关开启态、分段选中项、焦点环都看得见。
- [ ] **Step 6：审查关口。**

**开关将重做（2026-11-23，用户要求，方案待定）：** 用户看过 Step 1 的扁平开关后，要求所有开关（设置页，以及统计页「包含隐藏软件」、成就页等所有 `.toggle` / `.toggle-knob`）改成有立体感的样子，像真的在拨动滑块。这会取代 Step 1 的扁平做法（`--chip` 轨道 + `--muted` 轮廓、`--accent` 开启态、白色圆钮 + `0 1px 3px` 投影）。用户 2026-11-23 回复第二轮对比图时选了 F-B（原话「da eb fb」，紧接着提出立体要求），F-B 是两条对比度线索：浅色开启态轨道加一圈更深的强调色边（`inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, var(--ink))`），深色开启态圆钮加一圈细的深色环（`0 0 0 1px rgba(0, 0, 0, 0.35)`）。新方案仍须满足这两条线索要解决的问题：开启态轨道对背景 ≥ 3:1、深色开启态圆钮对轨道 ≥ 3:1；F-B 的写法能否原样保留，要看立体方案的画法，选定方案时一并请用户确认。具体样子要等用户从另行做的几种立体样稿里选定后再写进本计划；在那之前不改 `.toggle` / `.toggle-knob`，glassSurfaces.test 里任务 7 的开关断言在重做时随新方案一起改（需用户选定方案）。

提交：`feat(ui): restyle switches and segmented controls with the accent colour`

---

## 任务 8：统计页（记录仪以外）

**文件：** `src/components/StatisticsPage.css`（1–230、386–768）

**对应规格：** 迁移表「分段选择器 … 统计/成就的同类控件」；信号橙与强调色（`.stats-range-error`）；对比度目标；取舍 5、9、23、26。走纸记录仪本体（231–384）留给任务 14。

- [ ] **Step 1：区间工具条（直接画在光晕背景上，取舍 23）。** `.stats-range`（StatisticsPage.tsx:95 起）不在任何面板里，逐个处理其中的元素：
  - `.segmented` 及选项：任务 7 已改（`--chip` 轨道 + `--ink-2` 未选项，`over(--chip, B)` 上 7.05 / 6.26）。
  - `.stats-custom-range`（「至」，56 行）、`.stats-range-caption`（82 行）、`.stats-hidden-toggle`（「包含隐藏软件」，102 行）：`color: var(--muted)` → `var(--ink-2)`。
  - `.stats-date` → `background: var(--chip); --muted: var(--ink-2); box-shadow: inset 0 0 0 1px var(--edge);`，`:focus-visible` 只用 `var(--focus)`。
  - `.stats-range-error` → `color: var(--alert-ink); background: linear-gradient(var(--alert-wash), var(--alert-wash)), var(--glass-solid); padding: 2px 8px; border-radius: var(--radius-tag);`。
  - 同一页面外的 `.warning`（StatisticsPage.tsx:168）已在任务 6 改；读取提示 `main > .empty-state` 已在任务 5 改。
- [ ] **Step 2：** `.stats-note` → `background: var(--chip); --muted: var(--ink-2);`，删内阴影；`.stats-note small` → `--ink-2`（`--chip` 底）。
- [ ] **Step 3：台账。** 行分隔线已在任务 5 改成 `--rule`；`.stats-row:not(.stats-head):hover`（460，现为 `--ink` 4% 色调，深色下同样压低行内 `--muted`）→ `background: var(--chip); --muted: var(--ink-2);`，和其他行悬停一致；`.stats-head` 去掉 `background`；`.rank-new` → `color: var(--glass-solid)`；`.idle-bar` → `background: var(--chip)`，删内阴影；`.rhythm-track` → `background-color: var(--chip)`，刻度渐变保留 `--edge-strong`，删内阴影。
- [ ] **Step 4：** `.trend-tip` → `background: var(--glass-solid); box-shadow: 0 0 0 1px var(--edge-strong), 0 4px 10px var(--shade);`（去掉 `--highlight`；`--shade` 投影按取舍 24 保留）。
- [ ] **Step 5：检查**：`npm.cmd run check`（`StatisticsPage.test` 不改）。
- [ ] **Step 6：视觉检查**：统计页 × 两主题 × 两尺寸，加 `&empty`、`&format=hm`；用 `--eval` 点「自定义」并输入一个结束早于开始的区间，看错误字色。
- [ ] **Step 7：审查关口。**

提交：`feat(ui): restyle the statistics ledgers and range bar for glass`

---

## 任务 9：成就页（热力图以外）与里程碑铭牌

**文件：** `src/components/AchievementsPage.css`（35–53、334–822）、`src/components/MilestoneShelf.tsx`、`src/__tests__/AchievementsPage.test.tsx`（新增用例）

**对应规格：** 迁移表「里程碑铭牌」「刻字效果」；已定 2；取舍 1、5、7。热力图（55–332）留给任务 13。

- [ ] **Step 1：写失败测试**（`AchievementsPage.test.tsx` 新增）：已点亮的铭牌里没有 `.ach-screw`（`container.querySelectorAll(".ach-screw")` 长度为 0）。
- [ ] **Step 2：确认失败**，再删 `MilestoneShelf.tsx` 147–154 的四颗螺钉（`reached ? (<>…</>) : null` 整块）。
- [ ] **Step 3：样式。**
  - `.ach-readout-head h2`（48）、`.ach-plate-tier b`（555）、`.ach-plate-rule.is-titled`（601）的 `text-shadow` 删除。
  - `.ach-scope-rule`、`.ach-plate-rule`、`.ach-plate-rule.is-titled::before/::after` 的 `--highlight` 阴影删除；`.ach-record + .ach-record` 的 `--highlight` 阴影删除（边线已在任务 5 改成 `--rule`）。
  - `.ach-plate.is-reached` → `background: var(--glass-2); box-shadow: inset 0 0 0 1px var(--edge);`（原来的两层 `--shade` 投影去掉，口径表「投影颜色」）；`.ach-plate.is-slot` → `background: transparent; box-shadow: none; border: 1px dashed var(--edge-strong);`（取舍 7），文字 `--muted`；`.ach-plate.is-slot .ach-plate-tier b` 的 `--faint` → `--muted`（575）；`.ach-plate.is-reached.is-ultimate` → `box-shadow: inset 0 0 0 1.5px var(--accent);`，注释改为「终极成就：达成后才换成强调色描边。」。
  - 删除 `.ach-screw` 全部规则（518–541）。
  - `.ach-coming-names i` 的 `--faint` → `--muted`（782）。
- [ ] **Step 4：通过测试**，`npm.cmd run check`。
- [ ] **Step 5：视觉检查**：成就页 × 两主题 × 两尺寸，加 `&empty`；点亮、未点亮、6666 已达成三种铭牌都要看到（示例数据里有；没有就在报告里说明）。
- [ ] **Step 6：审查关口。** 已定 2 的 `--accent` 描边；没有残留的 `--knob-*`、`--highlight`。

提交：`feat(ui): restyle achievement records, milestone plates and comings for glass`

---

## 任务 10：墨水屏配方（概览读数、设置屏）

**文件：** `src/styles.css`（572–737、1592–1610、1780–1811、forced-colors 块）、`src/components/AchievementsPage.css`（60 行的字号 token）

**对应规格：** 墨水屏配方表（纸面、颗粒、哑光、内凹边、发光、文字、像素字、屏上图标）；迁移表「今日读数」「设置页」；Token 架构（`--pixel-display-size`）；取舍 16、17。

- [ ] **Step 1：拆分 `.lcd` 规则**：布局部分（`display: grid`、列、`gap`、`min-height`、`padding`）留在 `.lcd`；屏面部分写成独立规则，任务 14 再把 `.paper` 加进同一选择器：

```css
/* E-ink screen: matte paper, printed ink, no glow. */
.lcd {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-screen);
  background: var(--eink-paper);
  color: var(--eink-ink);
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.28),
    inset 0 0 0 1px rgba(0, 0, 0, 0.1),
    0 1px 0 var(--glass-hi);
}

.lcd::before { /* grain */
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: url("data:image/svg+xml,…feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'…feColorMatrix alpha .55…220×220…");
  opacity: var(--eink-grain);
  mix-blend-mode: var(--eink-grain-blend);
}

.lcd::after { /* matte */
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 30%, rgba(0, 0, 0, 0.015));
}
```

  噪点 SVG 按样稿数值自己写（`width='220' height='220'`、`feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'`、`feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'`），URL 里的 `#` 写成 `%23`。`font-family: var(--font-pixel)` 留在 `.lcd`。
- [ ] **Step 2：删液晶专用规则**：`text-shadow: var(--lcd-glow)`（607）、深色 `.lcd` 背景（614–618）、点阵 `::before`（621–630）、168° 反光 `::after` 与深色版（632–642）、`text-shadow: none` 覆盖（656–660）、深色图标滤镜（734–737）。
- [ ] **Step 3：文字与图标。** `.lcd-label`、`.lcd-note` → `--eink-dim`；`.lcd-key`、`.lcd-key-active` → `--eink-ink`；`.lcd-most .software-icon` 规则换成 `.lcd img { filter: grayscale(0.55) saturate(0.7) contrast(1.05); }`（取舍 17）。1320px 以下 `.lcd-cell-most` 的虚线 → `color-mix(in srgb, var(--eink-dim) 45%, transparent)`。表盘和热力图里的 `--lcd-*` 本任务不动（任务 11、13）。
- [ ] **Step 4：像素字号改名。** `var(--lcd-display-size, 60px)`（693）→ `var(--pixel-display-size, 60px)`；1780–1785 的两条 `@media (resolution: …)` 改设 `--pixel-display-size`；`AchievementsPage.css:60` 的 `--lcd-display-size: 48px` → `--pixel-display-size: 48px`。
- [ ] **Step 5：设置屏**（1598–1610）只继承 `.lcd` 屏面，无残影；时钟标志按 Step 3 去色。
- [ ] **Step 6：检查**：`npm.cmd run check`（`App.test` 的 17 个 `is-lit`、`AchievementsPage.test` 的 `.lcd.ach-dial` 不受影响）。
- [ ] **Step 7：视觉检查**：概览、设置、成就 × 两主题 × 两尺寸；对照 `overview-glass.html?screen=eink`：纸色、颗粒强度（浅色几乎看不见、深色明显）、内凹边、无发光、图标半去色。`probe.mjs shot --scale 1.25` 和 `--scale 1.5` 截概览，放大 `.lcd-value b` 看像素字边缘是否清晰（验收 9 的预览近似）。
- [ ] **Step 8：审查关口。** 墨水屏配方表逐行；`rg "text-shadow" src/styles.css` 不再有液晶相关的。

提交：`feat(ui): replace the LCD recipe with an e-ink screen`

---

## 任务 11：表盘刻线与墨色

**文件：** `src/components/LcdDial.tsx`、`src/styles.css`（746–797、1993–1995）、`src/__tests__/LcdDial.test.tsx`（新建）

**对应规格：** 表盘墨色规则（含已定 1）；墨水屏配方「发光：无」；取舍 2、3。

- [ ] **Step 1：写失败测试**（`LcdDial.test.tsx`，`render(<LcdDial recordedSeconds={…} activeSeconds={…} now={new Date(2026, 10, 21, 12, 0, 0)} />)`）：
  - `.lcd-tick` 共 96 个，其中 `.is-hour` 24 个。
  - 12:00 时 `.lcd-tick.is-past` 48 个、`.lcd-tick.is-hour.is-past` 12 个；`new Date(2026, 10, 21, 0, 0, 30)` 时 0 个（分钟取整为 0，`0 × 15 < 0` 不成立）；`00:15:00` 时 1 个；`23:59` 时 96 个。
  - 容量环不变：`recordedSeconds = 8 * 3600 + 47 * 60` 时 `.lcd-ring-recorded path.is-lit` 17 个；两圈各 48 段。
  - `figure` 的无障碍名仍是 `满圈 24 小时，今日已过 12:00`；刻线组在 `svg`（`aria-hidden`）里。
  - 刻线画在指针之前（`.lcd-dial-now` 是 `svg` 的最后一个子元素），保证指针压在刻线上。
- [ ] **Step 2：确认失败**：`npx.cmd vitest run src/__tests__/LcdDial.test.tsx`。
- [ ] **Step 3：实现。**

```tsx
const TICKS = 96;
const TICK_INNER = 81;
const TICK_OUTER = 89;
const TICK_OUTER_HOUR = 91;

/** 96 quarter-hour ticks outside the rings; the hour ones are longer. Ticks before now are inked. */
function Ticks({ minutesToday }: { minutesToday: number }) {
  // minutesToday is the existing whole-minute value (LcdDial.tsx:58: getHours() * 60 + getMinutes(), seconds dropped)
  // i * 15 < minutesToday → "is-past"; i % 4 === 0 → "is-hour"
  // <line className="lcd-tick …" x1 y1 x2 y2 /> from point(TICK_INNER, deg) to point(outer, deg)
}
```

  插在 `<rect className="lcd-midnight-mark" …/>` 之后、指针 `<path className="lcd-dial-now" …/>` 之前；`SIZE`、两圈半径、指针几何、午夜标记、`6h/12h/18h` 文字都不变。文件注释改为「一块墨水屏容量表盘：满圈 24 小时，每段半小时；环外 96 条刻线和指针标出今天已过的时间」。
- [ ] **Step 4：样式**（替换 746–797 的液晶墨色，删除 759–765 的深色覆盖和绿色 `drop-shadow`）：

```css
.lcd-ring path { fill: var(--eink-track); transition: fill 300ms steps(2); }
.lcd-ring-recorded path.is-lit { fill: var(--eink-ink); }
.lcd-ring-active path.is-lit { fill: var(--eink-mid); }
.lcd-tick { stroke: var(--eink-track); stroke-width: 2; stroke-linecap: butt; }
.lcd-tick.is-hour { stroke-width: 3.4; }
.lcd-tick.is-past { stroke: var(--eink-mid); }
.lcd-tick.is-hour.is-past { stroke: var(--eink-ink); }
.lcd-dial-hour { fill: var(--eink-dim); }
.lcd-dial-now { fill: var(--eink-ink); stroke: var(--eink-paper-solid); stroke-width: 1.5; paint-order: stroke; }
.lcd-midnight-mark { fill: var(--eink-ink); }
.lcd-dial-clock span { color: var(--eink-dim); }
```

- [ ] **Step 5：通过测试**，`npm.cmd run check`。
- [ ] **Step 6：视觉检查**：概览 × 两主题 × 1440×900（1180×760 下表盘跨两行，也截一张）；对照 `overview-glass.html` 的表盘：实墨整点、灰墨刻线、淡轨、指针与刻线的分隔（取舍 3，不满意就停下找用户）。`--scale 1.5` 截一张看刻线不糊。
- [ ] **Step 7：审查关口。** 表盘墨色规则表逐行；App.test 的 17 个 `is-lit` 仍通过。

提交：`feat(ui): ink the overview dial with elapsed-time ticks`

---

## 任务 12：读数残影

**文件：** `src/components/TodayReadout.tsx`、`src/styles.css`（`.lcd-value` 681–701、forced-colors 块）、`src/__tests__/TodayReadout.test.tsx`（新增用例）、`src/__tests__/fallbacks.test.ts`（新增断言）、`scripts/ui-preview/tauri-core.ts`（`?tick`）、`scripts/ui-preview/vite.config.ts`（注释）、`scripts/ui-preview/probe.mjs`（`layout` 的残影对齐检查）

**对应规格：** 墨水屏配方「残影」；回退表 forced-colors 行（残影去掉）；已知限制（只记得本窗口的上一次值）；取舍 14。

- [ ] **Step 1：写失败测试**（`TodayReadout.test.tsx` 新增）：
  - 首次渲染没有 `.lcd-ghost`。
  - `rerender` 同样的秒数（或秒数变了但显示仍是 `4.0`）→ 仍没有。
  - 今日记录从 `4 * 3600` 变到 `4.1 * 3600` → 「今日记录」那格出现一个 `.lcd-ghost`，`aria-hidden="true"`，结构与主读数相同：里面一个 `span`，含 `b[data-text="4.0"]` 和 `small[data-text="小时"]`，`b`、`small` 的 `textContent` 都是空串；主读数显示 `4.1`。今日活跃没变，那格没有残影。
  - 再变到 `4.2 * 3600` → 残影的 `b` 是 `data-text="4.1"`（只保留上一次）。
  - `hours_minutes` 下从 `1小时30分钟` 变到 `1小时31分钟` → 残影有两组 `b` / `small`，`data-text` 依次是 `1`、`小时`、`30`、`分钟`。
  - `durationFormat` 从 `decimal_hours` 换成 `hours_minutes` → 两格残影都消失。
  - `screen.getByText("4.1")` 只找到一个元素，`screen.queryAllByText("4.0")` 为空（残影不产生文本节点），保证现有 `getByText` 断言不受影响。
  - `fallbacks.test.ts` 新增：`@media (forced-colors: active)` 里 `.lcd-ghost` 为 `display: none`。
- [ ] **Step 2：确认失败**：`npx.cmd vitest run src/__tests__/TodayReadout.test.tsx src/__tests__/fallbacks.test.ts`。
- [ ] **Step 3：实现。**
  - 小 hook（写在 `TodayReadout.tsx` 里）：`usePreviousShown(seconds: number, format: DurationFormat): DurationPart[] | null`，用格式化后的文字（`formatDurationZh(seconds, format)`）判断「显示变没变」，记住上一次不同时的 `formatDurationPartsZh(seconds, format)` 结果（存 parts，不只存字符串）；`format` 变化时返回 `null` 并重新开始。用 `useState` 在渲染期比较（React 文档的「存储上一次 props」写法），StrictMode 下不重复记。
  - `LcdValue` 接收 `ghost: DurationPart[] | null`：有值时在 `.lcd-value` 里先渲染

```tsx
<span className="lcd-value lcd-ghost" aria-hidden="true">
  {ghost.map((part) => (
    <span key={part.unit}>
      <b data-text={part.value} />
      <small data-text={part.unit} />
    </span>
  ))}
</span>
```

    和主读数用同一套 `.lcd-value` / `b` / `small` 规则（字号、单位字号、`margin-left: 4px`、基线、`gap: 0 6px`、换行全部一致）；用 `span` 而不是 `p`，避免 `p` 套 `p`。
- [ ] **Step 4：样式。** `.lcd-value { position: relative; }`；

```css
.lcd-value.lcd-ghost {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 100%;
  min-height: 0;
  margin: 0;
  z-index: 0;
  color: var(--eink-ghost);
  pointer-events: none;
}

.lcd-ghost b::before,
.lcd-ghost small::before {
  content: attr(data-text);
}

.lcd-value > span:not(.lcd-ghost) {
  position: relative;
  z-index: 1;
}
```

  绝对定位的残影不参与主读数的 flex 排布；`width: 100%` 让它和主读数在同一宽度下换行（`format=hm` 也不会伸进相邻格）。forced-colors 块加 `.lcd-ghost { display: none; }`。不加任何过渡。
- [ ] **Step 5：预览触发器。** 示例数据的今日读数只在 `dayScale()` 跨过 0.1 小时时才变（约 7 分钟一次，11:42 之后不再变），等一次轮询几乎看不到残影。在 `scripts/ui-preview/tauri-core.ts` 加只在预览里生效的 `?tick`：`get_dashboard_summary` 每调用一次，`recorded_today_seconds` 和 `active_today_seconds` 各加 `callCount × 360` 秒（每次轮询显示值至少变 0.1 小时 / 6 分钟）；`?empty` 时不加。`scripts/ui-preview/vite.config.ts` 的注释和 README 开发小节（任务 19）记上 `?tick`。
- [ ] **Step 6：通过测试**，`npm.cmd run check`（`App.test` 的 `8.8`、`0.5` 断言在首次渲染，没有残影）。
- [ ] **Step 7：视觉检查**：`probe.mjs shot --url "$base/?theme=<t>&tick" --time 22:01 --eval "new Promise(r => setTimeout(r, 6000))"` 截概览两主题，`--url "$base/?theme=<t>&tick&format=hm"` 再截两张，1180×760 再各截一张；残影在浅色几乎看不见、深色隐约可见，偏移 2px，不影响主读数清晰度，`hm` 下不伸进相邻格。再跑 `probe.mjs layout` 同样的 URL 和 `--eval`：每格第一个 `.lcd-ghost b` 的 `left`、`top` 恰好等于同格第一个主读数 `b` 的 `left + 2`、`top + 2`，`.lcd-ghost small` 的高度等于主读数 `small` 的高度；把这条写成 `layout` 的自动检查（不满足时退出码 4）。
- [ ] **Step 8：审查关口。** 残影只在概览两格；设置页、成就页没有；`?tick` 只在 `scripts/ui-preview/` 里，不进 `src`。

提交：`feat(ui): leave an e-ink ghost of the previous readout`

---

## 任务 13：成就热力图上墨

**文件：** `src/components/AchievementsPage.css`（1、55–332）

**对应规格：** 迁移表「成就热力图」；墨水屏配方「文字」「发光：无」。

- [ ] **Step 1：** 文件头注释改为：`/* 成就页：日历刻度盘。只用 styles.css 里已有的令牌；点阵格子只出现在墨水屏里。 */`。
- [ ] **Step 2：** `--ach-rule` → `2px dotted color-mix(in srgb, var(--eink-ink) 22%, transparent)`；`.ach-cell.l0`（9% 底、20% 描边）、`.l1`（44%）、`.l2`（70%）、`.l3`（100%）、`.is-future`（42% 虚线）、`.is-norecord::after`（34%）、`.is-today`（描边）全部把 `--lcd-ink` 换成 `--eink-ink`，百分比不变。
- [ ] **Step 3：** `.ach-weekday`、`.ach-dial-stat small`、`.ach-legend` 的 `--lcd-dim` → `--eink-dim`；删掉这三处的 `text-shadow: none`（171、295、321）；删除深色覆盖 236–243（l0 的 7% / 14% 和 l3 的发光），两套主题共用同一组分级。
- [ ] **Step 4：检查**：`npm.cmd run check`（`AchievementsPage.test` 不改）。
- [ ] **Step 5：视觉检查**：成就页 × 两主题 × 两尺寸；用 `--eval` 依次点「近半年」「近一年」（紧凑格子），确认 4 级墨色在深色渐变纸面三个位置都分得清，今日描边可见，`&empty` 时的无记录点不像空缺。
- [ ] **Step 6：审查关口。** `rg -- "--lcd-" src/components/AchievementsPage.css` 为 0。

提交：`feat(ui): print the achievements heatmap in e-ink`

---

## 任务 14：走纸记录仪的墨水屏纸面

**文件：** `src/styles.css`（墨水屏屏面选择器、forced-colors 块）、`src/components/StatisticsPage.css`（231–384）、`src/__tests__/fallbacks.test.ts`（新增断言）

**对应规格：** 迁移表「走纸记录仪」；墨水屏配方（纸面、颗粒、内凹边）；信号橙（`.pen-lamp` 保留）；取舍 15。

- [ ] **Step 1：纸面。** 把任务 10 的屏面三条规则（`.lcd`、`.lcd::before`、`.lcd::after` 的屏面部分）的选择器扩成 `.lcd, .paper`、`.lcd::before, .paper::before`、`.lcd::after, .paper::after`；`.paper` 原来的 `background: var(--panel-raised)` 和四条 `--shade-deep` 内阴影删除。`.paper > .recorder-svg { position: relative; z-index: 1; }`，保证 SVG 和悬停在颗粒、哑光层之上。forced-colors 块两处都扩上 `.paper`：`background: Canvas; color: CanvasText` 那条规则的选择器列表加 `.paper`（深色纸面是 `background-image` 渐变，不显式重置就会留在对比度主题里；任务 5 起 forced-colors 块里 Canvas / CanvasText、`border: 1px solid CanvasText`（侧栏、`.lcd`、对话框）、面板 `outline` 是三条分开的规则）；描边只在内容允许移 1px 时才把 `.paper` 加进 `border` 那条，否则按任务 10 对 `.lcd` 的处理改用内收 `outline`，`.lcd::before, .lcd::after` 扩成 `.lcd::before, .lcd::after, .paper::before, .paper::after { display: none; }`。先在 `fallbacks.test.ts` 加两条断言（`.paper` 在 forced-colors 的 Canvas 规则里且 `background` 为 `Canvas`；`.paper::before`、`.paper::after` 为 `display: none`），确认失败，再改 CSS。
- [ ] **Step 2：槽和滚轴。** `.recorder`：删 `background` 和 `box-shadow`，`margin`、`padding`、三列网格不变；注释改为 `/* recorder: two thin rollers and an e-ink paper strip */`。`.roller`：`justify-self: center; width: 3px; border-radius: 2px; background: var(--eink-mid); box-shadow: none;`。
- [ ] **Step 3：纸上墨色**（只改颜色，字体不变）：

| 选择器 | 新值 |
| --- | --- |
| `.rule-major` / `.rule-day` | `stroke: var(--eink-track)` |
| `.rule-minor` | `stroke: var(--eink-track)`，`opacity: 0.7` 保留 |
| `.rule-tick`、`.avg`、`.avg-mark`、`.gap` | `--eink-mid`（`.gap` 的 70% `color-mix` 改基于 `--eink-mid`） |
| `.scale`、`.day`、`.vals-dim` | `fill: var(--eink-dim)` |
| `.vals-strong`、`.needle-act`、`.pen` | `fill: var(--eink-ink)` |
| `.needle-rec` | `color-mix(in srgb, var(--eink-ink) 16%, transparent)` |
| `.needle-cap`、`.trace`、`.trace-label` | `--eink-dim` |
| `.trace-dot` | `fill: var(--eink-paper-solid); stroke: var(--eink-dim)` |
| `.hover-band` | `color-mix(in srgb, var(--eink-ink) 10%, transparent)` |
| `.pen-arm` | `stroke: var(--eink-mid)` |
| `.pen-lamp` | 不变（信号橙，正在记录） |

  面板头部的图例 `.key-*`（在玻璃上）不改。
- [ ] **Step 4：检查**：`npm.cmd run check`（`StatisticsPage.test` 不改）。
- [ ] **Step 5：视觉检查**：统计页 × 两主题 × 两尺寸，加 `&format=hm`；用 `--eval` 切「近 7 天」「今年」两种密度，悬停卡（`--eval` 派发一次 `mousemove`）在纸面上可读；深色渐变纸面上针柱、描线、均值虚线都分得清。
- [ ] **Step 6：审查关口。** `rg -- "--knob-|--panel-raised|--panel-sunken|--highlight" src/components/StatisticsPage.css` 为 0。

提交：`feat(ui): print the statistics recorder on e-ink paper`

---

## 任务 15：删除旧 token，测试兜底

**文件：** `src/styles.css`（token 块、文件头 1–6）、`index.html`（7、16–27 行注释）、`src/__tests__/designTokens.test.ts`（新建）

**对应规格：** Token 架构（删除列）；验收 1、2；动效；字体（像素字只在屏内）；「文档与发布」里的代码注释。

- [ ] **Step 1：写失败测试** `designTokens.test.ts`（模式字符串全部拼接，见约束 6）：
  - 旧 token 不再出现：对 `src/` 下全部 `.css`、`.ts`、`.tsx`（用 `import.meta.glob("../**/*.{css,ts,tsx}", { query: "?raw", import: "default", eager: true })`，排除本测试文件自身）匹配 `--lcd-`、`--knob-`、`--case\b`、`--radius-case`、`--panel-raised`、`--panel-sunken`、`var\(--panel[,)]`、`--highlight\b`，结果为空。
  - 模糊：带 `backdrop-filter` 的规则选择器集合（同任务 5）。
  - 信号橙：引用 `var(--signal` 的规则选择器都在允许集合里：`.lamp.is-lit`、`.status-badge.running .lamp`、`@keyframes lamp-breathe`、`.status-badge.tray .lamp`、`.pen-lamp`（以及 `:root` token 块本身不引用它）。
  - 动效：全部 `@keyframes` 名字恰好是 `lamp-breathe`、`backdrop-in`、`dialog-in`。
  - 像素字：使用 `var(--font-pixel)` 的规则选择器都以 `.lcd` 开头。
  - 深色选择器：除 token 块和取舍 1 那一条外，没有 `:root[data-theme="dark"] .x` 形式的规则（`:root[data-theme="light"] .software-icon:has(…)` 的图标底座是浅色规则，允许）。
  - `--faint` 只用于图形：没有任何规则的 `color` 声明引用 `var(--faint)`（原来的文字用法 styles.css:287、300、399，AchievementsPage.css:575、782 已改 `--muted`）；SVG 文字类（见下一条的列表）的 `fill` 也不引用它。
  - `--eink-mid` 只用于图形：没有任何 `color` 声明引用 `var(--eink-mid)`；引用它的 `fill` 声明，其选择器不含 SVG 文字类。文字类列表取自组件里 `<text className=…>` 的类名：`TrendRecorder.tsx` 的 `.scale`、`.vals`、`.vals-dim`、`.vals-strong`、`.day`、`.trace-label`，`LcdDial.tsx` 的 `.lcd-dial-hour`；另加屏上的 HTML 文字类 `.lcd-label`、`.lcd-note`、`.lcd-value`、`.lcd-dial-clock`、`.ach-weekday`、`.ach-legend`、`.ach-dial-stat`。测试里把这张列表和两个组件源码（`?raw`）里出现的 `<text` 类名对一遍，组件新增文字类时测试会提醒补表。
  - 投影颜色：引用 `var(--shade` 的规则，选择器都在白名单里：`.skip-link`、`.toggle-knob`、`.unavailable-tooltip-bubble`、`.active-help-popover`、`.trend-tip`（口径表「投影颜色」、取舍 24），token 块本身除外。
- [ ] **Step 2：确认失败**（旧 token 定义还在）：`npx.cmd vitest run src/__tests__/designTokens.test.ts`。
- [ ] **Step 3：删除** 两个 token 块里的 `--knob-top/-middle/-base`、`--case`、`--panel`、`--panel-raised`、`--panel-sunken`、`--highlight`、`--lcd`、`--lcd-deep`、`--lcd-ink`、`--lcd-dim`、`--lcd-ghost`、`--lcd-glow`、`--lcd-grid`、`--radius-case`。保留 `--faint`（只作图形）、`--shade`、`--shade-deep`、`--signal*`、`--lamp-off`、`--modal-scrim`、`--icon-well`、`--font-*`、`--type-*`、`--panel-gutter`、`--panel-gap`。任何残留引用都按前面任务的映射补完（测试会指出位置）：`--panel-raised` / `--panel-sunken` 作底色的改 `--glass-2` / `--chip`（改成 `--chip` 的同时写 `--muted: var(--ink-2)`，contrast.test 的守卫会检查），作字色的改 `--glass-solid`；不在白名单里的 `--shade` 投影删掉。
- [ ] **Step 4：注释。** `src/styles.css` 文件头改为：

```css
/*
 * GST glass instrument.
 * One world: a Mica-like glass shell (light or dark) floating over a soft glow, with
 * matte e-ink screens set into it for today's readings. Glass is light and see-through;
 * e-ink is quiet and does not glow. Signal orange is reserved for what is happening now;
 * the accent colour marks selection and focus.
 */
```

  `index.html` 第 7 行预加载注释的「LCD pixel font」改为「e-ink screen pixel font」；16–27 行 THESIS / OWN-WORLD / FIRST VIEWPORT 改写为玻璃 + 墨水屏的描述（「distribution colours quarantined in one bordered plate」删掉，改为「mix colours identify software」；FIRST VIEWPORT 的「full-width LCD」改为「full-width e-ink screen」）。`fontPreload.test` 只看 `<link>`，不受影响。
- [ ] **Step 5：通过测试**，`npm.cmd run check`；再手工跑一遍规格原文的两条命令，结果与测试一致：

```powershell
rg -- "--lcd-|--knob-|--case\b|--radius-case|--panel-raised|--panel-sunken|var\(--panel[,)]|--highlight\b" src
rg "backdrop-filter" src
rg "var\(--signal" src
```

- [ ] **Step 6：视觉检查**：全套截图快速过一遍，确认删 token 没把任何东西变成透明或黑色。
- [ ] **Step 7：审查关口。**

提交：`refactor(ui): remove the instrument-case and LCD tokens`

---

## 任务 16：预览全量验收（视觉、对比度、模拟、帧率）

**文件：** 无新增；发现问题时在对应 CSS / 组件里修。

**对应规格：** 验收 4、5、7（预览近似）、9（预览近似）、11（预览部分）；性能验收第 1、4 行；对比度目标（复核）。

- [ ] **Step 1：截图矩阵（验收 4）。** 普通、`&empty`、`&format=hm` 三组，每组 6 页 × 两主题 × 两尺寸（1440×900、1180×760），共 72 张；另加 `&glass=off` 一组 6 页 × 两主题 × 1440×900，`&page=software&dialog=add` 两主题。全部用 `probe.mjs shot --time 22:01`（与任务 1 基线同一虚拟时刻；顺带收控制台错误，退出码必须为 0）。逐页对照样稿和基线，在会话里列出差异。
- [ ] **Step 2：布局（验收 4「窄窗口无横向滚动」、「不改布局」）。** `probe.mjs layout --time 22:01`，普通、`&empty`、`&format=hm` 三组各 6 页 × 两主题 × 两尺寸：横向溢出全为 `false`（`hm` 读数更长、窄窗口最容易溢出，重点看）；与任务 1 基线比，`.sidebar`、`.panel`、`.readout`、`.software-panel` 外框完全一致，内容元素差 ≤ 1px（口径表「布局」，超出的逐个说明原因）。
- [ ] **Step 3：模拟。** `--media forced-colors=active`（两主题，6 页）：文字、焦点环（`--eval` 聚焦一个导航项和一个开关）都看得见（验收 7 预览近似）。`--media prefers-reduced-transparency=reduce`：面板不透明、光晕保留（若该 Edge 版本不支持这项模拟，报告并以 `?glass=off` 代替）。`--scale 1.25`、`--scale 1.5`：概览和成就页像素读数边缘清晰（验收 9 预览近似）。
- [ ] **Step 4：对比度（验收 5）。** `npx.cmd vitest run src/__tests__/contrast.test.ts` 的实算值抄进会话报告（只有数字），与规格表逐行对照；差异 > 0.2 的说明原因。
- [ ] **Step 5：帧率（性能验收第 1、4 行）。** `probe.mjs frames --headed --trace <scratch json> --size 1440x900`：软件页 `.discovered-scroll`、统计页 `.stats-page`；两主题；`--cpu 1` 和 `--cpu 4`；`?glass=off` 再各跑一遍。标准按 trace 的帧（合成器实际呈现的帧，`backdrop-filter` 的开销主要在这里）判断：`over50ms = 0`、`avgFps ≥ 55`；4× 降速 `avgFps ≥ 30`；rAF 结果和 `loafOver50ms` 一起列出作对照，两者不一致时以 trace 为准。挑一份 trace（浅色、统计页、1×）在 DevTools Performance 面板打开看一眼，确认 probe 的统计与面板显示一致（规格的原始方法）。同时列出任务 1 的 v0.3.1 基线。不达标时按规格：先在 `:root` 把 `--glass-filter` 设为 `none` 重测；仍不达标就停下找用户。
- [ ] **Step 6：** 结果（通过与否、帧率、对比度数字）记在 scratchpad 的验收笔记里，任务 19 写进 `docs/CURRENT_STATE.md`；不入库截图。
- [ ] **Step 7：** 有修复就跑 `npm.cmd run check`、走审查关口、按问题分别提交 `fix(ui): <具体问题>`；没有修复则本任务无提交。

---

## 任务 17：重拍 README 截图

**文件：** `docs/assets/ui-{overview,software,background,statistics,achievements,settings}-{light,dark}.png`（12 张，1440×900，与现有尺寸一致）

**对应规格：** 文档与发布「README.md … `docs/assets/` 下 12 张截图全部重拍」。

- [ ] **Step 1：** `node scripts/ui-preview/collect-demo-icons.mjs` 从本机 GST 图标缓存取示例软件图标到 `scripts/ui-preview/demo-icons/`（已被 gitignore，脚本以只读方式打开数据库，不入库）。
- [ ] **Step 2：** 重启本 worktree 的预览（`npm.cmd run preview:ui -- --port 1431 --strictPort`，按「视觉检查方法」确认 1431 是本 worktree 的服务），用 `probe.mjs shot --time 22:01 --size 1440x900` 截 12 张，`--out` 直接写到 `docs/assets/ui-<page>-<theme>.png`（`<page>` 为 overview / software / background / statistics / achievements / settings），覆盖同名文件。固定虚拟时间是为了读数、表盘指针和刻线在 12 张图里一致，不随截图时刻变化；不用 headless 命令（它不能固定时间，输出名也不同）。数据只来自 `mock-data.ts`。
- [ ] **Step 3：** 逐张看：没有真实软件时长或私人信息（示例数据）、没有控制台错误叠层、主题对。`git status` 只有这 12 张 PNG 变化。
- [ ] **Step 4：审查关口**，`npm.cmd run check`。

提交：`docs(readme): retake the screenshots for the glass and e-ink redesign`

---

## 任务 18：重写 DESIGN.md

**文件：** `DESIGN.md`

**对应规格：** 文档与发布「DESIGN.md 重写，顺序不变」第 1–9 项；mix 色；Don'ts。

- [ ] frontmatter：删除 `knob-*`、`case-*`、`panel-*`、`lcd-*` 颜色；加 `base`、`glass`、`glass-solid`、`glass-2`、`chip`、`on`、`side`、`edge`、`rule`、`accent`、`alert-ink`、`eink-paper`、`eink-ink`、`eink-dim`、`eink-mid`（两套主题各一份，值与 `styles.css` 一致）、`mix-1…7`；`rounded` 改为 `tag 4px`、`pill 999px`、`key 9px`、`screen 11px`、`panel 16px`、`dialog 16px`；typography 的 `lcd-display` / `lcd-text` 改名 `pixel-display` / `pixel-text`，加 `page-title` 的 Display 字体。
- [ ] Overview：北极星「玻璃里的墨水屏仪器」和 Key Characteristics（每页一个主图不变；像素字只在墨水屏里；信号橙只表示此刻；强调色表示选中和焦点；mix 色是软件身份色）。
- [ ] Colors：玻璃外壳、墨色、墨水屏、信号橙、强调色、警示色、身份色分段，写明对比度规则（`--chip` 上用 `--ink-2`、浅色 `--accent` 不作文字、取舍 1 的结论）。
- [ ] Typography：Display 页面标题；GST Pixel 只在墨水屏内；字号不变。
- [ ] Layout：不变（只改「液晶读数窗」等用词）。
- [ ] Elevation：玻璃只有一层（最多 6 个模糊层、不嵌套），子板只用半透明填充，浮层不透明；墨水屏内凹；回退规则（透明效果关、减少透明、无 `backdrop-filter`、强制颜色）。
- [ ] Shapes：新圆角；指示灯；表盘 48 段容量环 + 96 条刻线 + 三角指针。
- [ ] Components：逐个对应迁移表（侧栏、导航、面板、页头按钮、读数屏、表盘、设置屏、热力图、走纸记录仪、铭牌、今日分布、开关、分段选择器、对话框），加残影。
- [ ] Do's and Don'ts：删掉「Don't 玻璃拟态」（原 L213）、「液晶表盘」描述（原 L194）、「新增的分类色只放进带框的色板里」（原 L210）、「液晶屏之外不用点阵网格」；Don't 写明：霓虹描边文字、渐变文字、毛玻璃层层叠加或嵌套模糊、屏外用像素字和颗粒纹理、信号橙做装饰、统计卡片网格。
- [ ] 检查：`npm.cmd run check`；`rg -n "液晶|LCD|机壳|旋钮|螺钉" DESIGN.md` 只剩历史说明（如有）。
- [ ] **审查关口**：规格「文档与发布」DESIGN.md 九项逐项核对。

提交：`docs(design): rewrite DESIGN.md for the glass and e-ink system`

---

## 任务 19：其余文档

**文件：** 见下；只写行为和设计，版本号字样留给任务 20。

- [ ] `README.md`：所有「液晶」字样改为墨水屏（按内容定位，现为 L61、L91、L137、L322、L451）；开发小节（`npm run preview:ui` 那行）补 `?page=software|background|statistics|achievements|settings`、`?glass=off`、`?tick`（每次轮询把今日读数加 6 分钟，用来看读数残影），并加两句：「README 截图前先运行 `node scripts/ui-preview/collect-demo-icons.mjs` 取本地图标（不入库），再用 `node scripts/ui-preview/probe.mjs shot --time 22:01` 截图，读数和表盘不随截图时刻变化」「在另一个 worktree 里预览时用 `npm run preview:ui -- --port <n> --strictPort`，1421 留给主 checkout」；图注「截图均为示例数据」保留。
- [ ] `PRODUCT.md:37`：「dot matrices in the LCD」改为「dot matrices on the e-ink screen」。
- [ ] `PRIVACY.md`：Permissions 段加一句：GST reads the Windows "Transparency effects" setting only to decide how panels look; it is not stored.（版本号在任务 20 改。）
- [ ] `memory.md`：Product Decisions 的 UI 方向一段（「UI direction (2026-11-20 redesign …)」）整段改写为玻璃 + 墨水屏、信号橙只表示此刻、强调色表示选中与焦点（含 6666 铭牌）、mix 色是软件身份色（删「Distribution colours appear only inside the 今日分布 plate」）；Technical Decisions 加一条：透明效果只读命令 `get_transparency_effects_enabled` 与 `data-glass` 回退；「Browser UI preview」那一行（v0.3.1 时在 L88）的查询参数补上 `?glass=off`、`?tick`，并补一句：worktree 里另开预览用 `-- --port <n> --strictPort`，`scripts/ui-preview/probe.mjs` 负责带媒体模拟、固定时间（`--time`）的截图、布局导出和帧计时；Latest published release 等版本行在任务 20 改。
- [ ] `AGENTS.md`：v0.3.1 小节后加：

```text
v0.4.0 additionally includes:

- The Mica-glass shell with e-ink screens replaces the v0.2 desk-instrument case and LCD look (`DESIGN.md`). No data, schema (still 3), metric or wording change; the sidebar `时间轴` entry is still unavailable.
- One read-only command, `get_transparency_effects_enabled`, reads the Windows transparency setting (HKCU, not stored); panels turn opaque when it is off. Binding decisions: `docs/superpowers/specs/2026-11-22-glass-eink-redesign-design.md`.
```

  并把「The v0.2 desktop UI additionally includes」里「pixel-font LCD readout」一句后注明「(an e-ink screen since v0.4.0)」。
- [ ] `docs/CURRENT_STATE.md`：第 3 行加 v0.4.0 的版本句（界面改为玻璃 + 墨水屏，数据和口径不变）；「发布与验证」加任务 16 的结果（截图矩阵通过、对比度数字、预览帧率与 v0.3.1 基线、forced-colors 与缩放的预览近似），并单列「发布后才能完成的验收」：验收 6、7、8、9、11 的真机部分和性能验收第 2、3 行（以及透明效果关时重做的第 4 行），以及「已知限制」里要实测的两项（节电模式与 `EnableTransparency`、WebView2 对 `prefers-reduced-transparency` 的支持），每项标「待发布后验收」（取舍 21、22）。口径表不变。
- [ ] `docs/superpowers/specs/2026-11-21-statistics-and-achievements-design.md`：L32「点阵 LCD 样式」、L41「液晶屏」后注明「v0.4.0 起为墨水屏」；L42「当前项凸起」改为「当前项为 `--on` 底加 `--edge` 描边（v0.4.0）」；L43 改为「达成后用 `--accent` 描边（v0.4.0 起，原为信号橙）」。
- [ ] 本规格：状态行改为「已实现，待发布」；在「已知限制」后补一小节「实现时的取舍」，列本计划取舍 1–7、12、13、14、18、21、22、23、24、25、26（规格没写、与规格原文不同、或影响外观与验收口径的决定），每条写明任务 0 时用户的拍板结果（取舍 1 选了哪一种，2、7、21 是否同意偏离原文）。
- [ ] `CHANGELOG.md`：顶部 `## Unreleased`，英文条目：

```text
- Redesigned the whole app as a Mica-like glass shell with matte e-ink screens for the readouts, in both light and dark themes. Nothing about the data, metrics or layout changes.
- The overview dial gains 96 quarter-hour ticks; large readouts keep a faint ghost of the previous value.
- Panels turn opaque when Windows transparency effects are off, when reduced transparency is requested, or when blur is unsupported; high-contrast themes keep text and focus rings visible.
- Signal orange now marks only what is happening now; selection and focus use a blue accent, and errors use their own red.
```

- [ ] 检查：`npm.cmd run check`；全文搜新增文字里没有真实软件名和时长。
- [ ] **审查关口**：规格「文档与发布」逐行核对（DESIGN.md 已在任务 18）。

提交：`docs: document the v0.4.0 glass and e-ink redesign`

---

## 任务 20：发布 v0.4.0

**前提：** 任务 1–19 完成；按用户要求合入本地 `main`（`main` 要求线性历史，用快进）：

```powershell
cd F:\XJTLU\科研_DIY\Global_Software_Timer\.worktrees\v01-implementation
git merge --ff-only feat/glass-eink-redesign
```

**位置：** 下面的改动和发布提交都在 `.worktrees/v01-implementation`（`main`）。先 `. .\scripts\dev-env.ps1`，并 `Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue`（`scripts/release-build.ps1` 写死了 `src-tauri\target\release\bundle\...`）。

- [ ] **版本号（7 处）**：`package.json`、`package-lock.json`（两处）、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`、`src-tauri/.backlog-qa/tauri.conf.json` 统一改为 `0.4.0`。侧栏和设置屏的 `V0.4.0` 从 `package.json` 读，不用另改。
- [ ] **版本字样**：`CHANGELOG.md` 的 `## Unreleased` → `## v0.4.0 - <发布日期>`；`PRIVACY.md` 各处当前版本 `v0.3.1` → `v0.4.0`（描述历史功能的「Since v0.x」不改）；`docs/ui-redesign-backlog.md` 第 9 行的「已发布 v0.3.1 …」改为 v0.4.0（界面改为玻璃 + 墨水屏）；`docs/CURRENT_STATE.md` 第 3 行与「当前发布为」一句；`memory.md` 的 Latest published release、Current Repository State、Release State 各加 v0.4.0（schema 仍为 3）；`README.md` 的 `Get-FileHash` 文件名；本规格状态行 → 「已随 v0.4.0 发布」。
- [ ] **发布说明** `docs/releases/v0.4.0.md`（中文，仿 `v0.3.1.md`）：全 app 换成云母玻璃 + 墨水屏，两套主题；表盘加刻线、读数残影；关闭 Windows 透明效果时面板自动不透明；信号橙只表示此刻；不改数据和口径；升级说明写「数据库结构不变（仍为 schema 3）」；安装包段落与 v0.3.1 相同，文件名换成 `0.4.0`。另加一段「发布后验收」：列出发布时尚未完成的验收项（验收 6、7、8、9、11 的真机部分、性能验收第 2、3 行，Windows 10 视待确认 1 而定），写明「发布后在本机逐项验收，结果记入 `docs/CURRENT_STATE.md`；不达标会发补丁版」。`CHANGELOG.md` 不写验收状态。
- [ ] **发布前复核**：规格验收 1、2 的三条 `rg`；验收 10：`git diff --stat d0b4be1..HEAD -- src-tauri`（`d0b4be1` 是 v0.3.1 发布提交，执行时用 `git log --format=%h -1 --grep "^chore(release): publish 0.3.1$"` 再核对一次）只有 `appearance.rs`、`lib.rs`、`commands.rs` 和版本号文件；旧版本号只查本项目自己的位置，不对整个仓库 `rg`（`Cargo.lock` 里 `dispatch2`、`foreign-types-shared`、`jni-sys`、`want` 等第三方 crate 也是 `0.3.1`）：`rg -n "0\.3\.1" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/.backlog-qa/tauri.conf.json PRIVACY.md README.md docs/CURRENT_STATE.md memory.md docs/ui-redesign-backlog.md` 只剩历史记录；`package-lock.json` 只看根的两处 `version`；`Cargo.lock` 只看 `name = "global-software-timer"` 那一项的 `version`（`rg -n -A1 'name = "global-software-timer"' src-tauri/Cargo.lock`）。
- [ ] **本地构建**：`npm.cmd run release:build` 通过，记下两个安装包的 SHA-256。**不运行**这两个安装包。
- [ ] **审查关口**：版本号 7 处一致；发布说明与 CHANGELOG 一致。
- [ ] **提交**（标题必须一字不差，发布工作流据此打 tag、建 Release）：`chore(release): publish 0.4.0`
- [ ] **推送与安装（都需用户在会话里明确同意）**：同意后推送 `main`，看 CI 和「Windows release」工作流通过。安装前先做「本机验收」的基线（v0.3.1 静止 CPU）。再从正式 Release 下载 EXE，核对 SHA-256，用 `/S` 静默覆盖安装（安装程序会结束正在运行的 GST），重新启动，确认托盘正常。

---

## 本机验收（发布后，每一步都先征得用户同意）

对应验收 6、7、8、9、11 的真机部分、性能验收第 2、3 行（透明效果关时再做第 4 行），以及规格「已知限制」里要实测的两项。只看界面和性能数字，不截取含真实数据的画面入库；需要留证的录屏、截图只放 scratchpad 或用户指定的位置。

- [ ] **静止 CPU 基线（安装 v0.4.0 之前）**：打开已装的 v0.3.1 窗口停在概览，1 分钟内每秒采样一次 `Get-Counter '\Process(msedgewebview2*)\% Processor Time'`、`'\Process(msedgewebview2*)\ID Process'`（只读），按进程 ID 只留 GST 那一组 WebView2 进程（父进程链追到 `global-software-timer.exe`）。口径与任务管理器一致：每个采样时刻把这组进程的值**相加**，再除以 `[Environment]::ProcessorCount`（该计数器以单核为 100%），得到占整机的百分比；60 个采样取平均。
- [ ] **静止 CPU（v0.4.0）**：同样方法、同样口径；标准：不比基线高出 1 个百分点以上（性能验收第 3 行，按上面「整机百分比」口径）。
- [ ] **拖动与缩放**：在 1180×760 和最大化之间切换、拖动窗口各 10 次，录屏，看有无可见卡顿或撕裂（第 2 行）。
- [ ] **透明效果（验收 6）**：关闭「设置 → 个性化 → 颜色 → 透明效果」，把 GST 窗口隐藏到托盘再打开：所有面板不透明、文字清楚；再打开透明效果、再隐藏后打开：玻璃恢复。（这一项要用户亲手切换系统设置。）然后在透明效果关闭的状态下重复上面两项性能检查（性能验收第 4 行）。
- [ ] **WebView2 与 `prefers-reduced-transparency`（已知限制，实测）**：透明效果保持关闭时，在**有界面的** Edge 窗口（与 WebView2 同为 Chromium 内核）打开任意页面，DevTools 控制台查 `matchMedia('(prefers-reduced-transparency: reduce)').matches`，再打开透明效果查一次，记下两次结果和 Edge 版本。WebView2 发布版不开 DevTools，无法直接查，结果注明「以同版本 Edge 推断」；GST 不依赖它（注册表读取是主路径）。
- [ ] **节电模式与 `EnableTransparency`（已知限制，实测）**：用户打开 Windows 节电模式（「设置 → 系统 → 电源和电池 → 节电模式」，要用户亲手切换），之后只读地跑 `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" /v EnableTransparency`，看值有没有变成 0；把 GST 隐藏到托盘再打开，看玻璃有没有退回不透明面板。再关掉节电模式，重复一次。结果写进 `docs/CURRENT_STATE.md` 和规格「已知限制」。
- [ ] **对比度主题（验收 7）**：用户打开 Windows 对比度主题，确认所有文字和焦点环都看得见，再关掉。
- [ ] **缩放（验收 9）**：100% / 125% / 150% 显示缩放下看像素读数边缘。
- [ ] **Windows 10（验收 8，待确认 1）**：有 Win10 实机或虚拟机时装正式安装包对照；没有就记「未在 Win10 实测，以 Win11 + 透明效果关近似」。
- [ ] **侧栏「时间轴」**仍显示「未开放」（验收 10）。
- [ ] **记录**：在从 `main` 新建的 `docs/v0.4.0-acceptance` 分支上，在 `docs/CURRENT_STATE.md`「发布与验证」加一段，只写通过与否和数字（CPU 平均值、帧率、是否在 Win10 实测、节电模式与 `prefers-reduced-transparency` 的实测结果），把任务 19 标的「待发布后验收」逐项改成结果；规格「已知限制」里两项实测结论同步写上，不附截图；提交（用户允许后）：`docs(state): record the v0.4.0 desktop acceptance`。

**任何一项不达标时：**

1. 先停下，在会话里报告是哪一项、数字多少，不在 `main` 上直接改。
2. 性能类（拖动卡顿、静止 CPU、帧率）先按规格「性能不达标时去掉 `backdrop-filter`、只留半透明」：在 `:root` 把 `--glass-filter` 设为 `none`；显示类（透明效果关后仍透明、对比度主题下看不见、缩放发虚、Win10 不一致）修对应的 CSS 或 `glass.ts`。
3. 从 `main` 新建 `fix/<具体问题>` 分支和 worktree，按本计划同样的 TDD、`npm.cmd run check` 和审查关口修复，一个问题一个 `fix(ui): …` 提交。
4. 修完发补丁版 0.4.1：照任务 20 改 7 处版本号、写 `docs/releases/v0.4.1.md` 和 CHANGELOG，提交标题 `chore(release): publish 0.4.1`；合入、推送、安装都要用户在会话里明确同意。
5. 装上 0.4.1 后，把不达标的那几项重新验收一遍，结果写进 `docs/CURRENT_STATE.md`。
