//! Windows appearance settings the UI follows. Read-only; nothing is stored.

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

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_unreadable_value_counts_as_on() {
        assert!(transparency_from_dword(None));
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
        let expected = from_reg.map_or(true, |value| value != 0);
        assert_eq!(from_api, expected);
    }
}
