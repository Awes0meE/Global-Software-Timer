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
