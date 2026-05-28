use std::time::Duration;

pub trait ActivitySource: Send {
    fn idle_duration(&self) -> Duration;

    fn is_active(&self, threshold: Duration) -> bool {
        self.idle_duration() <= threshold
    }
}

#[derive(Debug, Default)]
pub struct WindowsActivitySource;

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
