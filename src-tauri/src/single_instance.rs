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
#[cfg(target_os = "windows")]
pub fn show_existing_window(title: &str) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, IsIconic, SetForegroundWindow, ShowWindowAsync, SW_RESTORE, SW_SHOW,
    };
    let class: Vec<u16> = "GlobalSoftwareTimer.MainWindow"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let title: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
    // The first process may still be constructing its WebView when the second starts.
    for _ in 0..40 {
        let mut hwnd = unsafe { FindWindowW(class.as_ptr(), std::ptr::null()) };
        if hwnd.is_null() {
            // Earlier builds used the default window class. Verify the process
            // behind an exact product-title match before activating a legacy window.
            hwnd = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
            if !hwnd.is_null() && !is_legacy_timer_window(hwnd) {
                hwnd = std::ptr::null_mut();
            }
        }
        if !hwnd.is_null() {
            unsafe {
                ShowWindowAsync(
                    hwnd,
                    if IsIconic(hwnd) != 0 {
                        SW_RESTORE
                    } else {
                        SW_SHOW
                    },
                );
                SetForegroundWindow(hwnd);
            }
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(75));
    }

    fn is_legacy_timer_window(hwnd: HWND) -> bool {
        use std::os::windows::ffi::OsStringExt;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return false;
        }
        let mut buffer = vec![0u16; 32768];
        let mut len = buffer.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut len) };
        unsafe { CloseHandle(process) };
        if ok == 0 {
            return false;
        }
        let path = std::path::PathBuf::from(std::ffi::OsString::from_wide(&buffer[..len as usize]));
        let ours = std::env::current_exe().ok();
        path.file_name().is_some_and(|name| {
            name.eq_ignore_ascii_case("global-software-timer.exe")
                || ours
                    .as_ref()
                    .and_then(|p| p.file_name())
                    .is_some_and(|own| name.eq_ignore_ascii_case(own))
        })
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
