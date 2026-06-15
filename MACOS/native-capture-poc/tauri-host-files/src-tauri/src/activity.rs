use std::time::Duration;

pub trait ActivitySource: Send {
    fn idle_duration(&self) -> Duration;

    fn is_active(&self, threshold: Duration) -> bool {
        self.idle_duration() <= threshold
    }
}

#[derive(Debug, Default)]
pub struct WindowsActivitySource;

#[derive(Debug, Default)]
pub struct PlatformActivitySource;

impl ActivitySource for PlatformActivitySource {
    fn idle_duration(&self) -> Duration {
        #[cfg(target_os = "macos")]
        {
            return crate::macos_capture::capture_once()
                .map(|capture| crate::macos_capture::idle_duration_from_capture(&capture))
                .unwrap_or(Duration::ZERO);
        }

        #[cfg(target_os = "windows")]
        {
            return WindowsActivitySource.idle_duration();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Duration::ZERO
        }
    }
}

fn idle_duration_from_ticks(now_ticks: u64, last_input_ticks: u32) -> Duration {
    let now_ticks = now_ticks as u32;
    Duration::from_millis(u64::from(now_ticks.wrapping_sub(last_input_ticks)))
}

#[cfg(target_os = "windows")]
impl ActivitySource for WindowsActivitySource {
    fn idle_duration(&self) -> Duration {
        use windows_sys::Win32::System::SystemInformation::GetTickCount64;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

        unsafe {
            let mut info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };

            if GetLastInputInfo(&mut info) == 0 {
                return Duration::ZERO;
            }

            let now = GetTickCount64();
            idle_duration_from_ticks(now, info.dwTime)
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl ActivitySource for WindowsActivitySource {
    fn idle_duration(&self) -> Duration {
        Duration::ZERO
    }
}

#[cfg(test)]
mod tests {
    use super::idle_duration_from_ticks;
    use std::time::Duration;

    #[test]
    fn idle_duration_uses_wrapping_32_bit_tick_math() {
        let now_after_wrap = u64::from(u32::MAX) + 11;

        assert_eq!(
            idle_duration_from_ticks(now_after_wrap, u32::MAX - 9),
            Duration::from_millis(20)
        );
    }
}
