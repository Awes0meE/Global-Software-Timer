# Privacy

Global Software Timer v0.2.3 is local-first.

## What v0.2.3 records

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

## What v0.2.3 does not record

- Window titles
- Document names
- Webpage titles
- Keystrokes
- Mouse coordinates
- File contents
- Browser history
- Cloud data

## Network

v0.2.3 does not upload usage data or require an account.

## Permissions

v0.2.3 runs as a normal user-space app and does not request administrator permission by default.

Startup at login uses the current user's normal autostart mechanism. It is enabled by default in v0.2.3, can be turned off in Settings, and does not require administrator permission.
