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

impl ForegroundWindowSource for WindowsForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        crate::window_info::foreground_app_pid()
    }
}
