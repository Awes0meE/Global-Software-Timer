# Privacy

Global Software Timer v0.4.1 is local-first.

## What v0.4.1 records

- Application executable identity
- User-facing application name
- Application runtime
- Daily recorded computer time
- Daily active computer time based on keyboard/mouse idle state
- Software-page marks, such as focused or hidden
- Software-page foreground/background runtime aggregates
- Software-page focused active time based on the Windows foreground focused software identity
- Local app preferences, including startup at login, close-window behavior, duration format and theme
- Background processes without a window or tray icon: executable name and path, daily running time, CPU time, peak memory and process count, for the `后台` page
- A timeline of recorded time in consecutive stretches: which software identity had the Windows foreground focus, and whether the computer was active
- For each software identity, the stretches of time in which it had a taskbar window

To tell windowed, tray and background apps apart, GST reads window styles and class names, process command lines (checked in memory for helper flags such as `--type=`, never stored), and the executable paths Windows lists under `HKCU\Control Panel\NotifyIconSettings`. It does not read window titles or tray icon tooltips.

## What v0.4.1 does not record

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
- The app window loads these icons through the local `gsticon` protocol. They never leave the computer.

## Timeline segments

Since v0.3.1, GST also keeps a local timeline of when recorded time happened, not only daily totals, for a future `时间轴` page. No page shows it yet.

- Location: the same local SQLite database as the other records.
- Contents: stretches of recorded time, sampled every 5 seconds. Each stretch stores its start and end time, the identity key of the software that had the foreground focus, and whether the computer was active. The key is empty when no tracked software had the focus. Each stretch also has a technical reason code for why it began: the app started, a long gap, a clock change, local midnight, a focus change or an activity change.
- Window time: for each software identity, the stretches in which it had a taskbar or Alt+Tab window. GST only checks whether such a window exists. It does not read window titles and does not record which window it was. Each window stretch has the same kind of technical reason code, or notes that a window appeared.
- It contains no window titles, document names, webpage titles, keystrokes or mouse coordinates. Hidden software is still recorded, as in the daily totals; hiding only changes what pages show.
- Retention: kept permanently on this computer. Nothing is cleaned up automatically, exported or uploaded.

## Exports and backups

From v0.4.2, you can save some of these records as files: the page CSV exports, the settings file and a full data backup. GST writes such a file only when you press save in the Windows save dialog, and only to the path you picked there. The dialog opens in your Downloads folder; nothing is written to any folder automatically, and nothing is uploaded.

- `导出日报` (`概览`): for the day shown, each listed software's display name, process name, that day's runtime and active time, and its total runtime up to the end of that day. Hidden software is left out, as on the page.
- `导出软件清单` (`软件`): every focused, hidden and discovered software once, with its group, display name, process name, current status, last opened time, and today's and total foreground, background and focused time.
- `导出后台记录` (`后台`): for the day shown, each background software's display name, process name, peak process count, peak memory, background time and CPU time.
- `导出报表` (`统计`): for the chosen range, each software in the ranking, `开着没用` and session lists, with its display name, process name, rank, focused and window time, idle-open time, opens and average and longest session. It follows the page's `包含隐藏软件` switch.
- `导出设置`: the theme, duration format and close-window behaviour you chose (settings you never changed are left empty), and the focused and hidden lists. Each list entry holds only a display name, a process name and a one-way SHA-256 digest of the software identity key, never the key itself, because identity keys are built from install paths. The settings file does not contain the startup-at-login setting, usage history or executable paths.
- `备份全部数据`: a full copy of the local database. It contains the whole usage history, including the timeline and the executable paths of background processes, and the app settings. Treat it like the database itself.

The CSV files and the settings file never contain executable paths. Once saved, these files are ordinary files under your control; GST does not track or remove them.

`导入设置…` reads only the file you pick in the open dialog, up to 1 MB, and shows what it would change before anything is written. Importing adds to the focused and hidden lists and never removes local entries.

After a save, `在文件夹中显示` opens File Explorer with the saved file selected. GST does this only for a file it saved in the current session.

## Network

v0.4.1 does not upload usage data or require an account.

## Permissions

v0.4.1 runs as a normal user-space app and does not request administrator permission by default.

GST reads the Windows "Transparency effects" setting only to decide how panels look; it is not stored.

Startup at login uses the current user's normal autostart mechanism. It is enabled by default in v0.4.1, can be turned off in Settings, and does not require administrator permission.
