pub trait ForegroundWindowSource: Send + Sync {
    fn foreground_pid(&self) -> Option<u32>;
}

pub struct NoForegroundWindowSource;

impl ForegroundWindowSource for NoForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        None
    }
}

pub struct WindowsForegroundWindowSource;

pub struct PlatformForegroundWindowSource;

impl ForegroundWindowSource for PlatformForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        #[cfg(target_os = "macos")]
        {
            return crate::macos_capture::capture_once()
                .ok()
                .and_then(|capture| crate::macos_capture::foreground_pid_from_capture(&capture));
        }

        #[cfg(target_os = "windows")]
        {
            return WindowsForegroundWindowSource.foreground_pid();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            None
        }
    }
}

#[cfg(target_os = "windows")]
impl ForegroundWindowSource for WindowsForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };

        let foreground_window = unsafe { GetForegroundWindow() };
        if foreground_window.is_null() {
            return None;
        }

        let mut process_id = 0;
        unsafe {
            GetWindowThreadProcessId(foreground_window, &mut process_id);
        }

        (process_id > 0).then_some(process_id)
    }
}

#[cfg(not(target_os = "windows"))]
impl ForegroundWindowSource for WindowsForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        None
    }
}
