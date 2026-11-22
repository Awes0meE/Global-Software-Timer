# 时间轴逐段数据采集设计草案

状态：草案，产品决定已确认（2026-11-22），待实现；对应版本 v0.3.1。三步发布的第一步：v0.3.1 只采集数据，v0.4.0 换视觉（`2026-11-22-glass-eink-redesign-design.md`），v0.5.0 开放时间轴页（`2026-11-22-timeline-page-design.md`）。本规格取代 `2026-11-20-half-hour-timeline.md`（半小时桶）。

## 目标与范围

在 tracker 每次 tick 的同一个事务里，把已认可的秒数按「段」记下来：哪段时间、哪个软件拿着前台焦点、机器是否活跃；另按软件身份记下哪段时间「有窗口」（状态 `Foreground`，区别于托盘）。窗口状态事后无法回填，v0.5.0 图标坞的「有窗口 M 个」和视窗台账的「窗口开着」列要用。目的是尽早在用户本机积累数据，v0.5.0 的时间轴页直接读取。

| 做 | 不做 |
| --- | --- |
| 新表 `timeline_segments`、`timeline_window_spans`，schema 2 → 3 | 改旧表、回填历史（历史日期在 v0.5.0 只显示运行泳道） |
| tick 内写段和窗口段，与日汇总共用 gap / 回拨 / 空闲 / 窗口状态判定 | 改现有日汇总、会话的记法 |
| 只读命令 `get_timeline_summary` 及测试 | 前端调用、`api.ts` 包装、预览替身、任何界面变化（v0.5.0 再加） |
| 永久保留 | 自动清理、导出、按时刻看后台进程 |
| PRIVACY.md 等文档同步 | 采集窗口标题、文档名、网页标题、按键、鼠标坐标；联网、遥测、管理员权限 |

时间轴页的交互样稿在 `F:\XJTLU\科研_DIY\Global_Software_Timer\local-mockups-2026-11-22-timeline\`（仓库外、不入库，含第三方图标），本版不涉及界面，只作数据需求参照。

## 存储：`timeline_segments`

沿用 `storage.rs` 的约定：时刻是 UTC RFC 3339 文本，日期是本地 `YYYY-MM-DD` 文本，外键开启。

```sql
CREATE TABLE IF NOT EXISTS timeline_segments (
    id INTEGER PRIMARY KEY,
    usage_date TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    end_utc TEXT NOT NULL,
    credited_seconds INTEGER NOT NULL,
    focus_identity_key TEXT REFERENCES software_identities(identity_key),
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    start_reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS timeline_segments_date_idx ON timeline_segments(usage_date, start_utc);
```

| 列 | 含义 |
| --- | --- |
| `usage_date` | 段所属本地日期，与 `credited_days` 的拆分一致；一段不跨本地午夜 |
| `start_utc` / `end_utc` | 段在时间上的位置。固定写成毫秒精度、`+00:00` 结尾（`to_rfc3339_opts(SecondsFormat::Millis, false)`），文本顺序即时间顺序；现有 `parse_utc` 能读 |
| `credited_seconds` | 本段累计认可的整秒数，是所有求和的依据 |
| `focus_identity_key` | 拿焦点的软件身份键；没有可计入的前台软件时为 NULL |
| `is_active` | 本段机器是否活跃（五分钟键鼠空闲门槛） |
| `start_reason` | 新开本段的原因：`tracker_started`、`scan_gap`、`clock_rollback`、`day_changed`、`focus_changed`、`activity_changed` |

- `end_utc - start_utc` 与 `credited_seconds` 在正常 tick 下相差不到 1 秒（小数秒结转造成，tracker.rs:322-339）；系统时钟小幅前跳（10 秒以内，不算长间隔）时，跨度会比认可秒数多出几秒。同理，新开段的起点与上一段终点之间可能有不足 1 秒的重叠或缝隙，展示层按 1 秒容差视为相接。展示位置用起止时刻，时长和等式一律用 `credited_seconds`。
- `start_reason` 只是技术标记，不含任何内容信息。v0.5.0 用它合并相邻段、区分「重启前后」「长间隔」这类空白。
- 不给 `focus_identity_key` 单独建索引：只有启动时身份合并会按它更新，合并很少发生。

## 存储：`timeline_window_spans`

每个软件身份「有窗口」的区间，约定同上。

```sql
CREATE TABLE IF NOT EXISTS timeline_window_spans (
    id INTEGER PRIMARY KEY,
    usage_date TEXT NOT NULL,
    identity_key TEXT NOT NULL REFERENCES software_identities(identity_key),
    start_utc TEXT NOT NULL,
    end_utc TEXT NOT NULL,
    credited_seconds INTEGER NOT NULL,
    start_reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS timeline_window_spans_date_idx ON timeline_window_spans(usage_date, start_utc);
```

| 列 | 含义 |
| --- | --- |
| `usage_date` / `start_utc` / `end_utc` / `credited_seconds` | 与 `timeline_segments` 同义、同格式；一行不跨本地午夜 |
| `identity_key` | 有窗口的软件身份，不可空 |
| `start_reason` | `tracker_started`、`scan_gap`、`clock_rollback`、`day_changed`、`window_opened`（软件新出现时就有窗口，或从托盘 / 后台变成有窗口） |

- 「有窗口」就是 tracker 判为 `Foreground` 的状态（tracker.rs:188-196：不是后台助手且 `has_visible_window`），即任务栏 / Alt+Tab 规则认可的窗口（window_info.rs），最小化和在别的虚拟桌面上的窗口也算；只看窗口样式、尺寸和类名，不读标题。与统计页「开着没用榜」读的 `daily_software_runtime_usage.foreground_seconds` 是同一个判定。
- 只记有窗口的时段；托盘、后台、退出都不写行，区间到最后一个有窗口的 tick 为止。关闭原因不存，与段一样。
- 一个身份同一时刻至多一行在延长；身份合并后同一身份可能有时间重叠的两行（两个版本同时开着窗口），不合并。索引与段相同，不给 `identity_key` 单独建索引（理由同上）。

## 迁移 2 → 3

- `storage.rs:49` 的 `SCHEMA_VERSION` 改为 3，注释补「3 adds `timeline_segments` and `timeline_window_spans`」。
- `migrate()` 在现有 savepoint 内追加 `if version < 3 { self.create_timeline_tables()?; }`，位置在 `create_background_usage_table` 之后、写 `user_version` 之前。两张表和两个索引一起建，只新增，`CREATE ... IF NOT EXISTS`，可重复执行。
- 身份合并：`merge_software_identity`（storage.rs:425）在删除旧键（storage.rs:491-503 的循环）之前，加两句 `UPDATE timeline_segments SET focus_identity_key = ?new WHERE focus_identity_key = ?old` 和 `UPDATE timeline_window_spans SET identity_key = ?new WHERE identity_key = ?old`。否则外键会让删除 `software_identities` 失败，启动迁移整体回滚。段和窗口段都不做 86400 封顶，也不合并相邻或重叠行。合并只在启动迁移里发生（storage.rs:137），那时内存游标还是 `Fresh`，不会留下指向旧键的游标。
- 升级后再装回 v0.3.0 会因 `user_version = 3` 拒绝打开数据库（现有 `UnsupportedSchemaVersion` 提示）。发布说明要写明。

## 写入规则

**位置**：`run_tracker_tick_with_foreground`（tracker.rs:297）里 `for (date, seconds, recorded_at) in credited_days(...)` 循环（tracker.rs:357），每个日期块写完焦点汇总之后调用新函数 `record_timeline_chunk(store, &mut next.timeline, date, chunk_start, seconds, focus_key, is_active, &windowed_keys)`。焦点键直接复用循环里 `upsert_software_identity_for_app(app_id)` 的返回值，没有前台软件时为 `None`。`windowed_keys` 是 `record_daily_software_runtime_usage`（tracker.rs:407）本块按身份合并后状态为 `Foreground` 的身份键：该函数的返回值由 `()` 改为这组键（排序后返回），它写 `foreground_seconds` 用的正是同一个 `status_by_identity`（tracker.rs:414-433，同一身份多个进程 / 版本取最高状态），所以窗口段与该列来源相同。整个过程在同一个 `store.savepoint()` 内，commit 之后才替换内存状态。

**内存游标**：`TrackingState`（tracker.rs:37）新增 `timeline: TimelineCursor`，不持久化。它有两部分：段的状态（下表）和窗口表 `windows: HashMap<identity_key, window_span_id>`：

| 状态 | 含义 | 何时进入 |
| --- | --- | --- |
| `Fresh`（默认） | 本进程还没写过段 | 进程启动 / `AppState::new` 重建 tracker |
| `AfterBreak(reason)` | 上一段之后出现了缺口 | 某个 tick 的 `break_reason` 为 `scan_gap` / `clock_rollback`，且游标不是 `Fresh`（已是 `AfterBreak` 时换成本次原因） |
| `Open { segment_id, usage_date, focus_identity_key, is_active }` | 可以被延长的最后一段 | 每次写段之后 |

`Fresh` 遇到 break 仍保持 `Fresh`，原因记为 `tracker_started`。进入 `AfterBreak` 时窗口表清空；`Fresh` 时窗口表本来就是空的。

**每个日期块**（`chunk_start = recorded_at`，`chunk_end = chunk_start + seconds`）：

| 条件（按顺序判断） | 动作 | `start_reason` |
| --- | --- | --- |
| 游标 `Open`，且日期、焦点键、`is_active` 都相同 | 延长：`end_utc = chunk_end`，`credited_seconds += seconds` | — |
| 游标 `Fresh` | 新开一段，起点 `chunk_start` | `tracker_started` |
| 游标 `AfterBreak(r)` | 新开 | `r` |
| 日期不同 | 新开 | `day_changed` |
| 焦点键不同（同时活跃也变了也记这一条） | 新开 | `focus_changed` |
| 只有活跃状态不同 | 新开 | `activity_changed` |

新开或延长后游标变为 `Open`。认可 0 整秒的 tick（不产生日期块）不动游标，也不动窗口表。

**窗口段**（同一日期块内，在更新段游标之前先记下本块的断点原因）：

| 写段前的游标 | 本块断点原因 |
| --- | --- |
| `Fresh` | `tracker_started` |
| `AfterBreak(r)` | `r` |
| `Open`，日期不同 | `day_changed` |
| `Open`，日期相同 | 无 |

| 条件 | 动作 | `start_reason` |
| --- | --- | --- |
| 本块有断点原因 `r` | 先清空窗口表；`windowed_keys` 里每个身份新开一行 | `r` |
| 无断点，身份在窗口表里 | 延长那一行：`end_utc = chunk_end`，`credited_seconds += seconds` | — |
| 无断点，身份不在窗口表里 | 新开 | `window_opened` |

写完后窗口表只保留本块 `windowed_keys` 里的身份（新开的记新 id）；不在其中的身份（变成托盘、后台，或软件已退出）直接移出，不写库，它的行停在上一块的 `chunk_end`。所以窗口表里的每一行都是上一个日期块写过的，「同日、时间连续、仍有窗口」三条由这个不变式保证，不必另存日期。跨午夜的 tick 有两个日期块，第二块的断点原因是 `day_changed`，每个有窗口的身份在两天各一行。

焦点切换、活跃 ↔ 空闲切换不影响窗口段。

**与现有判定的关系**：

| 情形 | 现有日汇总 | 段 |
| --- | --- | --- |
| 两次 tick 间隔 ≤ 10 秒 | 正常认可 | 同焦点同活跃时延长 |
| 长间隔（墙钟或单调时钟 > 10 秒，含睡眠恢复） | break tick 认可 0 秒，在上次心跳处关会话 | 不写段；游标进入 `AfterBreak(scan_gap)`，下一 tick 新开 |
| 时钟回拨 | 同上，原因 `clock_rollback` | 同上；新段可能与回拨前的段在时间上重叠 |
| 空闲超过 5 分钟 | `active_seconds` 记 0，焦点照记 | `is_active = 0` 新开段，焦点键照记 |
| 应用重启 / 开机自启 | 启动时恢复未关会话 | 游标为 `Fresh`，绝不延长重启前的段 |
| 正常退出 `Tracker::shutdown` | 在心跳处关会话，`stopped = true` | 不需要额外写入 |
| tick 失败（任一写入出错） | savepoint 回滚，内存状态不替换 | 段的插入或延长一起回滚，游标保持 tick 之前的值 |
| 启动后第一个 tick | 认可约 5 秒（未观测过的首次 sleep） | 同样写入，`tracker_started` |

窗口段在上表每种情形下都与段同进同退：长间隔、回拨、重启后所有有窗口的身份新开一行（原因同段），空闲不拆，失败一起回滚（窗口表在 `next` 里，不提交就不替换）。break tick 认可 0 秒，`foreground_seconds` 和窗口段都不增加。

## 跨午夜与夏令时

- **写入时就按本地日期拆段**，不在查询时裁剪。理由：日汇总由 `credited_days`（tracker.rs:387）逐秒按注入时区算本地日期再分组，段直接用同一组日期块，所以每天的段之和与日汇总逐秒相等；查询只需 `WHERE usage_date = ?`，不必在读取端再做时区换算。
- 跨午夜的连续使用在两天各有一段，后一段 `start_reason = day_changed`，v0.5.0 可据此显示「接昨天」。
- 夏令时：日期按每一秒所在的本地日期决定，23 / 25 小时的日子自然得到实际长度；重复的本地时刻用不同的 UTC 区分。生产环境用 `Local`，测试注入时区。
- 命令返回的当天起止 `day_start` / `day_end` 沿用 `local_date_start_utc` 的口径（歧义午夜取较早，跳过的午夜取第一个存在的整点）。为了能测，新增泛型版 `local_date_bounds_in<Tz: TimeZone>(date, &tz)`，`local_date_start_utc` 改为调用它，行为不变。
- 用户改了系统时区：已写的段保持写入时的日期，与日汇总一致；这类段可能超出按现时区算的 `day_start` / `day_end`，命令不裁剪段（裁剪会破坏等式），原样返回。

## 隐藏软件与过滤进程

- 采集不看隐藏列表：隐藏软件照常记焦点键，与「隐藏只影响展示，不扣除机器级总数」的口径一致（docs/CURRENT_STATE.md 第 42、53 行）。
- 焦点键为 NULL 的情形与焦点日汇总完全相同（tracker.rs:353-355）：`GetForegroundWindow` 为空；前台进程被分类为 `Hidden`（系统进程、`C:\Windows` 下程序、已知后台助手、Temp / Downloads / 更新器路径）；前台进程状态是 `Background`；前台 PID 不在本次快照里。锁屏本身不停止认可。
- 托盘状态的进程拿到焦点时照记焦点键，与 `daily_software_focus_usage` 一致。
- 窗口段同样不看隐藏列表；`Hidden` 分类进程不进状态表，后台助手和无窗口无托盘的进程是 `Background`，都不记窗口段，与 `foreground_seconds` 一致。
- 展示层过滤由读取命令的 `include_hidden` 参数负责，见下节。

## 读取命令 `get_timeline_summary`

`#[tauri::command(async)] get_timeline_summary(state, date: String, include_hidden: bool) -> Result<TimelineSummary, String>`，在 `lib.rs` 注册；薄包装 `timeline_summary_from_store(&Store, date, include_hidden, now)`，用 `summary_store` 只读连接加 savepoint 取一致快照。`date` 用 `parse_local_date` 严格校验，不合法返回 `timeline_invalid_date`。v0.3.1 界面不调用。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `date` | `String` | 本地日期 |
| `day_start` / `day_end` | RFC 3339 | 当天两个本地午夜对应的 UTC |
| `generated_at` | RFC 3339 | 查询时刻，v0.5.0 画「此刻」用 |
| `day_status` | `String` | `before_collection`：早于第一段所在日期，或表里没有任何段；`collection_started`：第一段所在的那天（只有升级之后的部分）；`collected`：之后的日子（没开机的日子段为空） |
| `collection_started_at` | `Option<String>` | 全表第一段的 `start_utc`，按索引取 |
| `first_recorded_date` | `Option<String>` | 本机最早有记录的本地日期（`daily_system_usage` 的最小日期），v0.5.0 用作 ◀ 的下限；空库为 `null` |
| `segments` | 数组 | 原始行：`start`、`end`、`seconds`、`focus_identity_key`、`focus_hidden`、`is_active`、`start_reason`，按 `start_utc, id` 排序 |
| `focus_segments` | 数组 | 焦点带：把 `start_reason = activity_changed` 的行并入按 `id` 的前一行（回拨后按 `start_utc` 排序的前一行可能不是它的真前驱）；字段 `start`、`end`、`seconds`、`focus_identity_key`、`focus_hidden` |
| `active_segments` | 数组 | 活跃带：把 `start_reason = focus_changed` 且 `is_active` 相同的行并入按 `id` 的前一行；字段 `start`、`end`、`seconds`、`is_active` |
| `running` | 数组 | 每个软件身份一组「开着」区间和「有窗口」区间，见下 |
| `software` | 数组 | 上面出现过的每个身份：`identity_key`、`display_name`、`icon_url`（复用 `SoftwareLabels`）、`is_hidden`（`hidden_software_identity_keys`） |

**运行区间**（`running[]`：`identity_key` + `intervals: [{start, end, open}]` + `window_intervals: [{start, end}]` + `window_seconds`）：

- 来自 `usage_sessions`，经 `software_identity_members USING (app_id)` 归到身份；取与 `[day_start, day_end)` 重叠的会话，未关会话以 `last_heartbeat_at` 为终点并标 `open: true`；裁剪到当天；同一身份的重叠会话（多个版本、WPS 组件）取并集。
- 重叠条件是 `started_at < day_end` 且 `COALESCE(ended_at, last_heartbeat_at) >= day_start`。不能照搬 `sessions_started_between` 只按开始时间筛：托盘常驻软件一次会话能跨好几天，开始于前天的会话也要取到。两端文本条件各放宽一天作粗筛，再在解析后的时刻上精确判断。
- 边界与合并：裁剪后 `end <= start` 的已关区间丢弃（例如恰好在 `day_start` 结束的会话不产生条目），未关会话的零长度区间保留；同一身份取并集时只要有一个会话未关，合并后的区间就标 `open: true`。`running[]`、`software[]` 按 `identity_key` 升序返回，时刻格式与存储相同（毫秒精度、`+00:00`）。
- 过滤与概览软件列表一致：跳过 `apps.is_hidden = 1` 和当前分类器判为 `Hidden` 的应用。
- **窗口 / 托盘**：会话覆盖「有窗口或托盘」整段，状态切换不拆会话，所以 `intervals` 本身分不出窗口和托盘。v0.3.1 起由 `window_intervals` 给出有窗口的时段：取 `timeline_window_spans WHERE usage_date = ?`，同一身份按 1 秒容差取并集（合并版本后的重叠行、相接的行），再裁剪到 `[day_start, day_end)`。「开着但不在 `window_intervals` 里」= 托盘运行。`window_seconds` 是该身份当天各行 `credited_seconds` 之和，不裁剪、不去重，等于 `foreground_seconds`（见等式口径）。`day_status = before_collection` 的日子 `window_intervals` 恒为空数组、`window_seconds` 为 0，含义是「没有记录」，不是「没有窗口」；这些日子 v0.5.0 只用 `intervals` 判断「开着」，不分有窗口和托盘。`Background` 状态不建会话，所以运行区间里没有纯后台进程。
- `running[]` 的条目取「有会话区间或有窗口段」的身份并集。窗口段按身份过滤：该身份至少有一个成员应用通过上一条的应用过滤（`apps.is_hidden = 0` 且当前分类器判为 `Tracked`）才返回，否则窗口段和会话区间一起不出现。

**`include_hidden = false`**：隐藏身份的整个 `running[]` 条目（含 `window_intervals`）和 `software` 条目去掉；它们的焦点段保留时长，`focus_identity_key` 置为 `null`、`focus_hidden = true`，这样机器级总数不变，也不泄露名字。`true` 时原样返回，`focus_hidden` 都为 `false`。v0.5.0 页面把这类段画成无名称的「已隐藏软件」中性段（页面规格「已定」4）。

## 等式口径

对 `day_status = collected` 的每一天 $D$（不含升级当天）：

| 等式 | 左边（段） | 右边（日汇总） |
| --- | --- | --- |
| 记录 | $\sum$ `credited_seconds` | `daily_system_usage.recorded_seconds`（= `tracker_uptime_seconds`） |
| 活跃 | $\sum$ `credited_seconds`，`is_active = 1` | `daily_system_usage.active_seconds` |
| 焦点（每个身份 $k$） | $\sum$ `credited_seconds`，`focus_identity_key = k` | `daily_software_focus_usage.focused_seconds`（$D$, $k$） |
| 窗口（每个身份 $k$） | $\sum$ `timeline_window_spans.credited_seconds`，`identity_key = k` | `daily_software_runtime_usage.foreground_seconds`（$D$, $k$） |

四条都应逐秒相等，因为段、窗口段和日汇总在同一个 savepoint、按同一组日期块写入。`foreground_seconds` 本来就按身份记（不是按 `app_id`）：tracker 每块先把各 `app_id` 的状态按身份取最高（tracker.rs:414-426），身份为 `Foreground` 就加本块秒数，窗口段用的正是这组身份，所以同一身份的多个窗口进程、多个版本每秒只算一次，两边口径相同。统计页「开着没用榜」的窗口时长就是这一列（storage.rs:1882 `software_window_seconds_range`），所以窗口段与它对得上。可以合理不等的情况：

- 升级当天（`collection_started`）：段和窗口段只有升级之后的部分，左边 < 右边。
- 身份合并：焦点汇总按天封顶 86400（storage.rs:461），`foreground_seconds` 同样封顶（storage.rs:444），段和窗口段不封顶。只有合并后一天超过 86400 秒才会触发：两个版本同时开着窗口、时钟回拨造成重复认可，或 25 小时的夏令时日。
- 焦点为 NULL 的段只进「记录」和「活跃」两式，不进任何软件的焦点式；所以 $\sum_k$ 焦点 ≤ 记录，差额就是没有可计入前台软件的时间，不是误差。
- 窗口式没有机器级对应：同一时刻可以有多个软件开着窗口，$\sum_k$ 窗口可以大于记录秒数。
- `daily_app_usage.active_seconds` 按 `app_id` 记、`runtime_seconds` 已是遗留列，不作为等式对象。

## 体量估算

每行约 250 字节：`usage_date` 10、两个时刻各 29、身份键约 40–80（`app:` 加小写路径）、原因约 13、整数和记录头约 15，加上索引项约 50 字节和页面填充损耗。

$$
\text{每天字节} \approx N_{\text{段}} \times 250\,\text{B}
$$

演示值：每天 400 段约 100 KB，一年约 36 MB。上限：每个 tick 最多新开 2 段（跨午夜时），每天最多约 17,300 段，约 4 MB。

窗口段每行大小与段相近（身份键不可空，没有 `is_active`），也按 250 字节算。行数只随窗口开合和断点增加，不随焦点、活跃切换增加：

$$
N_{\text{窗口段}} \approx \sum_k O_k + N_{\text{断点}} \times W
$$

$O_k$ 是软件 $k$ 当天从无窗口变成有窗口的次数，$N_{\text{断点}}$ 是长间隔、回拨、重启和跨午夜的次数，$W$ 是断点时开着窗口的软件数。演示值：20 个软件各开合 8 次、10 次断点 × 8 个窗口，约 240 行、60 KB/天，一年约 22 MB；与段合计约 160 KB/天、约 58 MB/年，比决策书估的约 100 KB/天、约 30 MB/年多，多出的就是窗口段。理论上限：每个有窗口的身份每 tick 最多新开 1 行（跨午夜 2 行），每天约 $17{,}300 \times W$ 行；这要求窗口每 5 秒开合一次，实际达不到。

实测方法：在只读副本的再复制品上记下文件大小，`DROP TABLE timeline_segments; DROP TABLE timeline_window_spans; VACUUM;` 后再比（也可以分两步各 DROP 一张，分别得到两表体量）；行数用 `SELECT usage_date, COUNT(*) FROM timeline_segments GROUP BY usage_date`，窗口段同理。

## 测试（先写失败测试）

`tests/tracker_tests.rs`（沿用 `FakeProcessSource`、`FakeActivitySource`、`FakeForegroundWindowSource`、`NamedTempFile`）：

1. 同焦点同活跃的连续 tick 只有一行，`credited_seconds` 累加，`end_utc` 为最后一个 tick 的 `now`。
2. 任意时刻边界：非整秒的 `now` 和 5.5 秒 tick，段秒数之和等于日汇总，`|跨度 − 秒数| < 1`；跨整点（如 09:59:58 → 10:00:03）不拆段。
3. 焦点切换开新段，`focus_changed`；焦点与活跃同时变化也只记 `focus_changed`。
4. 活跃 ↔ 空闲切换开新段，`activity_changed`，焦点键不变。
5. 没有前台、前台是 `Hidden` 分类进程、前台是 `Background` 状态进程：焦点键为 NULL。
6. 隐藏列表里的软件照记焦点键；托盘状态进程拿焦点照记。
7. 跨午夜：`FixedOffset` +08:00，00:00:02 的 5 秒 tick 拆成前一天 3 秒、当天 2 秒两行，后一行 `day_changed`。
8. 夏令时：测试里实现一个有固定切换点的 `chrono::TimeZone`（不引入 `chrono-tz`），覆盖拨快和拨慢各一次，段日期与 `daily_system_usage` 一致；同时测 `local_date_bounds_in` 得到 23 / 25 小时。
9. 长间隔：墙钟间隔 > 10 秒、`tick_duration` > 10 秒、3600 秒的睡眠 tick，都不写段，下一 tick 新开 `scan_gap`；恰好 10 秒仍延长。
10. 时钟回拨：新开 `clock_rollback`，允许与之前的段重叠。
11. 事务回滚：用触发器让 `timeline_segments` 的插入或更新失败，整个 tick 回滚（日汇总、会话心跳都没写），游标不变，下一 tick 正常延长；反过来让 `daily_system_usage` 写入失败，也不留段。
12. 重启：同一数据库新建 tracker，焦点和活跃都没变、间隔不到 10 秒，也新开 `tracker_started`。
13. `shutdown` 之后的 tick 不写段。
14. 等式性质测试：一段固定种子的混合 tick 序列（切换、空闲、间隔、回拨、跨午夜），逐日检查三条等式。

`tests/storage_reliability_tests.rs` / `storage_tests.rs`：

15. 迁移把 `user_version` 写成 3（现有断言里的字面量 2 改为 3），两张新表和两个索引都存在，旧数据不变，可重复执行；拒绝更高版本、失败迁移整体回滚两条测试覆盖新表。
16. 身份合并把段的焦点键改到新键，外键不报错。

`src/commands.rs` 的 `mod tests`：

17. 非法日期返回 `timeline_invalid_date`；空库返回 `before_collection` 和空数组。
18. `day_status` 三种取值；`collection_started_at` 正确。
19. `focus_segments` / `active_segments` 的合并规则；`segments` 排序。
20. 运行区间：跨天会话被裁剪、三天前开始仍在运行的会话也被取到、同身份重叠会话取并集、未关会话以心跳为终点、`Hidden` 分类应用被跳过。
21. `include_hidden = false` 时隐藏身份的区间消失，焦点段变成 `null` + `focus_hidden`，段秒数之和不变。
22. 只读连接（`Store::open_read_only`）可以执行。

窗口段，`tests/tracker_tests.rs`：

23. 有窗口 → 托盘：连续有窗口的 tick 只有一行，`credited_seconds` 累加；变成托盘后该行停在最后一个有窗口 tick 的 `now`，托盘期间不写行（焦点段照记）；再变回有窗口新开 `window_opened`。软件退出再打开同样新开 `window_opened`。
24. 同一 tick 多个有窗口的软件各自一行、同起止；同一身份两个进程 / 两个版本（一个有窗口、一个托盘）只记一行；后台助手、无窗口无托盘进程、`Hidden` 分类进程不记；隐藏列表里的软件照记。
25. 重启：同一数据库新建 tracker，窗口没变、间隔不到 10 秒，每个有窗口的身份也新开 `tracker_started`。
26. 长间隔与回拨：所有有窗口的身份新开 `scan_gap` / `clock_rollback`，break tick 不写行；恰好 10 秒仍延长；焦点切换、活跃 ↔ 空闲切换不拆窗口段。
27. 跨午夜：`FixedOffset` +08:00，00:00:02 的 5 秒 tick 让每个有窗口的身份拆成前一天 3 秒、当天 2 秒两行，后一行 `day_changed`。
28. 事务回滚：触发器让 `timeline_window_spans` 的插入或更新失败，整个 tick 回滚（段、日汇总、会话心跳都没写），窗口表不变，下一 tick 正常延长。
29. 等式：测试 14 的混合序列加入窗口 / 托盘切换和多个同时有窗口的软件，逐日逐身份检查 $\sum$ 窗口段 = `foreground_seconds`；夏令时（测试 8 的时区）也走一遍。

窗口段，`tests/storage_reliability_tests.rs` / `storage_tests.rs`：

30. 身份合并把窗口段的身份键改到新键，外键不报错；两个旧身份在时间上重叠的窗口段都保留。

窗口段，`src/commands.rs` 的 `mod tests`：

31. `window_intervals`：按 `usage_date` 取、裁剪到当天、同身份重叠或相接的行取并集；`window_seconds` 等于当天 `foreground_seconds`；成员应用都被过滤（`apps.is_hidden = 1` 或当前分类器判为 `Hidden`）的身份，窗口段也不出现；`before_collection` 的日子为空数组和 0。
32. `include_hidden = false` 时隐藏身份的 `window_intervals` 随 `running[]` 条目一起去掉；`true` 时保留。

检查：`cargo test --manifest-path src-tauri\Cargo.toml`、`cargo fmt --manifest-path src-tauri\Cargo.toml -- --check`、`npm.cmd run check`。

## 本机验收（只用副本）

生产库 `%APPDATA%\com.globalsoftwaretimer.app\global-software-timer.sqlite3` 只以只读方式打开，用 SQLite 的 `VACUUM INTO` 或备份接口复制到 scratchpad（包含 WAL 内容），之后只动副本。开发版与安装版共用同一个数据目录，验收期间不要用开发版直接连生产库运行。

1. **发布前**：`#[ignore]` 测试 `real_database_timeline_acceptance`（`GST_BENCH_DB` 指向可写的副本）迁移副本，确认 `user_version = 3`、旧表行数与内容校验和不变；对若干历史日期调用 `timeline_summary_from_store`，得到 `before_collection` 和非空运行区间；热态耗时在 200 ms 内。
2. **装上 v0.3.1 满两个完整日后**：再取副本，用独立 SQL 逐日核对四条等式（窗口式逐身份），不一致的天数应为 0；按「体量估算」分别记录两张表每天的行数和字节数。
3. 记进 `docs/CURRENT_STATE.md` 的只有通过与否、天数、体量，不写软件名和时长。

## 文档与发布要更新的地方

| 文件 | 改动 |
| --- | --- |
| `PRIVACY.md` | 各处 `v0.3.0` 改为 `v0.3.1`；records 列表加逐段记录和窗口时段两条；仿 `## Local icon cache` 另起 `## Timeline segments`：存在同一 SQLite 库、5 秒采样、只有起止时刻、身份键、活跃布尔值和技术原因码（technical reason codes，如重启、长间隔、跨午夜）；另记每个软件哪段时间有窗口（只看任务栏 / Alt+Tab 窗口是否存在，不读窗口标题、不记是哪个窗口）；永久保留不自动清理、不含标题按键坐标 |
| `docs/CURRENT_STATE.md` | 第 3 行版本句；第 11 行 schema 2 → 3、只新增不回填；口径表加「时间轴段」「窗口段」与四条等式；第 63–64 行把「半小时分时数据」改为「逐段数据已采集、页面未开放」；发布与验收记录 |
| `CHANGELOG.md` | 顶部新增 `## Unreleased`（现在没有），写英文条目，参照第 62 行的写法，例如 `Recorded a local timeline of focus and activity segments, and of when each software had a window, in the new timeline_segments and timeline_window_spans tables (schema version 3); nothing in the UI changes yet.` |
| `AGENTS.md` | v0.3.0 小节后加 `v0.3.1 additionally includes:`：逐段表和窗口段表、schema 3、永久保留、只读命令界面不调用、隐藏软件照记、Keep `PRIVACY.md` in step，并链接本规格 |
| `README.md` | 隐私表「会记录」一栏（含有窗口的时段）；架构存储一行加逐段记录和窗口段；`Get-FileHash` 文件名 |
| `memory.md` | Latest published release、Current Repository State（schema 3）、Release State、Privacy Decisions；第 68 行星期 × 小时的依赖 |
| `docs/releases/v0.3.1.md` | 随发布提交新建，仿 `v0.3.0.md`；升级说明写「数据库升级到第 3 版，历史保留；升级后不能再装回 v0.3.0」 |
| `2026-11-20-half-hour-timeline.md` | 状态行改为「已被 v0.3.1 / v0.5.0 规格取代」并链接本文件和 `2026-11-22-timeline-page-design.md` |
| `2026-11-21-statistics-and-achievements-design.md` | 第 28、78 行：星期 × 小时习惯图以后可以从逐段数据派生，只能从采集起点算起；**不在 v0.3.1 做** |
| 版本号 | `package.json`、`package-lock.json` 两处、`src-tauri/Cargo.toml`、`Cargo.lock`、`src-tauri/tauri.conf.json`、`src-tauri/.backlog-qa/tauri.conf.json`，由 `chore(release): publish 0.3.1` 提交统一改 |

## 已知限制

- 5 秒采样：短于 5 秒的焦点切换、窗口开合会漏掉，或被并进相邻段；切换时刻的精度是一个 tick。
- 空闲门槛 5 分钟：离开后的前 5 分钟仍记为活跃，回来后要到下一个 tick 才变回活跃。
- 睡眠、休眠、程序卡住都表现为长间隔 `scan_gap`，分不出来；关机和退出程序都表现为下次的 `tracker_started`，也分不出来。
- 时钟回拨后同一天会有时间上重叠的段，日汇总也同样重复认可。
- 会话的开始是首次看到软件的 tick 时刻，段的开始是认可区间的起点，两者在边界上可能差几秒。
- 升级到 v0.3.1 之前的日子分不出有窗口和托盘（没有窗口段，也无法回填）；之后的日子由 `window_intervals` 区分。运行区间里都没有纯后台进程。
- 「有窗口」沿用任务栏 / Alt+Tab 规则：最小化、放在别的虚拟桌面上的窗口也算有窗口；只说明软件有窗口，不说明是哪个窗口、窗口在不在屏幕上。
- 段和窗口段永久保留，数据库会持续增长（见体量估算）。

## 已定（2026-11-22，用户确认全部按推荐）

1. **窗口 / 托盘的逐时刻状态**：v0.3.1 同时按身份记录「有窗口」区间（`timeline_window_spans`），规则同段的延长 / 新开，供 v0.5.0 图标坞「有窗口 M 个」、托盘图标缩小变淡和视窗台账「窗口开着」列使用；体量增加见「体量估算」。
2. **补充列**：接受 `usage_date`、`credited_seconds`、`start_reason` 三列（窗口段同样有）；PRIVACY.md 写明「技术原因码」。
