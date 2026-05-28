use std::time::Duration;

pub trait ActivitySource: Send {
    fn idle_duration(&self) -> Duration;

    fn is_active(&self, threshold: Duration) -> bool {
        self.idle_duration() <= threshold
    }
}

#[derive(Debug, Default)]
pub struct WindowsActivitySource;

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
            let last_input = info.dwTime as u64;
            Duration::from_millis(now.saturating_sub(last_input))
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl ActivitySource for WindowsActivitySource {
    fn idle_duration(&self) -> Duration {
        Duration::ZERO
    }
}
