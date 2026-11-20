use std::io;

const APP_MUTEX_NAME: &str = r"Local\GlobalSoftwareTimer.SingleInstance";

pub enum SingleInstance {
    Acquired(SingleInstanceGuard),
    AlreadyRunning,
}

pub fn acquire_app_lock() -> io::Result<SingleInstance> {
    try_acquire_single_instance(APP_MUTEX_NAME)
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::OsStr;
    use std::io;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    pub struct SingleInstanceGuard {
        handle: HANDLE,
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.handle);
            }
        }
    }

    pub fn try_acquire_single_instance(name: &str) -> io::Result<super::SingleInstance> {
        let wide_name = OsStr::new(name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let handle = unsafe { CreateMutexW(null(), 0, wide_name.as_ptr()) };

        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }

        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                CloseHandle(handle);
            }
            return Ok(super::SingleInstance::AlreadyRunning);
        }

        Ok(super::SingleInstance::Acquired(SingleInstanceGuard {
            handle,
        }))
    }
}

/// Shows and focuses the main window of an already running instance.
/// Only a window owned by a process running this same executable qualifies.
#[cfg(target_os = "windows")]
pub fn show_existing_window(title: &str) {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::path::PathBuf;
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
        SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
    };

    struct Search {
        title: Vec<u16>,
        exe: Option<PathBuf>,
        found: Option<HWND>,
    }

    fn process_image(pid: u32) -> Option<PathBuf> {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return None;
        }
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length) };
        unsafe { CloseHandle(handle) };
        (ok != 0).then(|| std::ffi::OsString::from_wide(&buffer[..length as usize]).into())
    }

    // The executable is checked first, so only this app's own window titles
    // are ever read; other applications' titles are never touched.
    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = unsafe { &mut *(lparam as *mut Search) };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        let same_exe = match (&search.exe, process_image(pid)) {
            (Some(ours), Some(theirs)) => ours
                .to_string_lossy()
                .eq_ignore_ascii_case(&theirs.to_string_lossy()),
            _ => false,
        };
        if !same_exe {
            return 1;
        }
        let length = unsafe { GetWindowTextLengthW(hwnd) };
        if length < 0 || length as usize != search.title.len() {
            return 1;
        }
        let mut text = vec![0u16; search.title.len() + 1];
        let copied = unsafe { GetWindowTextW(hwnd, text.as_mut_ptr(), text.len() as i32) };
        if text[..copied.max(0) as usize] == search.title[..] {
            search.found = Some(hwnd);
            return 0;
        }
        1
    }

    let mut search = Search {
        title: std::ffi::OsStr::new(title).encode_wide().collect(),
        exe: std::env::current_exe().ok(),
        found: None,
    };
    unsafe { EnumWindows(Some(visit), &mut search as *mut Search as LPARAM) };
    if let Some(hwnd) = search.found {
        unsafe {
            ShowWindow(
                hwnd,
                if IsIconic(hwnd) != 0 {
                    SW_RESTORE
                } else {
                    SW_SHOW
                },
            );
            SetForegroundWindow(hwnd);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn show_existing_window(_title: &str) {}

#[cfg(not(target_os = "windows"))]
mod platform {
    use std::io;

    pub struct SingleInstanceGuard;

    pub fn try_acquire_single_instance(_name: &str) -> io::Result<super::SingleInstance> {
        Ok(super::SingleInstance::Acquired(SingleInstanceGuard))
    }
}

pub use platform::SingleInstanceGuard;

pub fn try_acquire_single_instance(name: &str) -> io::Result<SingleInstance> {
    platform::try_acquire_single_instance(name)
}
