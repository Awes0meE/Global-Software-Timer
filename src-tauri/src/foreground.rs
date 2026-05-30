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
