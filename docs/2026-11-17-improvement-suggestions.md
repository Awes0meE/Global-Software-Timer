# Global Software Timer 改进建议（发布副本）

日期：2026-11-17
依据：代码仓库 main（d8bfc6c）与外部审查。发布副本移除了本机数据库位置、实测规模和观测时间范围；完整原文仅保存在本地。

## 数据库现状

本节原有本机数据库规模、行数、身份计数和观测时间范围，发布副本已删除这些实测元数据。以下代码审查建议保留。

## 优先级

先做 1（统计正确性和回归测试），再做 2、3（写入和读取路径）和 5（迁移）。这几项决定数字准不准、用半年后会不会变卡，用户最先感受到的就是它们。6、7、9 是从「能用」走到「像产品」的关键；8、10 可以排在后面。

---

## 1. 时长统计的正确性：睡眠和休眠（最该先修）

**现状**

- 2026-05-29 的提交 `f00093a fix: cap tracker tick accounting` 给每个 tick 加了 60 秒上限（`MAX_TRACKER_TICK_CREDIT`），还配了测试 `tracker_tick_caps_long_active_duration`。但现在 `main` 的 `src-tauri/src/tracker.rs` 里已经没有这个常量，测试也不在 `src-tauri/tests/tracker_tests.rs` 里了。应该是 2026-05-30 合并几个 backup 分支时被冲掉的。
- `src-tauri/src/lib.rs` 的采集循环用 `last_tick.elapsed()` 算每个 tick 的时长。电脑睡眠 8 小时醒来后，第一个 tick 会把这 8 小时整个记进「今日记录」。
- 会话时长按 `started_at → last_heartbeat_at` 计算。合盖睡眠时进程还在，醒来后会话接着跑，睡着的时间也会算成运行时间。

**怎么改**

- 把 60 秒上限和那条测试找回来。
- 如果两次心跳间隔超过扫描间隔的 2 倍，就在上一次心跳处切断会话，再开一个新会话。
- 监听睡眠唤醒消息 `WM_POWERBROADCAST` 和锁屏通知 `WTSRegisterSessionNotification`；关机前收到 `WM_QUERYENDSESSION` / `WM_ENDSESSION` 时，把会话正常关掉，别等下次启动再补。
- 现在代码里到处直接调 `Utc::now()`，建议抽成一个 `Clock` trait 注入 tracker 和 storage，这样就能写「睡 8 小时」「跨午夜」「改时区」这类测试。

## 2. 数据库写入路径：膨胀的根源

**现状**

- 每个 tick，每个在跑的软件要做两次写入：一次 `heartbeat_session`（`UPDATE usage_sessions`），一次 `insert_run_event(AppHeartbeat)`（`INSERT run_events`）。
- 所有写入都是自动提交，没有放进事务（除了 `recover_open_sessions`）。一次写入就是一次落盘，十几个软件在跑时，每 5 秒有几十次 fsync。
- 定期心跳事件和 `usage_sessions.last_heartbeat_at` 记录的信息重复。

**怎么改**

- 不再写心跳事件，`run_events` 只记启动、停止、补关、配置变更这类真正的事件。
- 每个 tick 的所有写入放进一个事务。
- 开 `PRAGMA synchronous=NORMAL`，在 WAL 模式下这是安全的。
- 定一个保留策略：原始事件只留 N 天，更早的汇总成按天的数据。
- 开 `auto_vacuum=INCREMENTAL`，定期执行 `wal_checkpoint(TRUNCATE)`。
- 写一个一次性迁移，清掉历史心跳事件再 `VACUUM`。

清理能释放多少空间，应在可恢复备份和脱敏样本上实测，不能预先承诺。

## 3. 读取路径：锁竞争、全表扫描、轮询

**现状**

- 前端每 5 秒轮询一次（`src/App.tsx` 里 `dashboardRefreshIntervalMs = 5000`）。
- `get_dashboard_summary` 拿的是采集线程用的**同一把 Mutex**（`AppState.tracker`）。
- `Store::app_usage_summary_for_date` 的 SQL 没有日期过滤，每次都把全部 `usage_sessions` 读出来在 Rust 里算区间。
- 历史越长，界面越卡。而且界面开着的时候，采集线程要排队等锁，可能漏 tick。

**怎么改**

- 采集线程独占一个写连接，界面另开只读连接。WAL 模式本来就允许读写并发。
- 界面只读预先算好的汇总表，不在请求里扫全量历史。
- 数据变化时由 Rust 主动 `emit` 事件推给前端，不再定时轮询；窗口隐藏时完全停掉刷新。
- 给常用查询列建索引，比如 `usage_sessions(app_id, started_at)`、`run_events(occurred_at)`。

## 4. 只保留一套账本

**现状**

- 同一份时长记了两套：会话区间（`usage_sessions`）和按天累加的表（`daily_app_usage`、`daily_software_runtime_usage`、`daily_software_focus_usage`、`daily_system_usage`）。
- 概览页的累计时长从会话区间算，「软件」页从按天的表算，没有拆分数据时还要回退到会话区间（`memory.md` 里记的 legacy runtime 兼容逻辑）。
- 两套数字迟早对不上。

**怎么改**

- 选一个作为唯一的真实数据。推荐用会话区间（含前台 / 后台状态切换）作为事实表，各种汇总都从它推导。
- 需要提速时再做物化汇总，和会话在同一个事务里更新。
- 这样「补数据」「改历史」「合并软件」都只需要改一处。

## 5. Schema 迁移和数据安全

**现状**

- 没有记录 schema 版本号，靠 `CREATE TABLE IF NOT EXISTS` 加 `PRAGMA table_info` 检查列名来零散地补列（`ensure_daily_software_runtime_usage_columns`）。
- 数据库损坏、迁移出错时，`lib.rs` / `AppState::new` 里的 `expect` 会直接让程序 panic。

**怎么改**

- 用 `PRAGMA user_version` 做一张有序的迁移列表，每一步迁移放在一个事务里。
- 迁移前自动备份数据库文件。
- 启动时跑一次 `PRAGMA quick_check`。数据库坏了就把它改名隔离、新建一个空库，并提示用户，别直接崩溃。
- 把 v0.1.0 到 v0.1.3 各版本的旧数据库存成测试数据，CI 里跑一遍「旧库升到最新版」的测试。

## 6. 软件身份识别

**现状**

- `normalize_identity_key` 直接用小写后的完整 exe 路径当身份。
- 路径里带版本号的软件每升级一次，就会被当成一个新软件，历史时长断掉。比如：
  - Squirrel 安装的软件（路径带 `app-1.2.3\`，如 Discord、飞书）；
  - 商店应用（`WindowsApps\..._1.2.3_x64__...`）；
  - JetBrains 系列。
- 版本化路径存在身份拆分风险，是否实际出现重复项需要独立验证；发布副本省略本机软件数量。
- WPS 的合并规则是写死在代码里的。

**怎么改**

- 身份优先用 exe 版本资源里的 `CompanyName + ProductName`（`GetFileVersionInfo`）。
- 商店应用用 AUMID（应用的包标识）。
- 路径里的版本号段先规范化掉再用。
- 界面上提供「合并」和「拆分」，让用户自己纠正。

## 7. 分类规则从代码里搬出来

**现状**

`src-tauri/src/classifier.rs` 里写死了华硕 Armoury、Codex 路径、系统进程名之类的名单。每冒出一种新的后台噪声进程，就得发一个新版本。

**怎么改**

- 规则改成数据驱动：内置一份 JSON，用户可以覆盖。
- 判断时加入更多信号，不只看名字：
  - 是否在 session 0 运行（是就是服务）；
  - 是否从来没有过可见窗口；
  - 安装位置；
  - 数字签名的发布者。
- 拿不准的软件先放进一个「待确认」列表，让用户一键归类。大厂产品通常是「默认规则 + 用户纠错」，而不是靠开发者一直补名单。

## 8. 采集方式：从 5 秒轮询改成事件驱动

**现状**

- 每 5 秒全量刷新一遍进程（`sysinfo` 的 `refresh_processes_specifics`），再调一次 `EnumWindows`，前台切换的精度只有 5 秒。
- UWP 应用的前台窗口属于 `ApplicationFrameHost.exe`，`GetForegroundWindow` 拿到的是这个宿主进程的 PID，不是应用本身的。代码里没看到专门处理这种情况的逻辑，值得测一下「设置」「计算器」这类应用。

**怎么改**

- 用 `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` 监听前台切换，拿到精确时间戳。
- 进程列表可以继续轮询，但空闲时自动降低频率。
- 前台是 UWP 宿主时，再往下找真正应用的子窗口。

## 9. 统计口径要统一、能解释、能纠错（UI/UX）

**现状**

- 「运行」「前台运行」「后台运行」「活跃」「聚焦活跃」五个概念同时存在。
- 概览页的「活跃」是看键鼠有没有动，「软件」页的「活跃」是看软件有没有前台焦点。同一个词有两种意思，用户肯定会困惑。
- 界面上还留着「该功能暂未完成」的入口。

**怎么改**

- 统一术语表，每个数字旁边加一个 ⓘ 说明口径。
- 加一个时间轴视图，让用户能核对「这 3 小时是怎么算出来的」，可解释性就是信任感的来源。
- 未完成的功能直接隐藏，别展示一个点不了的入口。
- 空状态、首次启动引导、加载骨架屏都补上。
- 「正在记录」的绿点要绑定到「最近一次 tick 成功的时间」，采集线程卡住时界面要能如实显示出来。

## 10. 可观测性和发布链

**现状**

- 出错只调用 `eprintln!`，正式版的 GUI 程序没有控制台，这些错误全丢了。
- `src-tauri/tauri.conf.json` 里写着 `"csp": null`。
- 安装包没有签名，安装时会弹 SmartScreen 警告。
- 没有自动更新，也没有导出和备份功能。

**怎么改**

- 用 `tauri-plugin-log` 写带轮转的日志文件，再加一个 panic hook；设置页加「导出诊断包」，只含日志和匿名化的统计。
- 配上严格的 CSP。
- 用 Azure Trusted Signing 这类便宜的方案给安装包签名。
- 接入 `tauri-plugin-updater`，更新清单要签名。
- 加 CSV/JSON 导出和数据库备份/恢复，这也是路线图上本来就写了的。
