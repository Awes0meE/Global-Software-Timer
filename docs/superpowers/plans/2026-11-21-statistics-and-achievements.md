# 统计页与成就页实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 待执行。分支 `feat/statistics-and-achievements`，worktree `.worktrees/statistics-brainstorm`。

**目标：** 把侧栏的 `统计` 和 `成就` 从占位改成真实页面。统计页按用户选的跨天区间显示趋势、排行涨跌、开着没用榜、会话和作息；成就页显示活跃热力图、连续天数、个人纪录、焦点里程碑和软件来去。

**架构：** 后端只读现有日汇总和会话表，不改 schema、不改 tracker。新增 `src-tauri/src/statistics.rs` 放纯计算（区间、排行、阈值、连续天数、里程碑），`storage.rs` 只加区间查询，`commands.rs` 加两个只读命令并组装 DTO。前端两个懒加载页面，各一个主图：统计页是走纸记录仪式趋势图，成就页是液晶屏里的点阵热力图。

**技术栈：** Tauri v2、Rust、rusqlite、chrono、React、TypeScript、Vitest、Testing Library。

---

## 依据

- 设计草案：`docs/superpowers/specs/2026-11-21-statistics-and-achievements-design.md`（已确认口径见文末表格）
- 设计系统：`DESIGN.md`（禁止统计卡片网格；点阵纹理只允许出现在液晶屏里）
- 统计口径：`docs/CURRENT_STATE.md`
- 现有命令与只读事务写法：`src-tauri/src/commands.rs` 的 `get_software_page_summary`
- 现有日汇总写入：`src-tauri/src/storage.rs` 的 `increment_daily_system_usage`、`increment_daily_software_runtime_usage`、`increment_daily_software_focus_usage`
- 现有页面模式：`src/components/BackgroundPage.tsx`（读取中 / 失败 / 空数据三态，`startVisiblePolling`）
- 预览替身：`scripts/ui-preview/tauri-core.ts`、`scripts/ui-preview/mock-data.ts`

Rust 命令前先在 PowerShell 里加载：

```powershell
. .\scripts\dev-env.ps1
```

---

## 口径（实现时以此为准）

| 维度 | 数据 | 说明 |
| --- | --- | --- |
| 机器记录 / 活跃 | `daily_system_usage.recorded_seconds` / `active_seconds` | 活跃带五分钟键鼠空闲门槛。隐藏软件不影响机器级数字。 |
| 软件焦点 | `daily_software_focus_usage.focused_seconds` | 统计页排行、开着没用、成就页里程碑与单日纪录统一用焦点，与软件页「活跃」口径一致。 |
| 软件窗口 | `daily_software_runtime_usage.foreground_seconds` | 只算有任务栏窗口的时间；托盘和后台时间不算，避免常驻服务刷榜。 |
| 会话 | `usage_sessions` 经 `software_identity_members` 归到身份 | 按 `started_at` 的本地日期落入区间。已关闭会话用 `duration_seconds`；未关闭会话用 `last_heartbeat_at - started_at`。 |
| 软件明细起点 | `MIN(usage_date) FROM daily_software_runtime_usage` | 本机为 2026-06-18。之前的日子总时长照常显示，软件维度标「无软件明细」，不计入、不当 0。 |
| 数据起点 | `MIN(usage_date) FROM daily_system_usage` | 本机为 2026-05-29。自定义区间不能早于它。 |

与设计草案初稿相比的三处细化（已同步回草案）：

- 区间排行按**焦点**时长排名，软件维度和开着没用榜、里程碑用同一个数，避免同一软件在一页里出现两个「在用」数字。机器维度仍用活跃。
- 个人纪录里的「最长一次连续使用」改为「单个软件单日焦点最长」。会话包含托盘运行，常驻软件的一次会话可以连续好几天，不能代表在用。
- 热力图点某天跳时间轴，等时间轴页做好后再接。

常量（放在 `statistics.rs` 顶部，全部有单元测试覆盖）：

```rust
pub const MAX_RANGE_DAYS: i64 = 366;
pub const IDLE_OPEN_MIN_WINDOW_SECONDS: i64 = 5 * 3600;
pub const IDLE_OPEN_MAX_FOCUS_PERMILLE: i64 = 50; // 5%
pub const MILESTONE_HOURS: [i64; 6] = [10, 50, 100, 500, 1000, 6666];
pub const STREAK_MIN_ACTIVE_SECONDS: i64 = 5 * 60; // 当天活跃满 5 分钟算用过，2026-11-21 确认
pub const COMINGS_GOINGS_DAYS: i64 = 30;
pub const COMINGS_GOINGS_MIN_WINDOW_SECONDS: i64 = 60; // 累计窗口不满 1 分钟不计入软件来去，2026-11-21 确认（任务 3b）
pub const HEATMAP_DAY_OPTIONS: [u32; 3] = [90, 180, 365];
pub const RANKING_LIMIT: usize = 20;
```

---

## 文件结构

新建：

- `src-tauri/src/statistics.rs`：纯计算与常量，含 `#[cfg(test)] mod tests`。
- `src-tauri/tests/statistics_storage_tests.rs`：区间查询的存储测试。
- `src/statisticsRange.ts`：区间预设、上一等长区间、涨跌百分比、工作日与周末拆分。
- `src/__tests__/statisticsRange.test.ts`
- `src/components/StatisticsPage.tsx`：统计页容器（区间选择、隐藏软件开关、三态）。
- `src/components/TrendRecorder.tsx`：走纸记录仪趋势图（SVG）。
- `src/components/StatisticsLedgers.tsx`：排行、开着没用、会话三张台账，以及作息面板。
- `src/components/AchievementsPage.tsx`：成就页容器。
- `src/components/ActivityHeatmap.tsx`：液晶屏内的点阵热力图与连续天数读数。
- `src/components/MilestoneShelf.tsx`：里程碑与个人纪录。
- `src/__tests__/StatisticsPage.test.tsx`
- `src/__tests__/AchievementsPage.test.tsx`

修改：

- `src-tauri/src/lib.rs`：`pub mod statistics;`，注册两个命令。
- `src-tauri/src/storage.rs`：区间查询函数（只读 SQL，不改 schema）。
- `src-tauri/src/commands.rs`：DTO、两个命令、组装与隐藏过滤，及其测试。
- `src/api.ts`：类型与调用封装。
- `src/App.tsx`：两个导航项改为可用，`PageId`、页标题、懒加载与渲染分支。
- `src/styles.css`：两页样式，全部用现有设计令牌。
- `src/__tests__/App.test.tsx`：未开放按钮列表与导航测试。
- `scripts/ui-preview/mock-data.ts`、`scripts/ui-preview/tauri-core.ts`：两个命令的演示数据，`?page=statistics|achievements`。
- `DESIGN.md`、`PRODUCT.md`、`docs/CURRENT_STATE.md`、`CHANGELOG.md`（Unreleased）、设计草案状态行。

不做：

- 不改数据库 schema、不加迁移、不改采集逻辑。
- 星期 × 小时习惯图（等半小时分时数据）。
- 热力图点某天跳时间轴（时间轴页还没做；单元格只显示悬停说明）。
- 导出、场景分类、后台资源长期趋势、页头日期按钮与导出按钮（仍是未完成占位）。
- 任何网络请求、遥测或新的隐私数据采集。

---

## 执行顺序与并行

- 任务 0（视觉样稿）只产出图片，不改源码，可与任务 1～5 并行；**任务 6、7 必须等用户选定样稿后再开始**。
- 任务 1 → 2 → 3 顺序执行（后端）。任务 4、5（前端类型与预览数据）只依赖任务 3 定下的 DTO 形状，可在任务 3 的 DTO 写定后开始。
- 任务 6、7 可以并行。为了不让两边同时改 `src/styles.css`，两页的样式各自放在 `src/components/StatisticsPage.css`、`src/components/AchievementsPage.css`，由页面组件导入（随懒加载分块），只用 `styles.css` 里现有的令牌；下文任务 6、7 文件列表里的 `src/styles.css` 以此为准。
- 每个任务结束：跑该任务的检查、自查 diff、按 `AGENTS.md` 的审查关口过一遍，再按任务末尾的提交信息提交。

---

## 任务 0：视觉样稿（用户确认后才做界面）

**产出：** 本机样稿目录（含真实数据，未入库） 下的 PNG，浅色和深色各一套，1440×900。

- [ ] 用现有 `src/styles.css` 的令牌写两张静态 HTML 样稿（放 scratchpad，不进仓库），用无头 Edge `--screenshot` 截图。
- [ ] 统计页给 2 个方向：
  - A：走纸记录仪。凹陷纸槽里横向走纸，每天一根记录针柱（记录浅、活跃深），活跃率是一条细描线，日均是一条虚线刻度；下方是排行台账。
  - B：仪表条带。每天一列凹槽刻度条，上方小液晶窗显示区间合计与环比。
- [ ] 成就页给 2 个方向：
  - A：液晶点阵墙。热力图整个放进液晶屏，每天一个像素点，4 级墨色深浅；右侧液晶读数显示当前连续天数和最长连续天数。
  - B：日历刻度盘。按月排列的小液晶块，每块 7 列点阵。
- [ ] 里程碑样式：六级刻字铭牌（10/50/100/500/1000/6666 小时），6666 用信号橙描边作为终极成就；未达成的铭牌是凹陷空槽加进度刻度。
- [ ] 把截图发给用户，记录所选方向到设计草案。

**完成标准：** 用户选定统计页和成就页各一个方向（或给出修改意见并重出）。

**结果（2026-11-21）：** 统计页选 A 走纸记录仪，成就页选 B 日历刻度盘。选中的截图在 本机样稿目录（含真实数据，未入库），取舍与用词规则记在设计草案的「视觉方向」「用词」两节，任务 6、7 以那两节为准。

提交（只提交选中的截图和草案更新）：`docs(spec): add the chosen statistics and achievements mockups`

---

## 任务 1：存储层区间查询

**文件：** `src-tauri/src/storage.rs`、`src-tauri/tests/statistics_storage_tests.rs`

所有日期参数是本地日期 `NaiveDate`，包含两端；SQL 用 `usage_date BETWEEN ?1 AND ?2`，参数为 `date.to_string()`（`YYYY-MM-DD`，与现有写入一致）。

- [ ] **Step 1：写失败测试。** 新建 `src-tauri/tests/statistics_storage_tests.rs`，用 `NamedTempFile` + `Store::open` + `migrate`，通过现有 `increment_*` 写入数据。至少覆盖：

```rust
#[test]
fn system_usage_range_returns_only_dates_inside_the_range() {
    let (_file, store) = migrated_store();
    for (day, active) in [(1, 600), (2, 1200), (3, 1800), (4, 2400)] {
        store
            .increment_daily_system_usage(date(2026, 11, day), active * 2, active, active * 3)
            .unwrap();
    }

    let rows = store
        .daily_system_usage_range(date(2026, 11, 2), date(2026, 11, 3))
        .unwrap();

    assert_eq!(
        rows.iter().map(|row| (row.date, row.active_seconds)).collect::<Vec<_>>(),
        vec![(date(2026, 11, 2), 1200), (date(2026, 11, 3), 1800)]
    );
}

#[test]
fn software_window_and_focus_range_sum_per_identity() {
    let (_file, store) = migrated_store();
    let key = identity_for(&store, "chatgpt.exe");
    let at = utc(2026, 11, 2, 9);
    store.increment_daily_software_runtime_usage(date(2026, 11, 2), &key, 3600, 900, at).unwrap();
    store.increment_daily_software_runtime_usage(date(2026, 11, 3), &key, 1800, 0, at).unwrap();
    store.increment_daily_software_focus_usage(date(2026, 11, 3), &key, 300).unwrap();

    let window = store.software_window_seconds_range(date(2026, 11, 1), date(2026, 11, 3)).unwrap();
    let focus = store.software_focus_seconds_range(date(2026, 11, 1), date(2026, 11, 3)).unwrap();

    assert_eq!(window.get(&key), Some(&5400)); // 只算 foreground_seconds
    assert_eq!(focus.get(&key), Some(&300));
}
```

  `migrated_store`、`identity_for`（`upsert_app` + `upsert_software_identity_for_app` 取身份键）、`date`、`utc` 是本文件里的小助手函数，照 `storage_tests.rs` 的写法补上。

  另外覆盖：`software_detail_start_date` 与 `data_start_date` 在空库返回 `None`、有数据时返回最早日期；`daily_recorded_bounds_range` 只统计当天 `foreground_seconds > 0` 的身份并取最早 `first_recorded_at` 与最晚 `last_recorded_at`；`sessions_started_between` 用 UTC 边界、把多个 app 合并到同一身份、未关闭会话按心跳计时；`software_window_date_bounds` 只看 `foreground_seconds > 0` 的日子；`software_focus_daily` 按日期升序。需要的 `increment_daily_software_focus_usage` 真实签名以 `storage.rs:1605` 为准，测试里照抄。

- [ ] **Step 2：确认失败。**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --test statistics_storage_tests
```

- [ ] **Step 3：实现以下 `pub fn`（都在 `impl Store`，只读）：**

| 函数 | 返回 | SQL 要点 |
| --- | --- | --- |
| `data_start_date()` | `Option<NaiveDate>` | `MIN(usage_date) FROM daily_system_usage` |
| `software_detail_start_date()` | `Option<NaiveDate>` | `MIN(usage_date) FROM daily_software_runtime_usage` |
| `daily_system_usage_range(start, end)` | `Vec<DailySystemUsage>` 按日期升序 | 复用 `DailySystemUsage` 与现有日期解析 |
| `software_window_seconds_range(start, end)` | `HashMap<String, i64>` | `SUM(foreground_seconds) ... GROUP BY identity_key` |
| `software_focus_seconds_range(start, end)` | `HashMap<String, i64>` | `SUM(focused_seconds) ... GROUP BY identity_key` |
| `daily_recorded_bounds_range(start, end)` | `Vec<(NaiveDate, DateTime<Utc>, DateTime<Utc>)>` | `WHERE foreground_seconds > 0 GROUP BY usage_date`，`MIN(first_recorded_at)`、`MAX(last_recorded_at)` |
| `sessions_started_between(start_utc, end_utc)` | `Vec<(String, i64)>`（身份键，秒） | `usage_sessions JOIN software_identity_members USING(app_id)`，`started_at >= ?1 AND started_at < ?2`，时长规则见口径表 |
| `software_focus_daily()` | `Vec<(String, NaiveDate, i64)>` 按日期升序 | 全部历史，`focused_seconds > 0` |
| `software_window_date_bounds()` | `HashMap<String, (NaiveDate, NaiveDate)>` | `MIN/MAX(usage_date) WHERE foreground_seconds > 0 GROUP BY identity_key` |
| `software_identity_labels()` | `HashMap<String, (String, String)>`（显示名，代表路径） | `software_identities` 全表 |

  `usage_sessions.started_at` 是 RFC 3339 文本，生产库里带不定长的小数秒（如 `2026-05-28T19:25:49.212314600+00:00`），同一秒内按字符串比较可能错序。`sessions_started_between` 用 SQL 按日期前缀前后各放宽一天粗筛，再在 Rust 里用 `DateTime::parse_from_rfc3339` 精确过滤。测试里用 `start_session` / `close_session(session_id, ended_at, "test", false)` 写入，保证格式与生产一致，并加一条小数秒恰好落在边界上的用例。

- [ ] **Step 4：通过测试并检查格式。**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --test statistics_storage_tests
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
```

提交：`feat(storage): add read-only range queries for statistics`

---

## 任务 2：纯计算模块 `statistics.rs`

**文件：** `src-tauri/src/statistics.rs`、`src-tauri/src/lib.rs`

只接收任务 1 查出来的普通集合，不碰数据库，方便穷举边界。

- [ ] **Step 1：在模块内写失败测试**（`#[cfg(test)] mod tests`），至少包含：

```rust
#[test]
fn previous_range_has_the_same_length_and_ends_the_day_before() {
    let range = DateRange::new(d(2026, 11, 15), d(2026, 11, 21)).unwrap();
    assert_eq!(range.days(), 7);
    let previous = range.previous();
    assert_eq!((previous.start, previous.end), (d(2026, 11, 8), d(2026, 11, 14)));
}

#[test]
fn range_rejects_reversed_and_too_long_ranges() {
    assert!(DateRange::new(d(2026, 11, 21), d(2026, 11, 20)).is_err());
    assert!(DateRange::new(d(2025, 1, 1), d(2026, 11, 21)).is_err()); // > 366 天
}

#[test]
fn idle_open_needs_five_window_hours_and_under_five_percent_focus() {
    let window = map(&[("browser", 400 * H), ("chat", 400 * H), ("short", 4 * H)]);
    let focus = map(&[("browser", 15 * H), ("chat", 26 * H), ("short", 0)]);
    let rows = idle_open(&window, &focus);
    // browser 3.75% 上榜；chat 6.5% 不上榜；窗口不足 5 小时不上榜
    assert_eq!(keys(&rows), vec!["browser"]);
    assert_eq!(rows[0].idle_seconds, 385 * H);
}

#[test]
fn idle_open_boundary_is_strictly_below_five_percent() {
    let window = map(&[("a", 100 * H), ("b", 100 * H)]);
    let focus = map(&[("a", 5 * H), ("b", 5 * H - 1)]);
    assert_eq!(keys(&idle_open(&window, &focus)), vec!["b"]);
}

#[test]
fn ranking_marks_new_entries_and_previous_rank() {
    let current = map(&[("a", 300), ("b", 200), ("c", 100)]);
    let previous = map(&[("b", 500), ("a", 100)]);
    let rows = rank_software(&current, &previous, &HashMap::new(), true);
    assert_eq!(rows[0].previous_rank, Some(2)); // a：上一区间第 2，现在第 1
    assert_eq!(rows[1].previous_rank, Some(1)); // b
    assert_eq!(rows[2].previous_rank, None);    // c：新上榜
}

#[test]
fn ranking_without_comparable_previous_range_has_no_previous_ranks() {
    let rows = rank_software(&map(&[("a", 1)]), &map(&[("a", 9)]), &HashMap::new(), false);
    assert_eq!(rows[0].previous_rank, None);
    assert!(!rows[0].is_new); // 不可比时不标「新上榜」
}

#[test]
fn current_streak_does_not_break_while_today_is_still_running() {
    let days = active_days(&[(17, 900), (18, 900), (19, 900), (20, 900), (21, 0)]);
    let streaks = streaks(&days, d(2026, 11, 21));
    assert_eq!(streaks.current_days, 4); // 今天还没达标，从昨天往回数
}

#[test]
fn days_below_threshold_break_the_streak() {
    // 299 秒差一秒不达标，300 秒恰好达标
    let days = active_days(&[(18, 900), (19, 299), (20, 300), (21, 900)]);
    let streaks = streaks(&days, d(2026, 11, 21));
    assert_eq!((streaks.current_days, streaks.longest_days), (2, 2));
}

#[test]
fn milestone_records_the_highest_tier_and_the_day_it_was_reached() {
    let daily = vec![
        ("code".into(), d(2026, 7, 1), 6 * H),
        ("code".into(), d(2026, 7, 2), 5 * H), // 累计 11 小时，跨过 10
        ("code".into(), d(2026, 7, 9), 40 * H), // 累计 51 小时，跨过 50
    ];
    let rows = milestones(&daily);
    assert_eq!(rows[0].reached_hours, Some(50));
    assert_eq!(rows[0].reached_on, Some(d(2026, 7, 9)));
    assert_eq!(rows[0].next_hours, Some(100));
}

#[test]
fn ultimate_milestone_has_no_next_tier() {
    let rows = milestones(&vec![("x".into(), d(2026, 7, 1), 6666 * H)]);
    assert_eq!((rows[0].reached_hours, rows[0].next_hours), (Some(6666), None));
}

#[test]
fn comings_and_goings_use_window_days_and_ignore_the_detail_start_day() {
    let bounds = HashMap::from([
        ("new".into(), (d(2026, 11, 10), d(2026, 11, 20))),
        ("old".into(), (d(2026, 6, 18), d(2026, 9, 1))),   // 30 天以上没开窗口
        ("base".into(), (d(2026, 6, 18), d(2026, 11, 21))), // 明细起点那天就有，不算新
    ]);
    let (new, dormant) = comings_and_goings(&bounds, d(2026, 11, 21), d(2026, 6, 18));
    assert_eq!((keys(&new), keys(&dormant)), (vec!["new"], vec!["old"]));
}
```

  再补：会话统计（打开次数、平均取整、最长）；`rank_software` 只保留焦点或窗口大于 0 的身份并截到 `RANKING_LIMIT`；同分按显示名排序要稳定（排序键需要显示名时，由调用方传入标签表或在命令层二次排序，二选一并写测试）。

- [ ] **Step 2：确认失败**：`cargo test --manifest-path src-tauri\Cargo.toml statistics::`

- [ ] **Step 3：实现。** 类型建议：

```rust
pub struct DateRange { pub start: NaiveDate, pub end: NaiveDate }
impl DateRange {
    pub fn new(start: NaiveDate, end: NaiveDate) -> Result<Self, RangeError>;
    pub fn days(&self) -> i64;
    pub fn previous(&self) -> DateRange;
    pub fn dates(&self) -> impl Iterator<Item = NaiveDate>;
}
pub struct RankEntry { pub identity_key: String, pub focused_seconds: i64, pub window_seconds: i64,
                       pub previous_focused_seconds: i64, pub rank: u32, pub previous_rank: Option<u32>, pub is_new: bool }
pub struct IdleOpenEntry { pub identity_key: String, pub window_seconds: i64, pub focused_seconds: i64, pub idle_seconds: i64 }
pub struct SessionStatEntry { pub identity_key: String, pub launch_count: u32, pub average_seconds: i64, pub longest_seconds: i64 }
pub struct Streaks { pub current_days: u32, pub current_start: Option<NaiveDate>,
                     pub longest_days: u32, pub longest_start: Option<NaiveDate>, pub longest_end: Option<NaiveDate> }
pub struct MilestoneEntry { pub identity_key: String, pub focused_seconds: i64,
                            pub reached_hours: Option<i64>, pub reached_on: Option<NaiveDate>, pub next_hours: Option<i64> }
```

  开着没用判断用整数避免浮点误差：`window >= IDLE_OPEN_MIN_WINDOW_SECONDS && focus * 1000 < window * IDLE_OPEN_MAX_FOCUS_PERMILLE`，按 `idle_seconds = window - focus` 降序。连续天数：达标日 = `active_seconds >= STREAK_MIN_ACTIVE_SECONDS`；当前连续从今天往回数，今天未达标则从昨天开始。里程碑列表只返回累计焦点不少于 1 小时的身份，按焦点降序，最多 30 个。

- [ ] **Step 4：通过测试**，`cargo fmt -- --check`。

提交：`feat(statistics): add range, ranking, streak and milestone calculations`

---

## 任务 3：两个只读命令

**文件：** `src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`

- [ ] **Step 1：写失败测试**（`commands.rs` 现有 `mod tests` 风格，临时库 + `*_from_store` 组装函数，不经过 Tauri `State`）：
  - `statistics_summary_zero_fills_days_and_flags_days_before_software_detail`：系统数据从 11-01 开始、软件数据从 11-03 开始，查 11-01～11-04，`days` 有 4 项，前两项 `has_software_detail == false`，`days_without_software_detail == 2`。
  - `statistics_summary_excludes_hidden_software_unless_requested`：隐藏身份不出现在 `ranking`、`idle_open`、`sessions`；`include_hidden = true` 时出现；机器级 `days` 数字两种情况相同。
  - `statistics_summary_reports_comparison_availability`：上一区间早于数据起点时 `system_comparison_available == false`；早于软件明细起点时 `software_comparison_available == false`。
  - `statistics_summary_rejects_invalid_ranges`：倒序、超过 366 天、日期字符串格式错误返回错误码 `statistics_invalid_range`。
  - `achievements_summary_heatmap_has_exactly_requested_days_ending_today`：`heatmap_days` 只接受 90/180/365，其他值返回 `achievements_invalid_heatmap_days`；返回天数等于请求值，最后一天是 `today`，缺数据的日子补 0。
  - `achievements_summary_picks_best_active_day_and_best_software_day`。
  - `achievements_summary_excludes_hidden_software_from_milestones_and_comings_goings`。

- [ ] **Step 2：实现 DTO（`#[derive(Debug, Clone, Serialize)]`，字段 snake_case，日期一律 `YYYY-MM-DD` 字符串，时间戳 RFC 3339）：**

```rust
pub struct StatisticsSummary {
    pub start: String, pub end: String, pub days_count: u32,
    pub previous_start: String, pub previous_end: String,
    pub data_start_date: Option<String>,
    pub software_detail_start_date: Option<String>,
    pub days_without_software_detail: u32,
    pub system_comparison_available: bool,
    pub software_comparison_available: bool,
    pub previous_recorded_seconds: i64,
    pub previous_active_seconds: i64,
    pub days: Vec<StatisticsDayDto>,
    pub ranking: Vec<RankingRowDto>,
    pub idle_open: Vec<IdleOpenRowDto>,
    pub sessions: Vec<SessionStatRowDto>,
}
pub struct StatisticsDayDto { pub date: String, pub recorded_seconds: i64, pub active_seconds: i64,
    pub tracker_uptime_seconds: i64, pub first_recorded_at: Option<String>, pub last_recorded_at: Option<String>,
    pub has_software_detail: bool }
pub struct RankingRowDto { pub identity_key: String, pub display_name: String, pub icon_data_url: Option<String>,
    pub rank: u32, pub previous_rank: Option<u32>, pub is_new: bool,
    pub focused_seconds: i64, pub previous_focused_seconds: i64, pub window_seconds: i64 }
pub struct IdleOpenRowDto { pub identity_key: String, pub display_name: String, pub icon_data_url: Option<String>,
    pub window_seconds: i64, pub focused_seconds: i64, pub idle_seconds: i64 }
pub struct SessionStatRowDto { pub identity_key: String, pub display_name: String, pub icon_data_url: Option<String>,
    pub launch_count: u32, pub average_seconds: i64, pub longest_seconds: i64 }

pub struct AchievementsSummary {
    pub today: String, pub heatmap_days: u32,
    pub heatmap: Vec<HeatmapDayDto>,             // { date, active_seconds }
    pub streak_threshold_seconds: i64,
    pub current_streak_days: u32, pub current_streak_start: Option<String>,
    pub longest_streak_days: u32, pub longest_streak_start: Option<String>, pub longest_streak_end: Option<String>,
    pub best_active_day: Option<DayRecordDto>,   // { date, seconds }
    pub best_software_day: Option<SoftwareDayRecordDto>, // { identity_key, display_name, icon_data_url, date, seconds }
    pub milestone_hours: Vec<i64>,               // [10, 50, 100, 500, 1000, 6666]
    pub milestones: Vec<MilestoneRowDto>,
    pub new_software: Vec<SoftwareRefDto>,       // { identity_key, display_name, icon_data_url, date }
    pub dormant_software: Vec<SoftwareRefDto>,
}
```

  连续天数按全部历史算，不受热力图天数影响。最佳单日、里程碑同样按全部历史。

- [ ] **Step 3：命令。** 写法照搬 `get_software_page_summary`：锁 `summary_store`、开 `savepoint`、调用 `*_from_store`、提交。

```rust
#[tauri::command(async)]
pub fn get_statistics_summary(state: State<'_, AppState>, start: String, end: String,
    include_hidden: bool) -> Result<StatisticsSummary, String>;

#[tauri::command(async)]
pub fn get_achievements_summary(state: State<'_, AppState>, heatmap_days: u32,
    include_hidden: bool) -> Result<AchievementsSummary, String>;
```

  `today` 用 `Local::now().date_naive()`；`*_from_store` 接收 `today` 参数以便测试。会话的 UTC 边界用区间首日本地零点和末日次日本地零点，转换写法参照 `local_day_start_utc`，夏令时歧义用 `.single()` 的回退逻辑。图标用 `cached_native_icon(&representative_executable_path)`。在 `lib.rs` 的 `invoke_handler` 注册两个命令。

- [ ] **Step 4：** `cargo test --manifest-path src-tauri\Cargo.toml`，`cargo fmt -- --check`，全部通过。

提交：`feat(commands): expose statistics and achievements summaries`

---

## 任务 3b：软件来去的最低窗口门槛

**文件：** `src-tauri/src/storage.rs`、`src-tauri/tests/statistics_storage_tests.rs`、`src-tauri/src/statistics.rs`、`src-tauri/src/commands.rs`

用户在看过样稿后确认：累计窗口时长（全部历史的 `foreground_seconds` 之和）不满 `COMINGS_GOINGS_MIN_WINDOW_SECONDS`（60 秒）的身份不进新面孔和沉寂软件，避免安装包、临时程序充数。

- [ ] 先写失败测试：59 秒的身份不计入、60 秒恰好计入；新面孔和沉寂两边都覆盖。
- [ ] `software_window_date_bounds` 一并返回累计窗口秒数（或新增一个只读查询，二选一，保持简单），`comings_and_goings` 按常量过滤。
- [ ] `cargo test`、`cargo fmt -- --check` 通过。

提交：`feat(statistics): skip software with under a minute of window time in comings and goings`

---

## 任务 4：前端类型与区间工具

**文件：** `src/api.ts`、`src/statisticsRange.ts`、`src/__tests__/statisticsRange.test.ts`、`src/__tests__/api.test.ts`

- [ ] **Step 1：写失败测试** `statisticsRange.test.ts`（固定 `now`，不依赖系统时间）：
  - 预设 `last7`（默认）：今天 2026-11-21（周六）→ 11-15～11-21；`thisWeek` → 11-16（周一）～11-21；`thisMonth` → 11-01～11-21；`last30` → 10-23～11-21；`thisYear` → 2026-01-01～11-21，但起点不早于 `dataStartDate`（2026-05-29）。
  - `custom` 校验：倒序、超过 366 天、早于数据起点、晚于今天都返回中文错误文案。
  - `percentChange(current, previous)`：previous 为 0 返回 `null`（界面显示「无对比」），否则四舍五入到整数百分比。
  - `splitWeekdayWeekend(days)`：按本地星期拆分（周六、周日为周末），返回两组的日均活跃秒数。均值按区间内该组的全部日子算，没开机的空白日也计入分母；某组在区间内一天都没有时返回 `null`。测试写明这两点。
  - 日期一律按本地时区格式化成 `YYYY-MM-DD`，不用 `toISOString()`（避免 UTC 偏一天）。
- [ ] **Step 2：** `api.ts` 加与任务 3 DTO 一一对应的接口和：

```ts
export async function getStatisticsSummary(args: { start: string; end: string; includeHidden: boolean }) {
  return invoke<StatisticsSummary>("get_statistics_summary", args);
}
export async function getAchievementsSummary(args: { heatmapDays: 90 | 180 | 365; includeHidden: boolean }) {
  return invoke<AchievementsSummary>("get_achievements_summary", args);
}
```

  在 `api.test.ts` 断言命令名和参数（参照现有写法）。
- [ ] **Step 3：** `npm.cmd test`、`npx.cmd tsc --noEmit` 通过。

提交：`feat(api): add statistics range helpers and summary wrappers`

---

## 任务 5：预览演示数据

**文件：** `scripts/ui-preview/mock-data.ts`、`scripts/ui-preview/tauri-core.ts`

- [ ] `mock-data.ts` 加 `statisticsSummary(start, end, includeHidden)` 与 `achievementsSummary(heatmapDays, includeHidden)`，由固定种子生成确定的数据（每次刷新一样）。数据要能演示：早期「无软件明细」的日子、新上榜和名次变化、至少 2 个开着没用、一个连续 12 天的连续记录、一个刚解锁 100 小时的里程碑、一个 6666 小时终极成就（演示用）、新面孔和沉寂软件各 2 个。注释写明是合成数据。
- [ ] `tauri-core.ts` 加两个 `case`；`?empty` 时返回全空；`pageLabels` 加 `statistics: "统计"`、`achievements: "成就"`。
- [ ] 手动：任务 8 接入导航后用 `?page=statistics`、`?page=achievements` 打开。

提交：`build(preview): add statistics and achievements demo data`

---

## 任务 6：统计页界面（等任务 0 选定方向）

**文件：** `src/components/StatisticsPage.tsx`、`src/components/TrendRecorder.tsx`、`src/components/StatisticsLedgers.tsx`、`src/styles.css`、`src/__tests__/StatisticsPage.test.tsx`

布局自上而下：区间选择条 → 趋势主图（唯一主导区） → 两栏台账（排行 | 开着没用） → 会话台账 → 作息面板。不做统计卡片网格。

- [ ] **Step 1：写失败测试**（mock `api.ts`）：
  - 默认请求近 7 天、`includeHidden: false`；切换预设会以新区间重新请求，旧请求晚到的响应不能覆盖新区间（参照 `SoftwarePagePolling.test.tsx` 的过期响应写法）。
  - 读取中显示「正在读取统计…」，失败显示「无法读取统计」，区间内没有任何记录显示空状态文案。
  - 趋势区显示区间记录与活跃合计、日均、环比；`system_comparison_available == false` 时显示「无对比」而不是 0%。
  - 排行行显示名次变化：`is_new` →「新上榜」，上升/下降显示箭头与名次差，文字可被读屏读到（不只靠颜色）。
  - `days_without_software_detail > 0` 时，排行、开着没用、会话上方显示「区间内有 N 天无软件明细」。
  - 开着没用为空时显示「这段时间没有开着不用的软件」。
  - 打开「包含隐藏软件」开关后以 `includeHidden: true` 重新请求。
  - 时长都经过 `formatDurationZh`，遵守设置里的时长格式。
- [ ] **Step 2：实现。**
  - `StatisticsPage`：持有区间状态与开关，`startVisiblePolling(refresh, 60_000)`（区间含今天，数据会涨）；区间或开关变化立即刷新。
  - 区间选择：六个按键（近 7 天、本周、本月、近 30 天、今年、自定义），当前项用凹陷面板样式；自定义展开两个 `<input type="date">`，`min` 为数据起点、`max` 为今天，校验文案来自 `statisticsRange.ts`。
  - `TrendRecorder`：纯 SVG，按任务 0 选定方向实现。每天一组柱（记录、活跃），活跃率折线，日均虚线；无软件明细的日子不影响这里（机器数据完整）。可访问性：`role="img"` + `aria-label` 汇总句，另附一个视觉隐藏的 `<table>` 列出逐日数据。
  - `StatisticsLedgers`：台账样式沿用 `AppUsageTable`（软件名与图标、右对齐数字、行线、悬停）。作息面板显示工作日 / 周末日均活跃、日均开机时长（`tracker_uptime_seconds`）、最早与最晚记录的中位时间（`HH:MM`，本地时区）。
- [ ] **Step 3：** `npm.cmd test`、`npx.cmd tsc --noEmit` 通过。

提交：`feat(statistics): add the statistics page`

---

## 任务 7：成就页界面（等任务 0 选定方向）

**文件：** `src/components/AchievementsPage.tsx`、`src/components/ActivityHeatmap.tsx`、`src/components/MilestoneShelf.tsx`、`src/styles.css`、`src/__tests__/AchievementsPage.test.tsx`

布局：液晶屏（热力图 + 连续天数读数，主导区） → 个人纪录 → 里程碑铭牌 → 软件来去。

- [ ] **Step 1：写失败测试：**
  - 默认请求 `heatmapDays: 90`；切到 180、365 重新请求。
  - 热力图格子数等于 `heatmap.length`，每格 `aria-label` 形如「2026-11-21 活跃 2.7小时」；按 4 级深浅分档，分档阈值写在组件里并测试（建议：0、<1 小时、<3 小时、≥3 小时）。
  - 连续天数读数显示当前与最长，说明文字按设计草案「用词」一节写成过滤说明（「活跃不到 5 分钟的日子不算在内，免得开机看一眼也被记上」，分钟数取自 `streak_threshold_seconds`）。图例、每月小字、区间合计用「用过 / 没用」「用过 N 天」，测试断言页面上不出现「达标」二字，也没有「今天还差」之类的提示。
  - 里程碑：已达成显示最高档与解锁日期，未满档显示到下一档的进度；6666 小时显示「终极成就」。
  - 软件来去为空时各自显示空文案；包含隐藏软件开关同统计页。
  - 三态文案：「正在读取成就…」「无法读取成就」。
- [ ] **Step 2：实现。** 热力图在 `.lcd-window` 内，用像素字体，点阵纹理只在液晶屏里；格子按周排成列（7 行），列顶标月份。成就页不轮询，挂载和切换时读取一次，页面重新可见时刷新一次（用 `startVisiblePolling` 配长间隔即可，如 5 分钟）。
- [ ] **Step 3：** `npm.cmd test`、`npx.cmd tsc --noEmit` 通过。

提交：`feat(achievements): add the achievements page`

---

## 任务 8：接入导航

**文件：** `src/App.tsx`、`src/__tests__/App.test.tsx`

- [ ] 测试先改：未开放按钮列表去掉「统计」「成就」，保留「时间轴」等；点击「统计」后标题为「统计」且 `aria-current="page"`；「成就」同理。
- [ ] `PageId` 加 `"statistics" | "achievements"`，`pageTitles` 加两项，导航项 `available: true`。两页用 `lazy()` 懒加载，悬停/聚焦预热，写法照搬软件页；`Suspense` 回退沿用现有文案风格。
- [ ] 页头日期按钮与导出按钮保持未完成占位，不在本计划内改动。
- [ ] `npm.cmd test`、`npm.cmd run build` 通过。

提交：`feat(nav): open the statistics and achievements pages`

---

## 任务 9：文档

- [ ] `DESIGN.md`：Components 加「走纸记录仪趋势图」「液晶点阵热力图」「里程碑铭牌」，Layout 加两页布局；保持「不做统计卡片网格」。
- [ ] `PRODUCT.md`：页面列表加入统计、成就，未开放项只剩时间轴等。
- [ ] `docs/CURRENT_STATE.md`：统计口径表加统计页与成就页的行（焦点 / 窗口 / 活跃的选用、开着没用阈值、里程碑档位、连续天数门槛、软件明细起点）。
- [ ] `CHANGELOG.md`：新增 `## Unreleased`，写用户能看到的变化。版本号与发布另做，不在本计划内。
- [ ] 设计草案状态行改为「已实现，待发布」。

提交：`docs: document the statistics and achievements pages`

---

## 任务 10：整体验收

- [ ] `npm.cmd run check`（前端测试、构建、`cargo fmt --check`、`cargo test`、`npm audit`）全部通过。
- [ ] 预览（`.claude/launch.json` 的 `ui-preview-statistics`，端口 1451）：两页在 1440×900 与 1180×760、浅色与深色、`?empty` 下截图；控制台无错误；窄窗口无横向滚动。
- [ ] 真实数据只读核对：把生产库复制到 scratchpad，用 SQL 独立算出近 30 天的开着没用榜和焦点里程碑，和 `*_from_store` 在同一份副本上的输出逐项对比。不写生产库。
- [ ] 性能：在副本上测两个命令的耗时，各自应在 200 ms 内；超过则先加索引方案并另行讨论（会改 schema，不在本计划内直接做）。
- [ ] 按 `AGENTS.md` 的审查关口做规格符合性与代码质量审查，修完再收尾。
