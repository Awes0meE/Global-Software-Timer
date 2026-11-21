# Privacy

Global Software Timer v0.3.0 is local-first.

## What v0.3.0 records

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

To tell windowed, tray and background apps apart, GST reads window styles and class names, process command lines (checked in memory for helper flags such as `--type=`, never stored), and the executable paths Windows lists under `HKCU\Control Panel\NotifyIconSettings`. It does not read window titles or tray icon tooltips.

## What v0.3.0 does not record

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

## Network

v0.3.0 does not upload usage data or require an account.

## Permissions

v0.3.0 runs as a normal user-space app and does not request administrator permission by default.

Startup at login uses the current user's normal autostart mechanism. It is enabled by default in v0.3.0, can be turned off in Settings, and does not require administrator permission.
