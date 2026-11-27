# Privacy

Global Software Timer v0.4.8 is local-first.

## What v0.4.8 records

- Application executable identity
- User-facing application name
- Application runtime
- Daily recorded computer time
- Daily active computer time based on keyboard/mouse idle state
- Software-page marks, such as focused or hidden
- Software-page foreground/background runtime aggregates
- Software-page focused active time based on the Windows foreground focused software identity
- Local app preferences, including startup at login, close-window behavior, duration format, theme and, from v0.4.4, accent colour, e-ink palette, week start, start page and reduced motion, and from v0.4.5 text size (`文字大小`, stored as `ui.text_size`) and from v0.4.8 animation speed (`动画速度`, stored as `ui.motion_speed`); whether the sidebar is folded into its icons is kept only in the app window's local storage (`gst.sidebar-collapsed`), not in the database
- Background processes without a window or tray icon: executable name and path, daily running time, CPU time, peak memory and process count, for the `后台` page
- A timeline of recorded time in consecutive stretches: which software identity had the Windows foreground focus, and whether the computer was active
- For each software identity, the stretches of time in which it had a taskbar window

To tell windowed, tray and background apps apart, GST reads window styles and class names, process command lines (checked in memory for helper flags such as `--type=`, never stored), and the executable paths Windows lists under `HKCU\Control Panel\NotifyIconSettings`. It does not read window titles or tray icon tooltips.

## What v0.4.8 does not record

- Window titles
- Document names
- Webpage titles
- Keystrokes
- Mouse coordinates
- File contents
- Browser history
- Cloud data

## Statistics and achievements pages

Since v0.3.0, the `统计` and `成就` pages calculate multi-day totals, rankings, streaks and milestones from the records listed above. They add no new collection and write nothing: they read, through the app's read-only database connection, the existing daily machine totals, daily per-software window and focus time, sessions, software names and executable paths, and the software-page hidden marks. Software icons come from the local icon cache below. The `包含隐藏软件` switch only changes what is shown and is not saved.

## Local icon cache

Since v0.2.4, GST also saves software icons to disk, so they are not read from each executable again after every restart.

- Location: `%LOCALAPPDATA%\com.globalsoftwaretimer.app\icons\`
- Contents: one 96px PNG per icon, taken from the executable or its package resources. Each file is named by a hash of the executable path, size and modification time, so the folder holds no paths or software names in plain text.
- Cleanup: icon files written more than 90 days ago are deleted at startup. You can delete the folder at any time; icons are read again when needed.
- From v0.4.4, icons are read only for programs on a lettered local drive (such as `C:\`). GST does not open program paths on network shares or device paths, including paths that come from a restored backup. Such software shows its first letter instead of an icon.
- The app window loads these icons through the local `gsticon` protocol. They never leave the computer.
- From v0.4.3 the protocol also sends a CORS header (`Access-Control-Allow-Origin`), but only to the app's own page origin, so that a poster drawn inside the app window can include the icon. Any other origin gets no such header.

## Timeline segments

Since v0.3.1, GST also keeps a local timeline of when recorded time happened, not only daily totals, for a future `时间轴` page. No page shows it yet.

- Location: the same local SQLite database as the other records.
- Contents: stretches of recorded time, sampled every 5 seconds. Each stretch stores its start and end time, the identity key of the software that had the foreground focus, and whether the computer was active. The key is empty when no tracked software had the focus. Each stretch also has a technical reason code for why it began: the app started, a long gap, a clock change, local midnight, a focus change or an activity change.
- Window time: for each software identity, the stretches in which it had a taskbar or Alt+Tab window. GST only checks whether such a window exists. It does not read window titles and does not record which window it was. Each window stretch has the same kind of technical reason code, or notes that a window appeared.
- It contains no window titles, document names, webpage titles, keystrokes or mouse coordinates. Hidden software is still recorded, as in the daily totals; hiding only changes what pages show.
- Retention: kept permanently on this computer. Nothing is cleaned up automatically, exported or uploaded.

## Exports and backups

From v0.4.2, you can save some of these records as files: the page CSV exports, the settings file and a full data backup; from v0.4.3 also share posters (PNG pictures) of a day and of one software's milestone. GST writes such a file only when you press save in the Windows save dialog, and only to the path you picked there. The dialog opens in your Downloads folder; nothing is written to any folder automatically, and nothing is uploaded.

- `导出日报` → `当日明细` (`概览`): for the day shown, each listed software's display name, process name, that day's runtime and active time, and its total runtime up to the end of that day. Hidden software is left out, as on the page.
- `导出日报` → `日报海报` (`概览`, from v0.4.3): a PNG picture of the day shown: the date, that day's active and recorded time, and the display names, icons and hours of up to three software. Hidden software is left out, as on the page.
- `导出软件清单` (`软件`): every focused, hidden and discovered software once, with its group, display name, process name, current status, last opened time, and today's and total foreground, background and focused time.
- `导出后台记录` (`后台`): for the day shown, each background software's display name, process name, peak process count, peak memory, background time and CPU time.
- `导出报表` → `区间汇总` (`统计`): for the chosen range, every software with focused, window or background time, with its display name, process name, rank, focused and window time, idle-open time, opens, average and longest session, background time and number of days used. It follows the page's `包含隐藏软件` switch.
- `导出报表` → `每日明细` (`统计`, from v0.4.3): for the chosen range, one row per day and software with its display name, process name and that day's focused, window and background time. It follows the page's `包含隐藏软件` switch.
- `导出成就` (`成就`, from v0.4.3): a PNG picture of one software you pick: its display name and icon, its highest focus milestone and the date it was reached, the number of days it was used and its total focused time. The list to pick from follows the page's `包含隐藏软件` switch.
- `导出设置`: the theme, duration format and close-window behaviour you chose, and from v0.4.4 also the accent colour, e-ink palette, week start, start page and reduced-motion choice, from v0.4.5 also the text size (settings you never changed are left empty), and the focused and hidden lists. Each list entry holds only a display name, a process name and a one-way SHA-256 digest of the software identity key, never the key itself, because identity keys are built from install paths. The settings file does not contain the startup-at-login setting, usage history or executable paths.
- `备份全部数据`: a full copy of the local database. It contains the whole usage history, including the timeline and the executable paths of background processes, and the app settings. Treat it like the database itself.

The CSV files, the posters and the settings file never contain executable paths; posters do not show process names either. Once saved, these files are ordinary files under your control; GST does not track or remove them.

Posters are drawn on this computer, inside the app window, from the local records above. Their fonts (Inter and Noto Sans SC) are bundled with the app, and their icons come from the local icon cache; nothing is fetched from the network and nothing is uploaded. A poster is written only where you save it in the Windows save dialog, like the other files.

`导入设置…` reads only the file you pick in the open dialog, up to 1 MB, and shows what it would change before anything is written. Importing adds to the focused and hidden lists and never removes local entries.

After a save, `在文件夹中显示` opens File Explorer with the saved file selected. GST does this only for a file it saved in the current session.

From v0.4.5, the first start removes the legacy `app_heartbeat` rows of the local `run_events` log, which versions up to v0.1.x wrote and nothing reads, and then compacts the database. Before removing anything, GST saves a full copy of the database to `backups\GST-清理前-YYYY-MM-DD-HHMMSS.db` in the data folder; if that copy cannot be made, nothing is removed. Only the newest such copy is kept. Like a backup, it holds your whole usage history and app settings. Everything stays on this computer, and you can delete the copy once you are satisfied.

## Restore from backup

From v0.4.4, `设置` → `从备份恢复` replaces the local database with a full backup that you pick. Every step happens on this computer. GST reads only the file you pick in the open dialog, and every file it writes stays in the data folder, `%APPDATA%\com.globalsoftwaretimer.app\`.

- Checking: GST copies the picked file to a temporary `.gst-restore-<id>.tmp` in the data folder. It then checks and upgrades that copy, never the picked file or the current database. Picking again or cancelling deletes the copy, and any leftover copy is deleted at the next start.
- Applying: `恢复并重启` renames the checked copy to `global-software-timer.sqlite3.restore-pending` and restarts GST. Before anything else opens the database, the next start sets the current database aside as `global-software-timer.sqlite3.before-restore` and puts the backup in its place.
- Pre-restore copies: once the restored database opens, the set-aside data moves to `backups\GST-恢复前-YYYY-MM-DD-HHMMSS.db` in the data folder. GST keeps the three newest such copies and deletes older ones. Like the backup itself, each copy holds your whole usage history, including the timeline, the executable paths of background processes and the app settings.
- Rollback: if the restored database cannot be opened, it is renamed to `global-software-timer.sqlite3.restore-failed`, and the original data is put back and opened. The `.restore-failed` file stays in the data folder until you delete it.
- The restored database's own settings apply after the restart, including startup at login, which is passed to Windows as it is at every start.
- `打开数据文件夹` opens that folder in File Explorer. GST takes the path from its own state, never from the page.
- From v0.4.7 the screen at the top of `设置` shows `本机数据`, the size of the database and its write-ahead log. GST reads only the two file sizes, from the same path, when the page opens.

Nothing in a restore is uploaded or sent anywhere.

## Network

GST never connects to the network on its own. It does not upload usage data, has no telemetry and needs no account.

From v0.4.6 the only network access is `检查更新…` in `设置` → `关于与反馈`, and only when you ask for it:

- Pressing `检查更新…` opens a dialog that says the check goes online. Nothing is sent until you press `联网检查` there; `取消` sends nothing. You are asked every time; the answer is never remembered.
- There is no check at startup, on a timer or in the background.
- `联网检查` downloads the release manifest `latest.json` of the latest GitHub release (from github.com, which redirects to GitHub's download hosts). If it lists a newer stable version, a second dialog asks whether to update.
- Only `更新并重启` downloads the installer, from the same GitHub release. GST checks its signature against the public key built into the app before it runs it.
- These requests carry only what any HTTPS request carries (your IP address, a user agent and the requested address). They contain no usage data, no settings and no identifiers.
- Before the download, GST saves a full copy of the database to `backups\GST-更新前-<new version>-YYYY-MM-DD-HHMMSS.db` in the data folder; if that copy cannot be made, nothing is downloaded. Only the newest such copy is kept. Like a backup, it holds your whole usage history and app settings, and it stays on this computer.
- The installer then runs without asking (passive mode, no administrator permission for the default per-user install), and GST closes its open sessions, exits and is started again by the installer.

`更新日志`, `报告问题` and `提建议` open fixed GitHub pages, and `QQ 交流群` → `加入` opens the fixed QQ group invite (`qm.qq.com`), in your default browser; the browser connects, not GST.

Versions up to v0.4.5 have no `检查更新…`: install v0.4.6 by hand once, and later versions can be installed from inside the app.

## Permissions

v0.4.8 runs as a normal user-space app and does not request administrator permission by default.

GST reads the Windows "Transparency effects" setting only to decide how panels look; it is not stored.

From v0.4.4, GST also reads the Windows accent colour to show the `跟随 Windows` accent choice. It reads `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent\AccentPalette`, or `HKCU\Software\Microsoft\Windows\DWM\AccentColor` when that is missing. The reads are read-only. GST reads the colour only while `跟随 Windows` is chosen, at startup and whenever the window is shown again, and once when `设置` opens, to paint the `跟随 Windows` swatch. The colour is never written to the database or sent anywhere. The last colour used is kept in the app window's local storage, together with the other appearance choices, only so the next start paints the right colours from the first frame.

Startup at login uses the current user's normal autostart mechanism. It is enabled by default in v0.4.8, can be turned off in Settings, and does not require administrator permission.
