//! Windows appearance settings the UI follows. Read-only; nothing is stored.

use serde::Serialize;

/// Whether Windows "Transparency effects" is on. A missing or unreadable
/// value counts as on, which is the Windows default.
pub fn transparency_effects_enabled() -> bool {
    transparency_from_dword(read_enable_transparency())
}

pub fn transparency_from_dword(value: Option<u32>) -> bool {
    value != Some(0)
}

/// Reads `HKCU\...\Themes\Personalize\EnableTransparency` without opening a
/// key handle for writing or creating anything.
#[cfg(target_os = "windows")]
fn read_enable_transparency() -> Option<u32> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let subkey = wide(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
    let value_name = wide("EnableTransparency");
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut value as *mut u32).cast(),
            &mut size,
        )
    };
    (status == ERROR_SUCCESS).then_some(value)
}

#[cfg(not(target_os = "windows"))]
fn read_enable_transparency() -> Option<u32> {
    None
}

/// The first Windows build with Mica (Windows 11 21H2). Older builds keep the
/// opaque window they always had.
pub const MICA_MIN_BUILD: u32 = 22000;

static MICA_APPLIED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

pub fn mica_supported_on(build: Option<u32>) -> bool {
    build.is_some_and(|build| build >= MICA_MIN_BUILD)
}

/// Puts the Windows 11 Mica material behind the main window and clears the
/// window and webview backgrounds so it shows through. The page then decides
/// how much of it to let through (`get_window_backdrop`). Windows 10 and any
/// failure leave the window as it was. Runs once, at startup.
#[cfg(target_os = "windows")]
pub fn apply_window_backdrop<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use tauri::window::{Color, Effect, EffectsBuilder};

    let applied = mica_supported_on(read_windows_build())
        && window
            .set_effects(EffectsBuilder::new().effect(Effect::Mica).build())
            .is_ok()
        && window.set_background_color(Some(Color(0, 0, 0, 0))).is_ok();
    let _ = MICA_APPLIED.set(applied);
}

/// `"mica"` when Mica is behind the window, `"none"` otherwise.
pub fn window_backdrop() -> &'static str {
    if MICA_APPLIED.get().copied().unwrap_or(false) {
        "mica"
    } else {
        "none"
    }
}

/// `HKLM\...\Windows NT\CurrentVersion\CurrentBuildNumber`, read-only.
#[cfg(target_os = "windows")]
fn read_windows_build() -> Option<u32> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

    let subkey = wide(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
    let value_name = wide("CurrentBuildNumber");
    let mut buffer = [0u16; 32];
    let mut size = std::mem::size_of_val(&buffer) as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            subkey.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    let len = buffer.iter().position(|&unit| unit == 0).unwrap_or(buffer.len());
    String::from_utf16(&buffer[..len]).ok()?.trim().parse().ok()
}

/// The Windows accent as one `#rrggbb` colour per app theme. The frontend still
/// clamps both for contrast before using them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WindowsAccent {
    pub light: String,
    pub dark: String,
}

/// The current Windows accent, or `None` when neither registry value can be read.
pub fn windows_accent() -> Option<WindowsAccent> {
    accent_from_palette(read_accent_palette().as_deref())
        .or_else(|| accent_from_accent_color(read_accent_color()))
}

/// `AccentPalette` is 8 RGBA entries: Light3, Light2, Light1, Accent, Dark1,
/// Dark2, Dark3 and an unused one. Like WinUI, the light theme takes
/// AccentDark1 and the dark theme AccentLight2. Anything but 32 bytes is malformed.
pub fn accent_from_palette(bytes: Option<&[u8]>) -> Option<WindowsAccent> {
    let bytes = bytes.filter(|bytes| bytes.len() == 32)?;
    let entry = |index: usize| hex(bytes[index * 4], bytes[index * 4 + 1], bytes[index * 4 + 2]);
    Some(WindowsAccent {
        light: entry(4),
        dark: entry(1),
    })
}

/// `DWM\AccentColor` is a DWORD in ABGR order (`0xffd47800` is `#0078d4`).
/// Both themes start from that one colour.
pub fn accent_from_accent_color(value: Option<u32>) -> Option<WindowsAccent> {
    let [red, green, blue, _alpha] = value?.to_le_bytes();
    let base = hex(red, green, blue);
    Some(WindowsAccent {
        light: base.clone(),
        dark: base,
    })
}

fn hex(red: u8, green: u8, blue: u8) -> String {
    format!("#{red:02x}{green:02x}{blue:02x}")
}

#[cfg(target_os = "windows")]
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// Reads `HKCU\...\Explorer\Accent\AccentPalette` without opening a key for writing.
#[cfg(target_os = "windows")]
fn read_accent_palette() -> Option<Vec<u8>> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_BINARY,
    };

    let subkey = wide(r"Software\Microsoft\Windows\CurrentVersion\Explorer\Accent");
    let value_name = wide("AccentPalette");
    // Twice the expected 32 bytes; a longer value fails with ERROR_MORE_DATA and counts as malformed.
    let mut buffer = [0u8; 64];
    let mut size = buffer.len() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_BINARY,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    (status == ERROR_SUCCESS).then(|| buffer[..(size as usize).min(buffer.len())].to_vec())
}

/// Reads `HKCU\Software\Microsoft\Windows\DWM\AccentColor` without opening a key for writing.
#[cfg(target_os = "windows")]
fn read_accent_color() -> Option<u32> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let subkey = wide(r"Software\Microsoft\Windows\DWM");
    let value_name = wide("AccentColor");
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut value as *mut u32).cast(),
            &mut size,
        )
    };
    (status == ERROR_SUCCESS).then_some(value)
}

#[cfg(not(target_os = "windows"))]
fn read_accent_palette() -> Option<Vec<u8>> {
    None
}

#[cfg(not(target_os = "windows"))]
fn read_accent_color() -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_unreadable_value_counts_as_on() {
        assert!(transparency_from_dword(None));
    }

    #[test]
    fn mica_needs_windows_11() {
        assert!(!mica_supported_on(None));
        assert!(!mica_supported_on(Some(19045)));
        assert!(mica_supported_on(Some(22000)));
        assert!(mica_supported_on(Some(26100)));
    }

    #[test]
    fn backdrop_is_none_until_applied() {
        assert_eq!(window_backdrop(), "none");
    }

    #[test]
    fn zero_turns_transparency_off() {
        assert!(!transparency_from_dword(Some(0)));
        assert!(transparency_from_dword(Some(1)));
        assert!(transparency_from_dword(Some(2)));
    }

    #[cfg(windows)]
    #[test]
    fn reads_the_current_user_setting_read_only() {
        let from_api = transparency_effects_enabled();
        let output = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v",
                "EnableTransparency",
            ])
            .output()
            .expect("reg.exe should run");
        let stdout = String::from_utf8_lossy(&output.stdout);
        let from_reg = stdout
            .lines()
            .find(|line| line.contains("EnableTransparency") && line.contains("REG_DWORD"))
            .and_then(|line| line.split_whitespace().last())
            .and_then(|hex| u32::from_str_radix(hex.trim_start_matches("0x"), 16).ok());
        // `reg` finding no value means the Windows default: on.
        let expected = from_reg.is_none_or(|value| value != 0);
        assert_eq!(from_api, expected);
    }

    // The default blue's palette, as `reg query` prints it on Windows 11.
    const DEFAULT_BLUE_PALETTE: [u8; 32] = [
        0x99, 0xeb, 0xff, 0x00, 0x4c, 0xc2, 0xff, 0x00, 0x00, 0x91, 0xf8, 0x00, 0x00, 0x78, 0xd4,
        0x00, 0x00, 0x67, 0xc0, 0x00, 0x00, 0x3e, 0x92, 0x00, 0x00, 0x1a, 0x68, 0x00, 0xf7, 0x63,
        0x0c, 0x00,
    ];

    fn pair(light: &str, dark: &str) -> Option<WindowsAccent> {
        Some(WindowsAccent {
            light: light.into(),
            dark: dark.into(),
        })
    }

    #[test]
    fn palette_gives_dark1_to_light_and_light2_to_dark() {
        assert_eq!(
            accent_from_palette(Some(&DEFAULT_BLUE_PALETTE)),
            pair("#0067c0", "#4cc2ff")
        );
    }

    #[test]
    fn missing_or_malformed_palette_is_none() {
        assert_eq!(accent_from_palette(None), None);
        assert_eq!(accent_from_palette(Some(&[])), None);
        assert_eq!(accent_from_palette(Some(&DEFAULT_BLUE_PALETTE[..28])), None);
        let mut longer = DEFAULT_BLUE_PALETTE.to_vec();
        longer.extend_from_slice(&[0, 0, 0, 0]);
        assert_eq!(accent_from_palette(Some(&longer)), None);
    }

    #[test]
    fn accent_color_is_abgr_and_starts_both_themes() {
        assert_eq!(
            accent_from_accent_color(Some(0xffd4_7800)),
            pair("#0078d4", "#0078d4")
        );
        // Windows yellow #ffb900, whatever the alpha byte.
        assert_eq!(
            accent_from_accent_color(Some(0x0000_b9ff)),
            pair("#ffb900", "#ffb900")
        );
        assert_eq!(accent_from_accent_color(None), None);
    }

    #[test]
    fn serialises_as_a_light_and_dark_pair_or_null() {
        assert_eq!(
            serde_json::to_string(&pair("#0067c0", "#4cc2ff")).unwrap(),
            r##"{"light":"#0067c0","dark":"#4cc2ff"}"##
        );
        assert_eq!(
            serde_json::to_string(&None::<WindowsAccent>).unwrap(),
            "null"
        );
    }

    #[cfg(windows)]
    fn reg_value(key: &str, name: &str, kind: &str) -> Option<String> {
        let output = std::process::Command::new("reg")
            .args(["query", key, "/v", name])
            .output()
            .expect("reg.exe should run");
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find(|line| line.contains(name) && line.contains(kind))
            .and_then(|line| line.split_whitespace().nth(2))
            .map(str::to_string)
    }

    #[cfg(windows)]
    #[test]
    fn reads_the_current_user_accent_read_only() {
        let palette = reg_value(
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent",
            "AccentPalette",
            "REG_BINARY",
        )
        .map(|hex| {
            (0..hex.len() / 2)
                .map(|index| u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).unwrap())
                .collect::<Vec<u8>>()
        });
        let accent_color = reg_value(
            r"HKCU\Software\Microsoft\Windows\DWM",
            "AccentColor",
            "REG_DWORD",
        )
        .and_then(|hex| u32::from_str_radix(hex.trim_start_matches("0x"), 16).ok());
        let expected = accent_from_palette(palette.as_deref())
            .or_else(|| accent_from_accent_color(accent_color));
        assert_eq!(windows_accent(), expected);
    }
}
