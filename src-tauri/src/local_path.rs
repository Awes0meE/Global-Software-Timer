//! Stored program paths can come from a restored backup someone else made, so
//! only a path on a lettered drive is handed to the file system. UNC and
//! device paths (`\\host\share`, `//host`, `\\?\UNC\…`, `\\.\…`) could make
//! GST connect to another computer.

/// Whether `path` is an absolute path on a drive letter: `C:\…`, `C:/…` or `\\?\C:\…`.
pub fn is_local_drive_path(path: &str) -> bool {
    let path = path.trim();
    let path = path.strip_prefix(r"\\?\").unwrap_or(path);
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drive_paths_are_local() {
        for path in [
            r"C:\Program Files\Code\Code.exe",
            "d:/Tools/app.exe",
            r"  X:\Fixtures\Code.exe ",
            r"\\?\C:\Very\Long\app.exe",
        ] {
            assert!(is_local_drive_path(path), "{path}");
        }
    }

    #[test]
    fn network_device_and_relative_paths_are_not() {
        for path in [
            r"\\attacker.example\share\Code.exe",
            r"\\attacker.example@80\x.ico",
            "//attacker.example/share/Code.exe",
            r"\\?\UNC\attacker.example\share\Code.exe",
            r"\\.\pipe\x",
            r"\\.\C:\app.exe",
            r"C:app.exe",
            r"Code.exe",
            r"\Windows\app.exe",
            "",
            "1:\\app.exe",
        ] {
            assert!(!is_local_drive_path(path), "{path}");
        }
    }
}
