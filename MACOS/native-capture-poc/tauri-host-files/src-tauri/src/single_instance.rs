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

#[cfg(unix)]
mod platform {
    use std::fs::{File, OpenOptions};
    use std::io;
    use std::os::fd::AsRawFd;
    use std::os::raw::c_int;
    use std::path::PathBuf;

    const LOCK_EX: c_int = 2;
    const LOCK_NB: c_int = 4;
    const LOCK_UN: c_int = 8;

    unsafe extern "C" {
        fn flock(fd: c_int, operation: c_int) -> c_int;
    }

    pub struct SingleInstanceGuard {
        file: File,
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            unsafe {
                flock(self.file.as_raw_fd(), LOCK_UN);
            }
        }
    }

    pub fn try_acquire_single_instance(name: &str) -> io::Result<super::SingleInstance> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(lock_file_path(name))?;

        let result = unsafe { flock(file.as_raw_fd(), LOCK_EX | LOCK_NB) };
        if result == 0 {
            return Ok(super::SingleInstance::Acquired(SingleInstanceGuard {
                file,
            }));
        }

        let error = io::Error::last_os_error();
        if error.kind() == io::ErrorKind::WouldBlock {
            return Ok(super::SingleInstance::AlreadyRunning);
        }

        Err(error)
    }

    fn lock_file_path(name: &str) -> PathBuf {
        let mut slug = name
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                    character
                } else {
                    '_'
                }
            })
            .collect::<String>();

        if slug.is_empty() {
            slug.push_str("global-software-timer");
        }
        if slug.len() > 80 {
            slug.truncate(80);
        }

        std::env::temp_dir().join(format!("gst-{slug}-{}.lock", stable_hash(name)))
    }

    fn stable_hash(input: &str) -> String {
        let mut hash = 0xcbf2_9ce4_8422_2325u64;
        for byte in input.as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        format!("{hash:016x}")
    }
}

#[cfg(all(not(target_os = "windows"), not(unix)))]
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
