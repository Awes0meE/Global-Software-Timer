//! Decides which top-level windows represent a user-facing app window.
//!
//! `IsWindowVisible` alone also accepts overlays, docks, tray message windows,
//! zero-size hosts and self-cloaked windows, which made always-on helpers look
//! like foreground apps. This module mirrors the taskbar/Alt+Tab heuristic and
//! attributes UWP frame windows to the hosted app process. Only window styles,
//! geometry and class names are read; window titles are never read.

use std::collections::HashSet;

pub const UWP_FRAME_CLASS: &str = "ApplicationFrameWindow";
pub const UWP_CORE_WINDOW_CLASS: &str = "Windows.UI.Core.CoreWindow";

const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const WS_EX_TRANSPARENT: u32 = 0x0000_0020;
const WS_EX_APPWINDOW: u32 = 0x0004_0000;
const WS_EX_LAYERED: u32 = 0x0008_0000;
const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
const DWM_CLOAKED_APP: u32 = 0x1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowFacts<'a> {
    pub visible: bool,
    /// Owned by another window the user can see (dialogs, popups, tool palettes).
    pub has_visible_owner: bool,
    pub ex_style: u32,
    pub cloaked: u32,
    pub iconic: bool,
    pub width: i32,
    pub height: i32,
    pub class_name: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowVerdict {
    /// Not a user-facing app window.
    Ignore,
    /// Counts for the process that owns the window.
    OwnProcess,
    /// A UWP frame; the hosted app process must be resolved from its children.
    UwpFrame,
}

pub fn classify_window(facts: &WindowFacts<'_>) -> WindowVerdict {
    if !facts.visible || facts.has_visible_owner {
        return WindowVerdict::Ignore;
    }
    let app_window = facts.ex_style & WS_EX_APPWINDOW != 0;
    if !app_window {
        if facts.ex_style & (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) != 0 {
            return WindowVerdict::Ignore;
        }
        // Click-through layered windows are overlays (game/GPU overlays, effects).
        let click_through = WS_EX_LAYERED | WS_EX_TRANSPARENT;
        if facts.ex_style & click_through == click_through {
            return WindowVerdict::Ignore;
        }
    }
    // Windows that cloak themselves are invisible to the user. Shell cloaking is
    // kept because it also covers windows parked on other virtual desktops.
    if facts.cloaked & DWM_CLOAKED_APP != 0 {
        return WindowVerdict::Ignore;
    }
    if !facts.iconic && (facts.width <= 1 || facts.height <= 1) {
        return WindowVerdict::Ignore;
    }
    if facts.class_name == UWP_FRAME_CLASS {
        return WindowVerdict::UwpFrame;
    }
    // A top-level CoreWindow is a suspended UWP app; live ones sit inside a frame.
    if facts.class_name == UWP_CORE_WINDOW_CLASS {
        return WindowVerdict::Ignore;
    }
    WindowVerdict::OwnProcess
}

/// PIDs that currently own at least one user-facing app window, or `None` when
/// window enumeration is unavailable.
#[cfg(target_os = "windows")]
pub fn app_window_pids() -> Option<HashSet<u32>> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::EnumWindows;

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let pids = unsafe { &mut *(lparam as *mut HashSet<u32>) };
        if let Some(pid) = unsafe { win32::app_window_pid(hwnd) } {
            pids.insert(pid);
        }
        1
    }

    let mut pids = HashSet::new();
    let succeeded = unsafe { EnumWindows(Some(collect), &mut pids as *mut HashSet<u32> as LPARAM) };
    (succeeded != 0).then_some(pids)
}

#[cfg(not(target_os = "windows"))]
pub fn app_window_pids() -> Option<HashSet<u32>> {
    None
}

/// The process that the user sees behind the current foreground window,
/// resolving UWP frames to the hosted app.
#[cfg(target_os = "windows")]
pub fn foreground_app_pid() -> Option<u32> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }
    unsafe {
        let pid = win32::window_pid(hwnd)?;
        if win32::class_name(hwnd) == UWP_FRAME_CLASS {
            Some(win32::uwp_hosted_pid(hwnd, pid).unwrap_or(pid))
        } else {
            Some(pid)
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn foreground_app_pid() -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
mod win32 {
    use super::{classify_window, WindowFacts, WindowVerdict};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, GetClassNameW, GetWindow, GetWindowLongPtrW, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, GW_OWNER,
    };

    pub unsafe fn window_pid(hwnd: HWND) -> Option<u32> {
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        (pid > 0).then_some(pid)
    }

    pub unsafe fn class_name(hwnd: HWND) -> String {
        let mut buffer = [0u16; 64];
        let length = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..length.max(0) as usize])
    }

    unsafe fn window_size(hwnd: HWND) -> (i32, i32) {
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        unsafe { GetWindowRect(hwnd, &mut rect) };
        (rect.right - rect.left, rect.bottom - rect.top)
    }

    /// Some frameworks own the main window from an invisible or zero-size
    /// helper window; those main windows still appear on the taskbar.
    unsafe fn has_visible_owner(hwnd: HWND) -> bool {
        let owner = unsafe { GetWindow(hwnd, GW_OWNER) };
        if owner.is_null() || unsafe { IsWindowVisible(owner) } == 0 {
            return false;
        }
        let (width, height) = unsafe { window_size(owner) };
        width > 1 && height > 1
    }

    pub unsafe fn app_window_pid(hwnd: HWND) -> Option<u32> {
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return None;
        }
        let pid = unsafe { window_pid(hwnd) }?;
        let class_name = unsafe { class_name(hwnd) };
        let (width, height) = unsafe { window_size(hwnd) };
        let mut cloaked = 0u32;
        let cloak_result = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED as u32,
                &mut cloaked as *mut u32 as *mut core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            )
        };
        let facts = WindowFacts {
            visible: true,
            has_visible_owner: unsafe { has_visible_owner(hwnd) },
            ex_style: unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32,
            cloaked: if cloak_result >= 0 { cloaked } else { 0 },
            iconic: unsafe { IsIconic(hwnd) } != 0,
            width,
            height,
            class_name: &class_name,
        };
        match classify_window(&facts) {
            WindowVerdict::Ignore => None,
            WindowVerdict::OwnProcess => Some(pid),
            WindowVerdict::UwpFrame => unsafe { uwp_hosted_pid(hwnd, pid) },
        }
    }

    /// The first child window owned by a process other than the frame host.
    pub unsafe fn uwp_hosted_pid(frame: HWND, frame_pid: u32) -> Option<u32> {
        struct Search {
            frame_pid: u32,
            found: Option<u32>,
        }

        unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let search = unsafe { &mut *(lparam as *mut Search) };
            match unsafe { window_pid(hwnd) } {
                Some(pid) if pid != search.frame_pid => {
                    search.found = Some(pid);
                    0
                }
                _ => 1,
            }
        }

        let mut search = Search {
            frame_pid,
            found: None,
        };
        unsafe {
            EnumChildWindows(frame, Some(visit), &mut search as *mut Search as LPARAM);
        }
        search.found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app_window() -> WindowFacts<'static> {
        WindowFacts {
            visible: true,
            has_visible_owner: false,
            ex_style: 0,
            cloaked: 0,
            iconic: false,
            width: 1200,
            height: 800,
            class_name: "Chrome_WidgetWin_1",
        }
    }

    #[test]
    fn ordinary_and_minimized_app_windows_count() {
        assert_eq!(classify_window(&app_window()), WindowVerdict::OwnProcess);
        let minimized = WindowFacts {
            iconic: true,
            width: 160,
            height: 28,
            ..app_window()
        };
        assert_eq!(classify_window(&minimized), WindowVerdict::OwnProcess);
    }

    #[test]
    fn hidden_owned_tool_and_noactivate_windows_are_ignored() {
        for facts in [
            WindowFacts {
                visible: false,
                ..app_window()
            },
            WindowFacts {
                has_visible_owner: true,
                ..app_window()
            },
            WindowFacts {
                ex_style: WS_EX_TOOLWINDOW,
                ..app_window()
            },
            WindowFacts {
                ex_style: WS_EX_NOACTIVATE,
                ..app_window()
            },
            WindowFacts {
                ex_style: WS_EX_LAYERED | WS_EX_TRANSPARENT,
                ..app_window()
            },
        ] {
            assert_eq!(classify_window(&facts), WindowVerdict::Ignore, "{facts:?}");
        }
    }

    #[test]
    fn explicit_app_window_style_overrides_tool_style() {
        let facts = WindowFacts {
            ex_style: WS_EX_TOOLWINDOW | WS_EX_APPWINDOW,
            ..app_window()
        };
        assert_eq!(classify_window(&facts), WindowVerdict::OwnProcess);
    }

    #[test]
    fn zero_size_and_self_cloaked_windows_are_ignored() {
        let zero = WindowFacts {
            width: 0,
            height: 0,
            ..app_window()
        };
        let cloaked = WindowFacts {
            cloaked: DWM_CLOAKED_APP,
            ..app_window()
        };
        assert_eq!(classify_window(&zero), WindowVerdict::Ignore);
        assert_eq!(classify_window(&cloaked), WindowVerdict::Ignore);
    }

    #[test]
    fn shell_cloaked_windows_on_other_virtual_desktops_still_count() {
        let other_desktop = WindowFacts {
            cloaked: 0x2,
            ..app_window()
        };
        assert_eq!(classify_window(&other_desktop), WindowVerdict::OwnProcess);
    }

    #[test]
    fn uwp_frames_resolve_to_hosted_app_and_bare_core_windows_are_ignored() {
        let frame = WindowFacts {
            class_name: UWP_FRAME_CLASS,
            ..app_window()
        };
        let suspended = WindowFacts {
            class_name: UWP_CORE_WINDOW_CLASS,
            ..app_window()
        };
        assert_eq!(classify_window(&frame), WindowVerdict::UwpFrame);
        assert_eq!(classify_window(&suspended), WindowVerdict::Ignore);
    }
}
