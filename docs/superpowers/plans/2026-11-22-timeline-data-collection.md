# 时间轴逐段数据采集实现计划（v0.3.1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 待执行。

**目标：** 在 tracker 每次 tick 的同一个事务里，把已认可的秒数按「段」写进新表 `timeline_segments`（哪段时间、哪个软件拿着焦点、机器是否活跃），另按软件身份把「有窗口」的时段写进 `timeline_window_spans`；加一个界面暂不调用的只读命令 `get_timeline_summary`。界面不变，目的是尽早在本机积累数据，给 v0.5.0 的时间轴页用。

**规格（唯一依据，产品决定已定）：** [`docs/superpowers/specs/2026-11-22-timeline-data-collection-design.md`](../specs/2026-11-22-timeline-data-collection-design.md)。本计划里的「规格测试 N」指该文件「测试」一节的第 N 条（1–32）。

**分支：** `feat/timeline-segments`，独立 worktree `.worktrees/timeline-segments`。

- 首选：先把 `docs/timeline-and-glass-specs`（三份规格和本计划）合入 `main`（它直接接在 `17686c8` 之后，可快进），再从 `main` 建分支。这样功能分支只含实现提交，发布提交也直接落在 `main` 上。
- 如果用户暂不合入文档分支：从 `docs/timeline-and-glass-specs` 的分支头建，文档提交随功能分支一起进 `main`。
- 不在 `main` 上实现。合入 `main`、推送、发布、安装都要用户在会话里明确同意。

**架构：** 只新增，不改旧表和旧口径。

- `storage.rs`：schema 2 → 3，建两张表和两个索引；身份合并时把两张新表里的旧键改成新键；新增写入（插入 / 延长）和只读查询函数。
- `tracker.rs`：`TrackingState` 加不持久化的 `TimelineCursor`；`run_tracker_tick_with_foreground` 在 break 时推进游标，在每个日期块的末尾调用 `record_timeline_chunk`。段、窗口段与日汇总在同一个 savepoint 里写，commit 之后才替换内存状态，所以失败一起回滚。
- `record_daily_software_runtime_usage` 返回本块状态为 `Foreground` 的身份键，窗口段与 `foreground_seconds` 用同一组身份。
- `commands.rs`：新增泛型 `local_date_bounds_in<Tz>`（`local_date_start_utc` 改为调用它，行为不变）和 `get_timeline_summary` / `timeline_summary_from_store`，走 `summary_store` 只读连接加 savepoint；`lib.rs` 注册命令。
- 前端、`api.ts`、预览替身都不动。

**技术栈：** Tauri v2、Rust、rusqlite 0.32、chrono 0.4.44、SQLite（WAL）。

**检查命令（PowerShell，在 worktree 根目录）：**

```powershell
. .\scripts\dev-env.ps1
cargo test --manifest-path src-tauri\Cargo.toml
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
npm.cmd run check
```

`npm.cmd run check` 依次跑发布脚本回归、前端测试、前端构建、`cargo fmt --check`、`cargo test`、`npm audit`。每个任务至少跑该任务列出的定向测试、完整 `cargo test` 和 `cargo fmt --check`；任务 8、10、11 跑完整的 `npm.cmd run check`。

---

## 依据

- 规格：`docs/superpowers/specs/2026-11-22-timeline-data-collection-design.md`（写入规则、跨午夜与夏令时、读取命令、等式口径、测试 1–32、本机验收）
- 后续两步的规格（只作数据需求参照，不在本计划内实现）：`2026-11-22-glass-eink-redesign-design.md`（v0.4.0）、`2026-11-22-timeline-page-design.md`（v0.5.0）
- 现有写入：`src-tauri/src/tracker.rs` 的 `run_tracker_tick_with_foreground`（tracker.rs:297）、日期块循环（tracker.rs:357）、`credited_days`（tracker.rs:387）、`record_daily_software_runtime_usage`（tracker.rs:407）
- 现有迁移与身份合并：`storage.rs` 的 `SCHEMA_VERSION`（storage.rs:49）、`migrate`（storage.rs:114）、`merge_software_identity`（storage.rs:425，删除循环在 491–503）
- 现有只读命令写法：`commands.rs` 的 `get_statistics_summary` / `statistics_summary_from_store`；本地日边界 `local_date_start_utc`（commands.rs:773）；严格日期解析 `parse_local_date`（commands.rs:786）；`SoftwareLabels`（commands.rs:809）
- 现有测试写法：`tests/tracker_tests.rs`（`FakeProcessSource`、`FakeActivitySource`、`FakeForegroundWindowSource`、`tray_weixin`、`edge_process`、触发器注入失败）、`tests/identity_grouping_tests.rs`（逐版本身份折叠的夹具）、`tests/storage_reliability_tests.rs`（迁移）
- 统计口径：`docs/CURRENT_STATE.md`

---

## 开工前必读的三条约束

1. **开发版会改生产库。** `npm.cmd run tauri dev` 和本地构建的安装版与正式版共用 `%APPDATA%\com.globalsoftwaretimer.app\global-software-timer.sqlite3`。开发期间运行一次开发版，就会把生产库迁到 schema 3，已装的 v0.3.0 随后会因 `UnsupportedSchemaVersion` 拒绝打开。本计划只用单元测试、集成测试和库副本，**不运行开发版**；确需看真机行为时先停下来问用户。
2. **生产库只读。** 只用只读连接把它复制到 scratchpad（`VACUUM INTO`，包含已提交的 WAL 内容），之后只动副本。
3. **仓库是公开的。** 不提交任何真实使用数据：软件名、时长、截图、库副本、从副本打印的输出都不进仓库。`docs/CURRENT_STATE.md` 只写通过与否、天数和体量。

---

## 口径（实现时以此为准）

| 项目 | 规则 | 规格位置 |
| --- | --- | --- |
| 时刻格式 | 写库：`to_rfc3339_opts(SecondsFormat::Millis, false)`，固定毫秒、`+00:00` 结尾，文本顺序即时间顺序。命令返回的时刻用同一格式 | 「存储：timeline_segments」 |
| 日期块 | 直接用 `credited_days(&now, seconds)` 的 `(date, seconds, recorded_at)`：`chunk_start = recorded_at`，`chunk_end = chunk_start + seconds` | 「写入规则」 |
| 时长 | 一律用 `credited_seconds`；起止时刻只管位置，允许与秒数差不到 1 秒（时钟小幅前跳时多几秒） | 同上 |
| 焦点键 | 与 `daily_software_focus_usage` 同源：前台 PID 在本次 `app_ids_by_pid` 里才有键，否则为 NULL；不看隐藏列表 | 「隐藏软件与过滤进程」 |
| 有窗口 | 本块按身份合并后状态为 `Foreground` 的身份，与 `foreground_seconds` 同源；托盘、后台、退出不写行 | 「存储：timeline_window_spans」 |
| 等式 | `collected` 的每一天：段之和 = `recorded_seconds`；`is_active = 1` 段之和 = `active_seconds`；每个身份的焦点段之和 = `focused_seconds`；每个身份的窗口段之和 = `foreground_seconds` | 「等式口径」 |

### 实现时的取舍（规格没写明或与代码有出入的地方）

1. **break tick 与「0 秒不动游标」。** break tick 也认可 0 秒、不产生日期块，但规格要它把游标推进到 `AfterBreak`。做法：在日期块循环之前，只要 `break_reason` 非空就调用 `next.timeline.note_break(reason)`（`Fresh` 保持 `Fresh`）；「认可 0 整秒不动游标」只适用于没有 break 的 tick（比如不足 1 秒的小数 tick）。
2. **`local_date_bounds_in` 设为 `pub`。** `local_date_start_utc` 在 `commands.rs:773`，是私有函数；规格测试 8 要在 `tests/tracker_tests.rs`（集成测试）里用测试时区测 23 / 25 小时，所以新函数用 `pub fn`，纯函数，不碰数据库。
3. **规格测试 16、30 放在 `tests/identity_grouping_tests.rs`。** 规格写的是 `storage_reliability_tests.rs` / `storage_tests.rs`，但逐版本身份折叠的夹具在 `identity_grouping_tests.rs:123-221`，放在一起可以复用。
4. **验收的「旧表内容校验和」排除两列。** `migrate()` 每次都会跑 `maintain_software_identities`（storage.rs:137），它刷新 `software_identities.last_seen_at`、`updated_at`（storage.rs:714-715）和 `software_identity_members.updated_at`（storage.rs:730）。这些列每次启动 v0.3.0 也会变，校验和不算它们，其余列和其余旧表逐行比较。
5. **运行区间的零长度和 `open`。** 规格的重叠条件是 `COALESCE(ended_at, last_heartbeat_at) >= day_start`，恰好在零点结束的会话裁剪后长度为 0。做法：裁剪后 `end <= start` 的已关区间丢弃，只有未关会话（刚打开、还没有第二次心跳）保留零长度区间；同一身份取并集时，只要并进来的会话有一个未关，合并后的区间就标 `open: true`。这三条已补进规格「运行区间」一节（2026-11-22），测试 20 照此断言。
6. **返回顺序。** `segments` 按 `start_utc, id`（规格）；`focus_segments` / `active_segments` 按起点、再按首行 `id`；`running[]` 和 `software[]` 按 `identity_key` 升序，保证输出稳定。
7. **任务切分比建议的细。** 长间隔、回拨、重启、跨午夜决定了游标怎么写，它们的测试放进任务 3 先写；任务 5 只放事务回滚、小数秒边界、夏令时、`shutdown` 这类守护测试。读取命令拆成两个任务（段与日状态 / 运行区间与窗口区间）。

---

## 文件结构

不新建源文件。

修改：

- `src-tauri/src/storage.rs`：`SCHEMA_VERSION = 3`、`create_timeline_tables`、`merge_software_identity` 的两句 `UPDATE`、写入函数 `insert_timeline_segment` / `extend_timeline_segment` / `insert_timeline_window_span` / `extend_timeline_window_span`、只读查询 `timeline_segments_for_date` / `first_timeline_segment` / `timeline_window_spans_for_date` / `session_intervals_overlapping` / `identity_keys_with_tracked_member`，以及 `TimelineSegment`、`TimelineWindowSpan`、`SessionInterval` 三个公开结构体（放在 `BackgroundUsage` 旁边）。
- `src-tauri/src/tracker.rs`：`TimelineCursor`、`SegmentCursor`、`record_timeline_chunk`；`TrackingState.timeline`；`record_daily_software_runtime_usage` 返回 `Vec<String>`；日期块循环调整。
- `src-tauri/src/commands.rs`：`local_date_bounds_in`、`TIMELINE_INVALID_DATE`、DTO、`get_timeline_summary`、`timeline_summary_from_store`、合并与并集的纯函数、`mod timeline_command_tests`、`#[ignore]` 的 `real_database_timeline_acceptance`。
- `src-tauri/src/lib.rs`：`invoke_handler` 注册 `commands::get_timeline_summary`。
- `src-tauri/tests/storage_reliability_tests.rs`、`src-tauri/tests/identity_grouping_tests.rs`、`src-tauri/tests/tracker_tests.rs`：新测试与测试时区 `TestDst`。
- 文档：`PRIVACY.md`、`docs/CURRENT_STATE.md`、`CHANGELOG.md`、`AGENTS.md`、`README.md`、`memory.md`、规格状态行、`2026-11-21-statistics-and-achievements-design.md`、`docs/releases/v0.3.1.md`（发布时新建）。
- 版本号（发布时）：`package.json`、`package-lock.json`（两处）、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`、`src-tauri/.backlog-qa/tauri.conf.json`。

不做：

- 前端调用、`api.ts` 包装、预览替身、任何界面变化（v0.5.0）。
- 改旧表、改日汇总和会话的记法、回填历史、自动清理、导出。
- 采集窗口标题、文档名、网页标题、按键、鼠标坐标；联网、遥测、管理员权限。

---

## 执行顺序与审查关口

- 顺序执行：任务 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11，后一个依赖前一个；任务 2 只依赖任务 0，可与任务 1 交换次序。
- 每个任务都先写失败测试、确认失败、再做最小实现。任务 5、6 是守护测试，写完可能直接通过；不通过就说明实现有缺口，修实现，不改测试去迁就。
- 每个任务结束按 `AGENTS.md` 的审查关口走完再提交：
  1. 跑该任务的检查命令；
  2. 自查 diff（`git diff`），确认没有顺手改动、没有调试输出、没有真实数据；
  3. 规格符合性审查：逐条对照规格相关小节和本任务列出的规格测试编号；
  4. 代码质量审查：命名、错误处理（写库失败要冒泡回滚，不吞错）、重复、注释；
  5. 修完审查意见，再按任务末尾的提交信息提交。
- 提交只在用户允许提交后进行；没有允许时保留未提交改动，并报告建议的提交信息。提交作者只用用户本人，不加 `Co-Authored-By` 或任何 Claude 署名。

---

## 任务 0：准备 worktree

- [ ] 确认分支方案（见文首「分支」），取得用户同意后建 worktree：

```powershell
cd F:\XJTLU\科研_DIY\Global_Software_Timer\.worktrees\v01-implementation
git worktree add ..\timeline-segments -b feat/timeline-segments main
cd ..\timeline-segments
cmd /c mklink /J node_modules ..\v01-implementation\node_modules
```

  （从文档分支建时把最后一个参数 `main` 换成 `docs/timeline-and-glass-specs`。）`node_modules` 是目录联接，以后用 `cmd /c rmdir node_modules` 移除，不要用 `Remove-Item -Recurse`。可以设 `$env:CARGO_TARGET_DIR` 指向 `..\v01-implementation\src-tauri\target` 共用编译缓存；跑 `npm.cmd run release:build` 前必须清掉它（见任务 11）。

- [ ] 基线：`. .\scripts\dev-env.ps1`，`npm.cmd run check` 全部通过，记下 Rust 测试数量，后面每个任务只增不减。

无提交。

---

## 任务 1：schema 3、两张新表、身份合并

**文件：** `src-tauri/src/storage.rs`、`src-tauri/tests/storage_reliability_tests.rs`、`src-tauri/tests/identity_grouping_tests.rs`

**对应规格：** 「存储」两节、「迁移 2 → 3」；规格测试 15、16、30。

- [ ] **Step 1：写失败测试。**
  - 规格测试 15：`storage_reliability_tests.rs` 的 `migration_versions_existing_data_and_is_repeatable` 把 `user_version` 断言从 `2` 改成 `3`；末尾的索引计数再查 `timeline_segments_date_idx`、`timeline_window_spans_date_idx`；再断言 `table_names()` 含两张新表。
  - 规格测试 15：新增 `migration_from_schema_2_adds_only_the_timeline_tables`。先 `migrate()`，写入会话、日汇总、设置；再用原始连接 `DROP TABLE timeline_segments; DROP TABLE timeline_window_spans; PRAGMA user_version = 2;`，模拟 v0.3.0 的库；再 `migrate()` 两次。断言 `user_version = 3`、两表两索引存在且为空、原有数据读回不变。
  - 规格测试 15：`migration_rejects_future_versions_without_changing_schema` 不改，确认仍通过。现有 `failed_migration_rolls_back_all_schema_changes` 走 version 0，在 `create_baseline_schema` 里就失败，执行不到 `create_timeline_tables`，证明不了新表会回滚，所以另加 `failed_migration_from_schema_2_rolls_back_timeline_tables`：`migrate()` 后插入一个会被分类为 Tracked 的 app，删掉它的 `software_identity_members` 和 `software_identities` 行；`DROP` 两张新表，`PRAGMA user_version = 2`；建触发器 `CREATE TRIGGER fail_identity BEFORE INSERT ON software_identities BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`，让失败发生在 `create_timeline_tables` 之后执行的 `maintain_software_identities` 里。断言 `migrate()` 返回错误、`user_version` 仍为 2、`table_names()` 里没有两张新表、两个新索引也不存在。
  - 规格测试 16：`identity_grouping_tests.rs` 新增 `startup_fold_moves_timeline_focus_keys_to_the_new_identity`。复用 `startup_folds_legacy_per_version_identities_into_one` 的夹具：重建两个逐版本旧身份之后，用原始 SQL 往 `timeline_segments` 插两行，焦点键分别是 `old_v1`、`old_v2`，再加一行焦点键为 NULL 的段。重新 `migrate()`，断言不报错、三行都还在、两行的焦点键都是新键、NULL 行不变、`credited_seconds` 不变（不封顶、不合并）。
  - 规格测试 30：同文件新增 `startup_fold_moves_window_spans_and_keeps_overlapping_rows`。插入 `old_v1`、`old_v2` 两行时间上重叠的窗口段，`migrate()` 后两行都在、身份键都是新键、起止和秒数不变。

```rust
conn.execute(
    "INSERT INTO timeline_segments
         (usage_date, start_utc, end_utc, credited_seconds, focus_identity_key, is_active, start_reason)
     VALUES ('2026-11-18', '2026-11-18T01:00:00.000+00:00', '2026-11-18T01:10:00.000+00:00', 600, ?1, 1, 'tracker_started')",
    params![old_v1],
)?;
```

- [ ] **Step 2：确认失败。**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --test storage_reliability_tests
cargo test --manifest-path src-tauri\Cargo.toml --test identity_grouping_tests
```

  预期：版本断言失败、表不存在；有了表之后，16 / 30 因外键阻止删除旧身份而让 `migrate()` 整体失败。

- [ ] **Step 3：实现。**
  - `SCHEMA_VERSION` 改为 `3`，注释改为：

```rust
/// 2 adds `daily_background_usage`; 3 adds `timeline_segments` and `timeline_window_spans`.
const SCHEMA_VERSION: i64 = 3;
```

  - `migrate()` 在 `if version < 2 { self.create_background_usage_table()?; }` 之后、写 `user_version` 之前加 `if version < 3 { self.create_timeline_tables()?; }`。
  - `create_timeline_tables` 一次 `execute_batch` 建两表两索引，DDL 与规格逐字一致：

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

  - `merge_software_identity`：在删除旧键的 `for table in [...]` 循环（storage.rs:491）之前加两句，注释说明「段和窗口段不封顶、不合并相邻或重叠行」：

```rust
self.conn.execute(
    "UPDATE timeline_segments SET focus_identity_key = ?2 WHERE focus_identity_key = ?1",
    params![old_key, new_key],
)?;
self.conn.execute(
    "UPDATE timeline_window_spans SET identity_key = ?2 WHERE identity_key = ?1",
    params![old_key, new_key],
)?;
```

  - 不给 `focus_identity_key`、`identity_key` 单独建索引（规格：合并很少发生）。

- [ ] **Step 4：通过测试。** 上面两条定向命令，加完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 5：审查关口**（见「执行顺序与审查关口」）。

提交：`feat(storage): add timeline tables in schema 3`

---

## 任务 2：`local_date_bounds_in<Tz>` 重构

**文件：** `src-tauri/src/commands.rs`、`src-tauri/tests/tracker_tests.rs`

**对应规格：** 「跨午夜与夏令时」第 4 条；规格测试 8 的边界部分。

- [ ] **Step 1：写失败测试。**
  - `commands.rs` 新增 `#[cfg(test)] mod local_date_bounds_tests`：
    - `local_date_bounds_in_spans_one_day_for_fixed_offsets`：`FixedOffset` +08:00 下 2026-06-05 的边界是 `2026-06-04T16:00:00Z` 到 `2026-06-05T16:00:00Z`；-05:00 同理，都是 24 小时。
  - `tests/tracker_tests.rs` 新增测试时区 `TestDst`（规格：不引入 `chrono-tz`）和测试 `timeline_dst_day_bounds_are_23_and_25_hours`：

```rust
/// A fixed-rule DST zone for tests: `summer` applies from `summer_starts`
/// (inclusive) to `summer_ends` (exclusive), both UTC; `standard` otherwise.
#[derive(Clone, Copy, Debug, PartialEq)]
struct TestDst { standard: FixedOffset, summer: FixedOffset, summer_starts: NaiveDateTime, summer_ends: NaiveDateTime }

/// Carries the rule so `TimeZone::from_offset` can rebuild the zone.
#[derive(Clone, Copy, Debug)]
struct TestDstOffset { zone: TestDst, offset: FixedOffset }

impl Offset for TestDstOffset { fn fix(&self) -> FixedOffset { self.offset } }

impl TimeZone for TestDst {
    type Offset = TestDstOffset;
    fn from_offset(offset: &TestDstOffset) -> Self { offset.zone }
    fn offset_from_utc_datetime(&self, utc: &NaiveDateTime) -> TestDstOffset { /* summer 区间内取 summer */ }
    fn offset_from_utc_date(&self, utc: &NaiveDate) -> TestDstOffset { /* 取当天 00:00 */ }
    fn offset_from_local_datetime(&self, local: &NaiveDateTime) -> LocalResult<TestDstOffset> {
        // 对 standard、summer 各算 utc = local - offset，再看该 utc 的实际偏移是否就是它；
        // 0 个 → None（被跳过的本地时刻），1 个 → Single，2 个 → Ambiguous(按 UTC 先后)。
    }
    fn offset_from_local_date(&self, local: &NaiveDate) -> LocalResult<TestDstOffset> { /* 取当天 00:00 */ }
}
```

  具体签名以 chrono 0.4.44 的 `TimeZone` 为准。两套规则：
  - `eu_like()`：standard +01:00，summer +02:00，`2026-03-29T01:00Z` 拨快，`2026-10-25T01:00Z` 拨慢。断言 2026-03-29 的边界是 `[2026-03-28T23:00Z, 2026-03-29T22:00Z)`，23 小时；2026-10-25 是 `[2026-10-24T22:00Z, 2026-10-25T23:00Z)`，25 小时。
  - `midnight_switch()`：拨快发生在本地 00:00（跳过的午夜，当天从 01:00 开始），拨慢发生在本地 01:00（00:00–00:59 出现两次，取较早的 UTC）。断言 `local_date_bounds_in(.., &midnight_switch())` 的起点：跳过的午夜取 01:00，歧义午夜取较早的 UTC。

- [ ] **Step 2：确认失败。**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --lib local_date_bounds
cargo test --manifest-path src-tauri\Cargo.toml --test tracker_tests timeline_dst_day_bounds
```

- [ ] **Step 3：实现。**

```rust
/// The UTC instants a local date starts and ends in `tz`. Where a DST change
/// skips midnight, a day starts at the first local hour that exists; where it
/// repeats midnight, at the earlier instant.
pub fn local_date_bounds_in<Tz: TimeZone>(date: NaiveDate, tz: &Tz) -> (DateTime<Utc>, DateTime<Utc>);

fn local_date_start_utc(date: NaiveDate) -> DateTime<Utc> {
    local_date_bounds_in(date, &Local).0
}
```

  起点的算法照搬现有 `local_date_start_utc`（0..24 点逐个 `from_local_datetime(..).earliest()`，都不存在时退回 UTC 零点）；终点是 `date + 1` 天的起点。`local_day_start_utc()`（commands.rs:762）不在本任务范围内，不改。

- [ ] **Step 4：通过测试**，完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 5：审查关口。**

提交：`refactor(commands): compute local day bounds for any time zone`

---

## 任务 3：段游标与 `record_timeline_chunk`（焦点 / 活跃段）

**文件：** `src-tauri/src/storage.rs`、`src-tauri/src/tracker.rs`、`src-tauri/tests/tracker_tests.rs`

**对应规格：** 「写入规则」的内存游标和每个日期块两张表、「与现有判定的关系」、「隐藏软件与过滤进程」；规格测试 1、3、4、5、6、7、9、10、12。

测试读库用 `rusqlite::Connection::open(db_file.path())` 另开连接（现有测试的写法）。在 `tracker_tests.rs` 加一个小助手：

```rust
/// (usage_date, start_utc, end_utc, credited_seconds, focus_identity_key, is_active, start_reason), by id.
fn segments(db: &Path) -> Vec<(String, String, String, i64, Option<String>, bool, String)>;
```

- [ ] **Step 1：写失败测试**（都在 `tests/tracker_tests.rs`，名字以 `timeline_` 开头）：
  - 规格测试 1 `timeline_consecutive_ticks_extend_one_segment`：`code_process()` 有焦点、活跃，连续 3 个 5 秒 tick。只有一行，`credited_seconds = 15`，`end_utc` 是最后一个 tick 的 `now`，`start_reason = tracker_started`。
  - 规格测试 3 `timeline_focus_change_opens_a_focus_changed_segment`：Code（pid 42）和 Edge（`edge_process(100, false, true)`）都开着窗口，焦点 42 → 42 → 100 → 42（最后一次同时变空闲）。四次 tick 三行；第二、三行都是 `focus_changed`，第三行 `is_active = 0`，没有 `activity_changed`。
  - 规格测试 4 `timeline_activity_change_opens_an_activity_changed_segment`：焦点不变，空闲时长 0 → 600 → 0 秒（门槛 300 秒）。三行，后两行 `activity_changed`，焦点键相同。
  - 规格测试 5 `timeline_focus_is_null_without_a_countable_foreground_app`：分别用前台 PID 为 `None`、指向 `C:\Windows\` 下有窗口的进程（分类为 `Hidden`）、指向后台助手 `edge_process(101, true, false)`（状态 `Background`）、指向不在快照里的 PID。四种情况焦点键都为 NULL；连续两个 NULL 焦点的 tick 延长同一行。
  - 规格测试 6 `timeline_records_hidden_list_and_tray_focus`：第一 tick 后 `add_hidden_software_identities` 把 Code 加进隐藏列表，后续 tick 照记它的键；前台 PID 指向 `tray_weixin()`（托盘、无窗口）时照记 Weixin 的键。
  - 规格测试 7 `timeline_midnight_splits_segments_with_day_changed`：`FixedOffset` +08:00，`2026-06-06 00:00:02` 的 5 秒首个 tick。两行：`2026-06-05` 3 秒（`tracker_started`）、`2026-06-06` 2 秒（`day_changed`）；第二行 `start_utc = 2026-06-05T16:00:00.000+00:00`；各日段秒数等于 `daily_system_usage`。
  - 规格测试 9 `timeline_long_gaps_write_nothing_and_reopen_with_scan_gap`：三种 break 各跑一遍——墙钟跳 11 秒（`tick_duration` 5 秒）、`now` 正常但 `tick_duration` 11 秒、3600 秒的睡眠 tick。break tick 前后行数和秒数不变；下一 tick 新开一行 `scan_gap`。另加 `timeline_ten_second_gap_still_extends`：墙钟和 `tick_duration` 都恰好 10 秒，延长原行，`credited_seconds += 10`。再加一段：`scan_gap` 之后紧接一个回拨 tick，下一 tick 的原因是 `clock_rollback`（已是 `AfterBreak` 时换成本次原因）。
  - `timeline_first_tick_break_keeps_tracker_started`：首个 tick 的 `tick_duration` 为 3600 秒，不写段；下一个正常 tick 新开一行，原因 `tracker_started`（`Fresh` 遇到 break 仍是 `Fresh`）。
  - 规格测试 10 `timeline_clock_rollback_reopens_and_may_overlap`：第三个 tick 的 `now` 比上一个早 1 秒（break，0 秒），下一 tick 新开 `clock_rollback`，它的 `start_utc` 早于前一行的 `end_utc`，两行都保留。
  - 规格测试 12 `timeline_restart_never_extends_the_previous_segment`：同一数据库，第一个 tracker 跑两 tick；再 `Store::open` + `Tracker::new` 建第二个 tracker，5 秒后、焦点和活跃都不变地 tick。共两行，第二行 `tracker_started`。

- [ ] **Step 2：确认失败**：`cargo test --manifest-path src-tauri\Cargo.toml --test tracker_tests timeline_`

- [ ] **Step 3：存储写入函数**（`impl Store`，`storage.rs`）：

```rust
fn timeline_timestamp(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, false)
}

/// Returns the new row id.
pub fn insert_timeline_segment(&self, usage_date: NaiveDate, start: DateTime<Utc>, end: DateTime<Utc>,
    credited_seconds: i64, focus_identity_key: Option<&str>, is_active: bool, start_reason: &str) -> StoreResult<i64>;

/// `end_utc = end`, `credited_seconds += seconds`; anything but one updated row is an error.
pub fn extend_timeline_segment(&self, id: i64, end: DateTime<Utc>, seconds: i64) -> StoreResult<()>;
```

  延长不是恰好 1 行时返回 `StoreError::UnexpectedUpdateCount { operation: "extend_timeline_segment", count }`，写法照 `heartbeat_session`（storage.rs:958）。

- [ ] **Step 4：游标**（`tracker.rs`，不持久化）：

```rust
#[derive(Debug, Clone, Default)]
struct TimelineCursor {
    segment: SegmentCursor,
    // 任务 4 加 `windows: HashMap<String, i64>`
}

#[derive(Debug, Clone, Default, PartialEq)]
enum SegmentCursor {
    /// No segment written by this process yet.
    #[default]
    Fresh,
    /// A scan gap or clock rollback followed the last segment.
    AfterBreak(&'static str),
    /// The last segment, which the next chunk may extend.
    Open { segment_id: i64, usage_date: NaiveDate, focus_identity_key: Option<String>, is_active: bool },
}

impl TimelineCursor {
    /// `Fresh` stays `Fresh`: its next segment is `tracker_started` anyway;
    /// an existing `AfterBreak` takes the newer reason.
    fn note_break(&mut self, reason: &'static str);
    /// Why a chunk on `date` cannot continue the previous rows: `tracker_started`,
    /// the break reason, or `day_changed`; `None` when the cursor is open on `date`.
    fn chunk_break(&self, date: NaiveDate) -> Option<&'static str>;
}
```

  `TrackingState`（tracker.rs:37）加 `timeline: TimelineCursor`。`AppState::new` 建新 tracker 时自然是 `Fresh`，不需要额外处理。

- [ ] **Step 5：`record_timeline_chunk`**（本任务先不带 `windowed_keys`，任务 4 补上后与规格签名一致）：

```rust
fn record_timeline_chunk(store: &Store, cursor: &mut TimelineCursor, date: NaiveDate,
    chunk_start: DateTime<Utc>, seconds: i64, focus_key: Option<&str>, is_active: bool) -> StoreResult<()>;
```

  按规格「每个日期块」表的顺序判断：先算 `let chunk_break = cursor.chunk_break(date);`；若游标 `Open`、`chunk_break` 为 `None`、焦点键和 `is_active` 都相同，就延长；否则新开一行，原因依次取 `chunk_break`、焦点键不同时的 `focus_changed`（活跃同时变了也记这一条）、其余为 `activity_changed`。新开或延长后游标为 `Open`。

- [ ] **Step 6：接进 tick**（`run_tracker_tick_with_foreground`）：
  - `apply_scan` 之后：`if let Some(reason) = break_reason { next.timeline.note_break(reason); }`（见「实现时的取舍」第 1 条）。
  - 日期块循环里把焦点身份改成表达式，复用 `upsert_software_identity_for_app` 的返回值，不改原有写入顺序：

```rust
let focus_key = match foreground_app_id {
    Some(app_id) => {
        if active_seconds > 0 { store.increment_daily_app_usage(date, app_id, 0, active_seconds)?; }
        let identity = store.upsert_software_identity_for_app(app_id)?;
        store.increment_daily_software_focus_usage(date, &identity.identity_key, seconds)?;
        Some(identity.identity_key)
    }
    None => None,
};
record_timeline_chunk(store, &mut next.timeline, date, recorded_at, seconds, focus_key.as_deref(), is_active)?;
```

  - 段写在每个日期块的最后，仍在同一个 savepoint 里；commit 之后才 `tracker.state = next`，失败时游标保持 tick 之前的值。

- [ ] **Step 7：通过测试**：定向命令、完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 8：审查关口。** 规格符合性重点核对：break tick 不写段；`Fresh` 遇到 break 仍 `Fresh`；跨午夜第二块是 `day_changed`；认可 0 整秒且没有 break 的 tick 不动游标。

提交：`feat(tracker): record focus and activity timeline segments`

---

## 任务 4：窗口段（`record_daily_software_runtime_usage` 返回有窗口的键）

**文件：** `src-tauri/src/storage.rs`、`src-tauri/src/tracker.rs`、`src-tauri/tests/tracker_tests.rs`

**对应规格：** 「存储：timeline_window_spans」、「写入规则」的窗口段两张表；规格测试 23、24、25、26、27。

- [ ] **Step 1：写失败测试**（`tests/tracker_tests.rs`，名字以 `timeline_window_` 开头；助手 `window_spans(db) -> Vec<(usage_date, identity_key, start_utc, end_utc, credited_seconds, start_reason)>` 按 id）：
  - 规格测试 23 `timeline_window_span_follows_window_then_tray_then_window`：Weixin 先有窗口（`has_visible_window: true`）三个 tick → 一行，秒数累加；接着只剩托盘两个 tick → 不写行，该行 `end_utc` 停在最后一个有窗口 tick 的 `now`，焦点段照记；再有窗口 → 新开 `window_opened`。另一段：软件退出（快照里没有）再出现，同样新开 `window_opened`。
  - 规格测试 24 `timeline_window_spans_per_identity_not_per_process`：同一 tick 里 Code 和 Edge 都有窗口 → 两行、同起止；同一身份两个进程（`edge_process(100, false, true)` 加同路径的托盘进程）和两个版本（参照 `overlapping_package_versions_only_credit_one_tick` 的夹具）都只记一行；后台助手、无窗口无托盘进程、`C:\Windows\` 下进程不记；隐藏列表里的软件照记。
  - 规格测试 25 `timeline_window_spans_restart_with_tracker_started`：同库新建 tracker，窗口没变、间隔不到 10 秒，每个有窗口的身份新开一行 `tracker_started`。
  - 规格测试 26 `timeline_window_spans_break_on_gaps_but_not_on_focus_or_idle`：长间隔和回拨后所有有窗口的身份新开 `scan_gap` / `clock_rollback`，break tick 不写行；恰好 10 秒仍延长；焦点在两个有窗口软件间切换、活跃 ↔ 空闲切换都不拆窗口段。
  - 规格测试 27 `timeline_window_spans_split_at_midnight`：`FixedOffset` +08:00，`00:00:02` 的 5 秒 tick，每个有窗口的身份两行：前一天 3 秒、当天 2 秒，后一行 `day_changed`。
  - `timeline_sub_second_tick_moves_nothing`：焦点 A 的 5 秒 tick，再一个 0.5 秒、焦点 B 的 tick（认可 0 整秒，没有 break），再回到焦点 A。段和窗口段都只延长原来那一行，没有 `focus_changed` 行。
  - 把任务 3 的 `timeline_first_tick_break_keeps_tracker_started` 补一条断言：窗口段也是 `tracker_started`。

- [ ] **Step 2：确认失败**：`cargo test --manifest-path src-tauri\Cargo.toml --test tracker_tests timeline_window_`

- [ ] **Step 3：存储写入函数**：`insert_timeline_window_span(&self, usage_date, identity_key: &str, start, end, credited_seconds, start_reason: &str) -> StoreResult<i64>`、`extend_timeline_window_span(&self, id, end, seconds) -> StoreResult<()>`，格式和更新计数检查同任务 3。

- [ ] **Step 4：`record_daily_software_runtime_usage` 返回值**由 `StoreResult<()>` 改为 `StoreResult<Vec<String>>`：在现有 `for (identity_key, status) in status_by_identity` 循环里收集状态为 `Foreground` 的身份键，排序后返回。写 `foreground_seconds` 的逻辑不变，所以窗口段与该列同源。

- [ ] **Step 5：游标与写入。**
  - `TimelineCursor` 加 `windows: HashMap<String, i64>`（身份键 → 可延长的 `timeline_window_spans.id`）。`note_break` 进入 `AfterBreak` 时清空它。
  - `record_timeline_chunk` 加最后一个参数 `windowed_keys: &[String]`，签名与规格一致：`record_timeline_chunk(store, &mut next.timeline, date, chunk_start, seconds, focus_key, is_active, &windowed_keys)`。函数有 8 个参数，`cargo clippy` 会报 `too_many_arguments`（clippy 不在检查关口里），按规格保留，不另造结构体。
  - 窗口段用的是**更新段游标之前**算出的 `chunk_break`：有断点原因 `r` → 先清空窗口表，`windowed_keys` 里每个身份新开一行，原因 `r`；没有断点 → 在表里就延长那一行，不在表里就新开 `window_opened`。写完后窗口表只保留本块 `windowed_keys` 的身份（新开的记新 id），其余直接移出，不写库。
  - tick 里：`let windowed_keys = record_daily_software_runtime_usage(...)?;`，再传给 `record_timeline_chunk`。

- [ ] **Step 6：通过测试**（含任务 3 的全部 `timeline_` 测试）、完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 7：审查关口。** 重点核对规格「窗口段」一句：焦点切换、活跃切换不影响窗口段；认可 0 整秒的 tick 不动窗口表。

提交：`feat(tracker): record when each software has a window`

---

## 任务 5：守护测试——事务回滚、小数秒边界、夏令时、shutdown

**文件：** `src-tauri/tests/tracker_tests.rs`（只在测试暴露缺口时才改 `tracker.rs` / `storage.rs`）

**对应规格：** 「与现有判定的关系」表的失败、退出两行，「跨午夜与夏令时」；规格测试 2、8（写入部分）、11、13、28。

- [ ] **Step 1：写测试：**
  - 规格测试 2 `timeline_fractional_ticks_keep_span_within_a_second_of_credit`：起点 `09:59:52.300`，首个 tick 5 秒，之后每次 `now` 加 5.5 秒、`tick_duration` 5.5 秒，跨过 10:00:00。只有一行；`credited_seconds` 之和等于 `daily_system_usage.recorded_seconds`；`|end_utc - start_utc - credited_seconds| < 1 秒`。
  - 规格测试 8 `timeline_dst_segments_follow_daily_totals`：用任务 2 的 `eu_like()`，分别在拨快、拨慢的时刻前后连续 tick（含一次跨本地午夜）。每天段秒数之和等于该日 `daily_system_usage.recorded_seconds`，段的 `usage_date` 与日汇总的日期集合相同；DST 切换点本身不拆段（不是午夜，焦点和活跃没变）。
  - 规格测试 11 `timeline_failed_segment_write_rolls_back_the_whole_tick`：第一个 tick 成功；用触发器 `CREATE TRIGGER fail_segment BEFORE UPDATE ON timeline_segments BEGIN SELECT RAISE(ABORT, 'injected failure'); END;` 让第二个 tick 的延长失败。断言 tick 返回错误、`daily_system_usage` 仍是 5 秒、会话心跳仍是第一个 tick 的时刻、段仍是一行 5 秒；删掉触发器后用同一 `now` 重试，延长成一行 10 秒（游标没被污染）。同一测试再覆盖插入失败（`BEFORE INSERT`）。
  - 规格测试 11（续）`timeline_failed_second_chunk_rolls_back_the_first`：跨午夜的 tick，触发器只拦 `WHEN NEW.start_reason = 'day_changed'` 的插入。前一天的段、两天的日汇总都不留。
  - 规格测试 11（反向）`timeline_failed_daily_write_leaves_no_segment`：同一日期块里 `daily_system_usage` 先于段写入，直接拦它测不到「段已写、随后失败」，所以用跨午夜的第二天：`FixedOffset` +08:00，午夜前先成功跑一个 tick 留下一行段；再建 `CREATE TRIGGER fail_day2 BEFORE INSERT ON daily_system_usage WHEN NEW.usage_date = '<第二天>' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`（第二天还没有行，走插入路径，不需要 `BEFORE UPDATE`），跑一个跨午夜的 tick。断言 tick 返回错误、第一天那行的 `end_utc` 和 `credited_seconds` 都不变、没有新行；删掉触发器后用同一 `now` 重试，第一天那行正常延长，第二天新开一行 `day_changed`。
  - 规格测试 13 `timeline_ticks_after_shutdown_write_nothing`：tick、`shutdown()`、再 tick，段和窗口段的行数、秒数都不变。
  - 规格测试 28 `timeline_failed_window_span_write_rolls_back_the_whole_tick`：触发器让 `timeline_window_spans` 的插入或更新失败，整个 tick 回滚（段、日汇总、会话心跳都没写），删掉触发器重试后窗口段正常延长（窗口表没变）。

- [ ] **Step 2：运行**：`cargo test --manifest-path src-tauri\Cargo.toml --test tracker_tests timeline_`。这些测试预期直接通过；失败就是实现缺口，修实现，并在提交信息里说明（此时提交类型改为 `fix(tracker): ...`）。
- [ ] **Step 3：** 完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 4：审查关口。**

提交：`test(tracker): cover timeline rollback, fractional ticks, DST and shutdown`

---

## 任务 6：等式性质测试

**文件：** `src-tauri/tests/tracker_tests.rs`

**对应规格：** 「等式口径」；规格测试 14、29。

项目没有 `rand` 依赖，也不为测试新增依赖：用固定种子的 xorshift64 生成序列。

- [ ] **Step 1：写测试。**
  - `fn run_seeded_sequence<Tz: TimeZone>(tz: Tz, start: DateTime<Tz>, seed: u64, ticks: usize) -> NamedTempFile`：3 个可见软件（其中一个会在窗口和托盘之间切换）、1 个托盘软件、1 个后台助手。每个 tick 按随机数选：5 秒常规 tick（约 85%）、焦点切换（含无前台、指向后台进程）、活跃 ↔ 空闲、窗口 → 托盘 / 托盘 → 窗口、软件退出再打开、11–3600 秒的长间隔、1–30 秒的时钟回拨、5.5 秒的小数 tick。每个 tick 新建 `FakeForegroundWindowSource` 和 `FakeActivitySource`；`FakeProcessSource` 预先生成整条快照序列。
  - `fn assert_timeline_matches_daily_totals(db: &Path)`：在 Rust 里分别聚合段表、窗口段表和三张日汇总，逐日比较：
    - 记录：段秒数之和 = `daily_system_usage.recorded_seconds`（也 = `tracker_uptime_seconds`）；
    - 活跃：`is_active = 1` 的段秒数之和 = `active_seconds`；
    - 焦点：每个 (日期, 身份) 的段秒数之和 = `focused_seconds`（只比较大于 0 的行，两边的键集合也要相同）；
    - 窗口：每个 (日期, 身份) 的窗口段秒数之和 = `foreground_seconds`（同上）；
    - 段和窗口段出现的日期都在 `daily_system_usage` 里。
  - tick 预算：debug 构建下每个 tick 约 3–4 ms，每个测试 ≤ 1500 个 tick；600–3600 秒的长间隔取约 3% 的概率，让序列至少跨本地午夜两次。
  - 规格测试 14 + 29 `timeline_seeded_sequence_matches_daily_totals`：`FixedOffset` +08:00，从本地 22:30 开始，种子写死。
  - 规格测试 29（夏令时）`timeline_seeded_sequence_matches_daily_totals_across_dst`：`eu_like()`，从拨慢那晚开始，覆盖整个 25 小时的一天。
  - 两个测试都另外断言序列里确实出现过每种 `start_reason`（防止生成器退化成只有常规 tick）。固定种子缺某种原因（比如 `day_changed` 被跨午夜的长间隔吞掉）就换种子，不放宽断言。

- [ ] **Step 2：运行**：`cargo test --manifest-path src-tauri\Cargo.toml --test tracker_tests timeline_seeded`，预期直接通过；单个测试在 debug 构建下约 10 秒以内，超出就减少 tick 数（保持跨午夜和 25 小时日的覆盖）。
- [ ] **Step 3：** 完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 4：审查关口。**

提交：`test(tracker): check timeline totals against daily summaries`

---

## 任务 7：`get_timeline_summary`——段、合并带、日状态与注册

**文件：** `src-tauri/src/storage.rs`、`src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`

**对应规格：** 「读取命令 get_timeline_summary」除运行区间外的部分、`include_hidden = false` 的焦点部分；规格测试 17、18、19、21（焦点部分）、22。

- [ ] **Step 1：写失败测试**（`commands.rs` 新增 `#[cfg(test)] mod timeline_command_tests`，临时库 + `timeline_summary_from_store`，不经过 Tauri `State`；段直接用任务 3、4 的 `insert_timeline_*` 写入；日期边界一律用 `local_date_bounds_in(date, &Local)` 算，测试不依赖本机时区）。两张新表的身份键都是外键：把 `statistics_command_tests` 的 `migrated_store()` 和 `software(store, name) -> (app_id, identity_key)` 复制进 `timeline_command_tests`，每个焦点键、窗口键都先经它建出来，不用编造的键：
  - 规格测试 17 `timeline_summary_rejects_invalid_dates_and_handles_an_empty_database`：`"2026-6-5"`、`"2026-02-30"`、`"+12026-06-05"`、空串返回 `Err("timeline_invalid_date")`；空库返回 `day_status = before_collection`、`collection_started_at = None`、`first_recorded_date = None`、各数组为空。
  - 规格测试 18 `timeline_summary_reports_day_status_and_collection_start`：第一段在 D，`D-1` → `before_collection`，`D` → `collection_started`，`D+1`（没有段）→ `collected`；`collection_started_at` 是全表第一段的 `start_utc`；`first_recorded_date` 是 `daily_system_usage` 的最早日期。
  - 规格测试 19 `timeline_summary_merges_focus_and_active_bands`：构造 `tracker_started`(A, 活跃) → `activity_changed`(A, 空闲) → `focus_changed`(B, 空闲) → `focus_changed`(C, 活跃) → `activity_changed`(C, 空闲)。`focus_segments` 为 A、B、C 三条（A 和 C 各吞掉一条 `activity_changed`，秒数相加，`end` 取后一行）；`active_segments` 为 活跃、空闲（含 B）、活跃、空闲 四条（只有 `is_active` 相同的 `focus_changed` 并入）。再加一组回拨数据：按 `start_utc` 排序时前一行不是真前驱，合并仍按 `id`。`segments` 按 `start_utc, id` 排序。
  - 规格测试 21（焦点部分）`timeline_summary_masks_hidden_focus_without_changing_totals`：隐藏一个身份后，`include_hidden = false` 时该身份的段 `focus_identity_key = None`、`focus_hidden = true`，`software[]` 里没有它，`segments` 秒数之和不变；`true` 时原样返回，`focus_hidden` 都为 `false`，`software[].is_hidden = true`。
  - 规格测试 22 `timeline_summary_runs_on_a_read_only_connection`：写库后用 `Store::open_read_only` 打开，在 savepoint 里调用成功。

- [ ] **Step 2：确认失败**：`cargo test --manifest-path src-tauri\Cargo.toml --lib timeline_command_tests`

- [ ] **Step 3：存储只读查询**（`impl Store`）：

```rust
pub struct TimelineSegment {
    pub id: i64, pub usage_date: NaiveDate, pub start: DateTime<Utc>, pub end: DateTime<Utc>,
    pub credited_seconds: i64, pub focus_identity_key: Option<String>, pub is_active: bool, pub start_reason: String,
}
/// `WHERE usage_date = ?1 ORDER BY start_utc, id`
pub fn timeline_segments_for_date(&self, date: NaiveDate) -> StoreResult<Vec<TimelineSegment>>;
/// `ORDER BY usage_date, start_utc LIMIT 1`, served by `timeline_segments_date_idx`.
pub fn first_timeline_segment(&self) -> StoreResult<Option<(NaiveDate, DateTime<Utc>)>>;
```

  时刻用现有私有 `parse_utc`（storage.rs:2284）解析。`first_recorded_date` 直接用现有 `data_start_date()`（storage.rs:1845）。

- [ ] **Step 4：DTO**（`#[derive(Debug, Clone, Serialize)]`，字段 snake_case，时刻是毫秒精度 RFC 3339，日期是 `YYYY-MM-DD`）：

```rust
pub struct TimelineSummary {
    pub date: String, pub day_start: String, pub day_end: String, pub generated_at: String,
    pub day_status: String,                  // before_collection | collection_started | collected
    pub collection_started_at: Option<String>,
    pub first_recorded_date: Option<String>,
    pub segments: Vec<TimelineSegmentDto>,
    pub focus_segments: Vec<FocusSegmentDto>,
    pub active_segments: Vec<ActiveSegmentDto>,
    pub running: Vec<RunningSoftwareDto>,    // 任务 8 填充，本任务返回空数组
    pub software: Vec<TimelineSoftwareDto>,
}
pub struct TimelineSegmentDto { pub start: String, pub end: String, pub seconds: i64,
    pub focus_identity_key: Option<String>, pub focus_hidden: bool, pub is_active: bool, pub start_reason: String }
pub struct FocusSegmentDto { pub start: String, pub end: String, pub seconds: i64,
    pub focus_identity_key: Option<String>, pub focus_hidden: bool }
pub struct ActiveSegmentDto { pub start: String, pub end: String, pub seconds: i64, pub is_active: bool }
pub struct RunningSoftwareDto { pub identity_key: String, pub intervals: Vec<RunningIntervalDto>,
    pub window_intervals: Vec<WindowIntervalDto>, pub window_seconds: i64 }
pub struct RunningIntervalDto { pub start: String, pub end: String, pub open: bool }
pub struct WindowIntervalDto { pub start: String, pub end: String }
pub struct TimelineSoftwareDto { pub identity_key: String, pub display_name: String,
    pub icon_url: Option<String>, pub is_hidden: bool }
```

- [ ] **Step 5：组装。**

```rust
const TIMELINE_INVALID_DATE: &str = "timeline_invalid_date";

#[tauri::command(async)]
pub fn get_timeline_summary(state: State<'_, AppState>, date: String, include_hidden: bool)
    -> Result<TimelineSummary, String>;   // 锁 summary_store、开 savepoint、调用、提交，照搬 get_statistics_summary

fn timeline_summary_from_store(store: &Store, date: &str, include_hidden: bool, now: DateTime<Utc>)
    -> Result<TimelineSummary, String>;   // parse_local_date 失败 → TIMELINE_INVALID_DATE
fn timeline_summary_for_date(store: &Store, date: NaiveDate, include_hidden: bool, now: DateTime<Utc>)
    -> Result<TimelineSummary, StoreError>;
```

  - `day_start` / `day_end` = `local_date_bounds_in(date, &Local)`；`generated_at = now`；段不裁剪、不按边界过滤（规格：改过时区的段原样返回）。
  - `day_status`：没有段或 `date < 第一段日期` → `before_collection`；相等 → `collection_started`；之后 → `collected`。
  - 合并写成两个纯函数，输入按 `id` 排序的段：`merge_focus_segments` 把 `start_reason == "activity_changed"` 的行并进上一组；`merge_active_segments` 把 `start_reason == "focus_changed"` 且 `is_active` 与上一组相同的行并进上一组。并入时 `end` 取该行的 `end`，`seconds` 相加。输出再按起点、首行 `id` 排序。
  - 隐藏：`hidden = store.hidden_software_identity_keys()` 总是读（`software[].is_hidden` 要用）；`include_hidden = false` 时先把隐藏身份的焦点键换成 `None`、`focus_hidden = true`，再合并。
  - `software[]`：本任务取段里出现的非空焦点键，`display_name` / `icon_url` 用 `SoftwareLabels(store.software_identity_labels()?)`，按 `identity_key` 排序。
  - `lib.rs` 的 `invoke_handler` 加 `commands::get_timeline_summary`。界面不调用它，不改 `api.ts`。

- [ ] **Step 6：通过测试**、完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 7：审查关口。**

提交：`feat(commands): add the read-only timeline summary command`

---

## 任务 8：运行区间与窗口区间

**文件：** `src-tauri/src/storage.rs`、`src-tauri/src/commands.rs`

**对应规格：** 「运行区间」「窗口 / 托盘」、`include_hidden = false` 的运行部分；规格测试 20、21（运行部分）、31、32。

- [ ] **Step 1：写失败测试**（`timeline_command_tests`）：
  - 规格测试 20 `timeline_summary_running_intervals_cover_overlapping_sessions`：用 `start_session` / `heartbeat_session` / `close_session` 写会话（格式与生产一致）。覆盖：前一天 22:00 开始、当天 02:00 结束的会话被裁剪到 `day_start`；三天前开始、仍未关、心跳在当天的会话被取到，`open: true`，终点是心跳；同一身份两个 app（WPS 组件或两个版本）重叠的会话取并集；`C:\Windows\` 下的应用（分类为 `Hidden`）和 `apps.is_hidden = 1` 的应用被跳过（`Store.conn` 是私有的，`is_hidden` 用 `rusqlite::Connection::open(db_file.path())` 的原始 `UPDATE` 设）；恰好在 `day_start` 结束的已关会话不产生条目（规格「运行区间」边界与合并一条）。
  - 规格测试 21（运行部分）+ 32 `timeline_summary_drops_hidden_running_entries_unless_included`：隐藏身份的整个 `running[]` 条目（含 `window_intervals`、`window_seconds`）和 `software[]` 条目在 `include_hidden = false` 时消失，`true` 时保留。
  - 规格测试 31 `timeline_summary_window_intervals_union_and_match_foreground_seconds`：`tests/tracker_tests.rs` 的替身在单元测试里用不了，在测试模块里写最小的 `ProcessSource`、`ActivitySource` 替身（调 `_with_foreground` 时再加 `ForegroundWindowSource` 替身），用真实 tracker tick 写出窗口段和 `foreground_seconds`（tick 时刻用本地正午附近，保证落在被查询的那天）。断言 `window_seconds == foreground_seconds`；再用 `insert_timeline_window_span` 补几行：两个版本重叠的行、相接（缝隙不足 1 秒）的行合成一个区间，起点早于 `day_start` 的行被裁剪，`window_seconds` 仍是各行秒数之和（不裁剪、不去重）；`usage_date = D-1`、起止却都在 `[day_start, day_end)` 里的行（改过时区后会出现）既不进 `window_intervals`，也不计入 `window_seconds`。成员应用都被过滤的身份，窗口段也不出现。`before_collection` 的日子 `window_intervals` 为空数组、`window_seconds = 0`。

- [ ] **Step 2：确认失败**：`cargo test --manifest-path src-tauri\Cargo.toml --lib timeline_command_tests`

- [ ] **Step 3：存储只读查询：**

```rust
pub struct SessionInterval { pub identity_key: String, pub start: DateTime<Utc>, pub end: DateTime<Utc>, pub open: bool }

/// Sessions overlapping `[start_utc, end_utc)`: `started_at < end` and
/// `COALESCE(ended_at, last_heartbeat_at) >= start`. Skips `apps.is_hidden = 1`
/// and apps the current classifier hides. Open sessions end at their heartbeat.
pub fn session_intervals_overlapping(&self, start_utc: DateTime<Utc>, end_utc: DateTime<Utc>)
    -> StoreResult<Vec<SessionInterval>>;

pub struct TimelineWindowSpan { pub id: i64, pub identity_key: String, pub start: DateTime<Utc>,
    pub end: DateTime<Utc>, pub credited_seconds: i64 }
/// `WHERE usage_date = ?1 ORDER BY start_utc, id`
pub fn timeline_window_spans_for_date(&self, date: NaiveDate) -> StoreResult<Vec<TimelineWindowSpan>>;

/// Identities with at least one member app that `apps.is_hidden = 0` and the
/// current classifier tracks.
pub fn identity_keys_with_tracked_member(&self) -> StoreResult<HashSet<String>>;
```

  `session_intervals_overlapping` 的 SQL 只做粗筛，文本条件两端各放宽一天，写法同 `sessions_started_between`（storage.rs:1965-1966）：

```sql
SELECT m.identity_key, a.process_name, a.executable_path,
       s.started_at, s.ended_at, s.last_heartbeat_at
FROM usage_sessions s
JOIN apps a ON a.id = s.app_id
JOIN software_identity_members m ON m.app_id = s.app_id
WHERE a.is_hidden = 0
  AND s.started_at < ?2                                -- (end_utc 的日期 + 2 天)
  AND COALESCE(s.ended_at, s.last_heartbeat_at) >= ?1  -- (start_utc 的日期 - 1 天)
ORDER BY s.id
```

  然后在 Rust 里用 `classify_process` 跳过 `Hidden`，解析时刻，按精确条件过滤。

- [ ] **Step 4：组装 `running[]`**（`commands.rs`，纯函数可单测）：
  - 会话区间：裁剪到 `[day_start, day_end)`；`end <= start` 的丢弃，未关会话的零长度区间保留；同一身份按起点排序后取并集（`next.start <= current.end` 即合并，`open` 取或）。
  - 窗口区间：`timeline_window_spans_for_date(date)` 按身份分组，只保留 `identity_keys_with_tracked_member()` 里的身份；按起点排序，`next.start <= current.end + 1 秒` 即合并；合并后裁剪到 `[day_start, day_end)`，空的丢弃。`window_seconds` 是该身份当天所有行 `credited_seconds` 之和（过滤身份之后、裁剪之前）。
  - 条目 = 有会话区间或有窗口段的身份的并集，按 `identity_key` 排序；`include_hidden = false` 时去掉隐藏身份。
  - `software[]` 改为焦点键和 `running[]` 身份的并集。

- [ ] **Step 5：通过测试**、完整 `cargo test`、`cargo fmt -- --check`，再跑一次完整 `npm.cmd run check`（代码部分到此结束）。
- [ ] **Step 6：审查关口。** 规格符合性重点核对：重叠条件不能退化成只按开始时间筛；窗口段的应用过滤与会话一致；`window_seconds` 不裁剪不去重。

提交：`feat(commands): return running and window intervals in the timeline summary`

---

## 任务 9：真实库验收测试 `real_database_timeline_acceptance`

**文件：** `src-tauri/src/commands.rs`（`mod timeline_command_tests` 或现有 `mod tests` 里，`#[ignore]`）

**对应规格：** 「本机验收」第 1 条。

- [ ] **Step 1：写测试**，照 `real_database_statistics_acceptance`（commands.rs:1310）的写法：

```rust
/// Migrates a writable database copy to schema 3 and checks that old tables are
/// unchanged, then times the timeline summary for a few historical dates.
/// `GST_BENCH_DB` must point to a disposable copy; `GST_ACCEPT_DATES` is an
/// optional comma-separated list of dates (default: the first recorded date,
/// a middle date and yesterday).
#[test]
#[ignore = "requires GST_BENCH_DB pointing to a writable, disposable database copy"]
fn real_database_timeline_acceptance();
```

  - 拒绝 `%APPDATA%\com.globalsoftwaretimer.app\` 下的路径（防止误指生产库），直接 panic。
  - 迁移前用原始 `rusqlite::Connection` 读 `PRAGMA user_version`（应为 2），对每张旧表算行数和内容校验和：`SELECT <列> FROM <表> ORDER BY rowid`，每行每列把 `format!("{:?}", row.get_ref(i)?)` 喂给 `std::hash::DefaultHasher`（`rusqlite::types::Value` 没有 `Hash`，`daily_background_usage.cpu_core_seconds` 是 REAL）。旧表：`apps`、`run_events`、`usage_sessions`、`daily_app_usage`、`daily_system_usage`、`software_identities`（不含 `last_seen_at`、`updated_at`）、`software_identity_members`（不含 `updated_at`）、`focused_software_identities`、`hidden_software_identities`、`daily_software_focus_usage`、`daily_software_runtime_usage`、`app_settings`、`daily_background_usage`。
  - `Store::open(path)?.migrate()`，断言 `user_version = 3`、两张新表为空、每张旧表行数和校验和不变。
  - 用 `Store::open_read_only` 对每个日期调用 `timeline_summary_from_store`：断言 `day_status = before_collection`，至少一个日期的 `running` 非空（「昨天」可能合理地没有运行）；各计时 6 次，打印首次和热态中位耗时。
  - **只打印日期、状态、条目数量和耗时，不打印软件名、身份键或时长。**
- [ ] **Step 2：** 普通 `cargo test` 不跑它；`cargo test --manifest-path src-tauri\Cargo.toml --lib real_database_timeline_acceptance -- --ignored` 在没有 `GST_BENCH_DB` 时 panic 并提示设置变量，这是预期行为。
- [ ] **Step 3：** 完整 `cargo test`、`cargo fmt -- --check`。
- [ ] **Step 4：在功能分支上对库副本跑一次**（合入 `main` 的前提：不合格就停下，`main` 上不能留下会把库迁到 schema 3 的未发布代码）。复制生产库（只读，含 WAL），再复制一份作为可写副本：

```powershell
. .\scripts\dev-env.ps1
$work = "<scratchpad>\gst-timeline-accept"
New-Item -ItemType Directory -Force $work | Out-Null
$src = "$env:APPDATA\com.globalsoftwaretimer.app\global-software-timer.sqlite3"
python -I -c "import pathlib, sqlite3, sys; c = sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri() + '?mode=ro', uri=True); c.execute('VACUUM INTO ?', (sys.argv[2],)); c.close()" $src "$work\prod-readonly-copy.sqlite3"
Copy-Item "$work\prod-readonly-copy.sqlite3" "$work\migrate-me.sqlite3"
$env:GST_BENCH_DB = "$work\migrate-me.sqlite3"
cargo test --manifest-path src-tauri\Cargo.toml --release --lib real_database_timeline_acceptance -- --ignored --nocapture
```

  通过标准：`user_version = 3`，旧表行数和校验和不变，各日期 `before_collection`，至少一个日期有运行区间，热态中位耗时 < 200 ms。结果只在会话里报告通过与否和耗时量级，任务 11 写进 `docs/CURRENT_STATE.md`。
- [ ] **Step 5：审查关口。**

提交：`test(commands): add the real-database timeline acceptance check`

---

## 任务 10：文档

**文件：** 见下；只写行为和口径，版本号字样留给任务 11。

- [ ] `PRIVACY.md`：records 列表加两条（逐段记录焦点与活跃、每个软件哪段时间有窗口）；仿 `## Local icon cache` 另起 `## Timeline segments`，写明：存在同一个 SQLite 库；5 秒采样；只有起止时刻、软件身份键、活跃布尔值和技术原因码（technical reason codes，如重启、长间隔、跨午夜）；另记每个软件哪段时间有窗口，只看任务栏 / Alt+Tab 窗口是否存在，不读窗口标题、不记是哪个窗口；永久保留、不自动清理；不含标题、按键、坐标。`v0.3.0` → `v0.3.1` 的替换在任务 11 做。
- [ ] `docs/CURRENT_STATE.md`：
  - 第 11 行：schema 2 → 3，只新增两张表，不回填历史，升级后不能再装回 v0.3.0；
  - 口径表加「时间轴段」「窗口段」两行和四条等式（写明可以合理不等的情况：升级当天、身份合并封顶、焦点为 NULL 的段、窗口式没有机器级对应）；
  - 第 64 行「星期 × 小时习惯图要等半小时分时数据」改为「逐段数据已开始采集（v0.3.1），页面未开放，只能从采集起点算起」；第 63 行的「时间轴」改为「时间轴页（数据已采集，页面待 v0.5.0）」。
- [ ] `CHANGELOG.md`：顶部新增 `## Unreleased`，英文条目（参照 v0.1.5 那条 schema 2 的写法）：

```text
- Recorded a local timeline of focus and activity segments, and of when each software had a window, in the new timeline_segments and timeline_window_spans tables (schema version 3); nothing in the UI changes yet.
- Databases upgraded to schema 3 cannot be opened by v0.3.0 or earlier.
```

- [ ] `AGENTS.md`：v0.3.0 小节后加：

```text
v0.3.1 additionally includes:

- Timeline data collection: `timeline_segments` (focus identity and active state per credited stretch) and `timeline_window_spans` (when each software identity had a taskbar window), written in the tracker tick's transaction (SQLite schema 3). Kept permanently; no backfill, cleanup or export.
- Hidden software is still recorded; hiding only affects display. The read-only `get_timeline_summary` command exists but no page calls it until v0.5.0.
- Keep `PRIVACY.md` in step with any change to what these tables store. Binding decisions: `docs/superpowers/specs/2026-11-22-timeline-data-collection-design.md`.
```

- [ ] `README.md`：隐私表「会记录」一栏加「逐段的焦点 / 活跃时段、每个软件有窗口的时段」；技术架构「存储」一行改为「事件、运行会话、每日汇总、逐段时间轴与窗口时段」。`Get-FileHash` 文件名在任务 11 改。
- [ ] `memory.md`：Technical Decisions 加一条（两张表、schema 3、与日汇总同事务、只读命令、等式口径见 CURRENT_STATE）；Privacy Decisions 加一条；第 68 行「waits for half-hour data」改为「can be derived from timeline segments from the collection start onward」。Latest published release、Current Repository State、Release State 在任务 11 改。
- [ ] 规格状态行：`2026-11-22-timeline-data-collection-design.md` 改为「已实现，待发布」；`2026-11-20-half-hour-timeline.md` 的状态行已在文档分支改过（提交 `7e29518`），只把两个文件名改成链接。
- [ ] `2026-11-21-statistics-and-achievements-design.md` 第 28、78 行：星期 × 小时习惯图以后可以从逐段数据派生，只能从采集起点（v0.3.1）算起；不在 v0.3.1 做。
- [ ] 检查：`npm.cmd run check`（文档不影响结果，确认没误改代码）；全文搜一遍新增文字里没有真实软件名和时长。
- [ ] **审查关口**：规格符合性对照规格「文档与发布要更新的地方」表逐行核对。

提交：`docs: document timeline segment collection`

---

## 任务 11：发布 v0.3.1

**前提：** 任务 9 Step 4 的库副本验收已通过；任务 1–10 已合入 `main`（合并方式和推送都由用户确认；`main` 要求线性历史）。

**位置：** 下面的改动和发布提交都在 `.worktrees/v01-implementation`（`main`）里做。先 `. .\scripts\dev-env.ps1`，并 `Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue`：`scripts/release-build.ps1` 写死了 `src-tauri\target\release\bundle\...`，共用编译缓存时找不到安装包。

- [ ] **版本号**：`package.json`、`package-lock.json`（两处）、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`、`src-tauri/.backlog-qa/tauri.conf.json` 统一改为 `0.3.1`。
- [ ] **版本字样**：`CHANGELOG.md` 的 `## Unreleased` 改为 `## v0.3.1 - <发布日期>`；`PRIVACY.md` 各处 `v0.3.0` → `v0.3.1`（「Since v0.3.0」那句描述统计页的除外）；`docs/CURRENT_STATE.md` 第 3 行版本句和「发布与验证」加任务 9 Step 4 的验收结果（只写通过与否和耗时量级）；`memory.md` 的 Latest published release、Current Repository State（schema 3）、Release State；`README.md` 的 `Get-FileHash` 文件名；规格状态行改为「已随 v0.3.1 发布」。
- [ ] **发布说明** `docs/releases/v0.3.1.md`（中文，仿 `v0.3.0.md`）：界面没有变化；开始在本机逐段记录焦点、活跃和每个软件有窗口的时段，为以后的时间轴页准备；隐私边界（不读标题、不联网、永久保留在本机）；升级说明写「数据库升级到第 3 版，历史保留；升级后不能再装回 v0.3.0」；安装包段落与 v0.3.0 相同，文件名换成 `0.3.1`。
- [ ] **本地构建**：`npm.cmd run release:build` 通过，记下两个安装包的 SHA-256。
- [ ] **审查关口**：版本号七处一致（`git grep -n "0\.3\.0"` 只剩历史记录）；发布说明与 CHANGELOG 一致。
- [ ] **提交**（标题必须一字不差，发布工作流据此打 tag、建 Release）：`chore(release): publish 0.3.1`
- [ ] **推送与安装（都需用户在会话里确认）**：用户同意后推送 `main`，看 CI 和「Windows release」工作流通过。安装前建议（经用户同意）用任务 9 Step 4 的只读 `VACUUM INTO` 把生产库另存到 `%APPDATA%\com.globalsoftwaretimer.app\backup-before-v0.3.1-<日期>.sqlite3`，因为升级不可回退。再从正式 Release 下载 EXE，核对 SHA-256，用 `/S` 静默覆盖安装（安装程序会结束正在运行的 GST），重新启动，确认托盘正常、库已是 `user_version = 3`（用只读副本查）。记下安装日期，作为下面本机验收的 `collection_started` 日。

---

## 本机验收（装上 v0.3.1 满两个完整日后）

对应规格「本机验收」第 2、3 条。设安装当天为 $D_0$，最早在 $D_0 + 3$ 天做，核对 $D_0 + 1$ 和 $D_0 + 2$ 两个完整日（`collected`）；当天和安装当天不计。

- [ ] 用任务 9 Step 4 的 `VACUUM INTO` 命令重新取一份只读副本 `$work\after-two-days.sqlite3`，以下只动它。
- [ ] 用 Python（`python -I`）的 `sqlite3` 依次执行下面四段 SQL，`:today` 绑定为当天本地日期。前三段每段应返回 **0 行**；第四段返回被核对的天数，应 ≥ 2。输出里只有日期和计数，没有身份键。

```sql
-- 1. 记录 / 活跃：不一致的日子
WITH first AS (SELECT MIN(usage_date) AS first_date FROM timeline_segments),
days AS (
    SELECT usage_date FROM daily_system_usage
    UNION
    SELECT usage_date FROM timeline_segments
),
seg AS (
    SELECT usage_date,
           SUM(credited_seconds) AS recorded,
           SUM(CASE WHEN is_active = 1 THEN credited_seconds ELSE 0 END) AS active
    FROM timeline_segments
    GROUP BY usage_date
)
SELECT days.usage_date
FROM days
LEFT JOIN daily_system_usage AS sys ON sys.usage_date = days.usage_date
LEFT JOIN seg ON seg.usage_date = days.usage_date
WHERE days.usage_date > (SELECT first_date FROM first)
  AND days.usage_date < :today
  AND (COALESCE(sys.recorded_seconds, 0) <> COALESCE(seg.recorded, 0)
    OR COALESCE(sys.tracker_uptime_seconds, 0) <> COALESCE(seg.recorded, 0)
    OR COALESCE(sys.active_seconds, 0) <> COALESCE(seg.active, 0));

-- 2. 焦点（逐身份）：每个日子不一致的身份个数
WITH first AS (SELECT MIN(usage_date) AS first_date FROM timeline_segments),
seg AS (
    SELECT usage_date, focus_identity_key AS identity_key, SUM(credited_seconds) AS seconds
    FROM timeline_segments
    WHERE focus_identity_key IS NOT NULL
    GROUP BY usage_date, focus_identity_key
),
agg AS (
    SELECT usage_date, identity_key, focused_seconds AS seconds
    FROM daily_software_focus_usage
    WHERE focused_seconds > 0
),
seg_only AS (SELECT * FROM seg EXCEPT SELECT * FROM agg),
agg_only AS (SELECT * FROM agg EXCEPT SELECT * FROM seg),
diff AS (SELECT * FROM seg_only UNION ALL SELECT * FROM agg_only)
SELECT usage_date, COUNT(*) AS mismatched_identities
FROM diff
WHERE usage_date > (SELECT first_date FROM first)
  AND usage_date < :today
GROUP BY usage_date;

-- 3. 窗口（逐身份）：每个日子不一致的身份个数
WITH first AS (SELECT MIN(usage_date) AS first_date FROM timeline_segments),
seg AS (
    SELECT usage_date, identity_key, SUM(credited_seconds) AS seconds
    FROM timeline_window_spans
    GROUP BY usage_date, identity_key
),
agg AS (
    SELECT usage_date, identity_key, foreground_seconds AS seconds
    FROM daily_software_runtime_usage
    WHERE foreground_seconds > 0
),
seg_only AS (SELECT * FROM seg EXCEPT SELECT * FROM agg),
agg_only AS (SELECT * FROM agg EXCEPT SELECT * FROM seg),
diff AS (SELECT * FROM seg_only UNION ALL SELECT * FROM agg_only)
SELECT usage_date, COUNT(*) AS mismatched_identities
FROM diff
WHERE usage_date > (SELECT first_date FROM first)
  AND usage_date < :today
GROUP BY usage_date;

-- 4. 被核对的天数
SELECT COUNT(*) AS checked_days
FROM daily_system_usage
WHERE usage_date > (SELECT MIN(usage_date) FROM timeline_segments)
  AND usage_date < :today;
```

  某天不一致时先查是不是规格「等式口径」列的合理情况（这两天里发生过身份合并且单日超过 86400 秒）；不是就算失败，回到代码排查，不改 SQL 迁就。

- [ ] **体量**（规格「体量估算 / 实测方法」）：在副本的再复制品上测，避免动 `after-two-days.sqlite3`：

```python
# python -I measure.py <after-two-days.sqlite3> <scratch copy path>
import os, shutil, sqlite3, sys
shutil.copyfile(sys.argv[1], sys.argv[2])
c = sqlite3.connect(sys.argv[2])
c.execute("PRAGMA journal_mode=DELETE")
c.execute("VACUUM")
size = lambda: os.path.getsize(sys.argv[2])
total = size()
c.execute("DROP TABLE timeline_window_spans"); c.execute("VACUUM"); without_spans = size()
c.execute("DROP TABLE timeline_segments"); c.execute("VACUUM"); without_both = size()
print("window spans bytes", total - without_spans, "segments bytes", without_spans - without_both)
```

  行数在 `after-two-days.sqlite3` 上查（只返回日期和计数）：

```sql
SELECT usage_date, COUNT(*) FROM timeline_segments GROUP BY usage_date ORDER BY usage_date;
SELECT usage_date, COUNT(*) FROM timeline_window_spans GROUP BY usage_date ORDER BY usage_date;
```

  每天字节数按「该表字节数 × 当天行数 ÷ 总行数」估算，与规格的演示值（段约 100 KB/天、窗口段约 60 KB/天）对比。

- [ ] **记录**：在 `docs/CURRENT_STATE.md`「发布与验证」加一段，**只写**：等式核对通过与否、核对天数、不一致天数（应为 0）、两张表每天的行数与估算字节数、热态耗时量级。不写软件名、身份键、时长，不附截图或副本。scratchpad 里的副本用完删除。
- [ ] **审查关口**：自查 diff，确认只有通过与否、天数、行数和体量，没有软件名和时长。
- [ ] 提交（用户允许后），在从 `main` 新建的 `docs/v0.3.1-timeline-acceptance` 分支上，不直接提交到 `main`：`docs(state): record the v0.3.1 timeline acceptance`
