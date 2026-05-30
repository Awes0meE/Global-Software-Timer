use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static ICON_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

pub fn native_icon_data_url_for_path(executable_path: &str) -> Option<String> {
    let key = executable_path.trim();
    if key.is_empty() || !Path::new(key).exists() {
        return None;
    }

    let cache = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(icons) = cache.lock() {
        if let Some(icon) = icons.get(key) {
            return icon.clone();
        }
    }

    let path = Path::new(key);
    let icon = image_file_data_url(path)
        .or_else(|| {
            explicit_icon_candidates_for_path(path)
                .into_iter()
                .find_map(|candidate| image_file_data_url(&candidate))
        })
        .or_else(|| extract_native_icon_data_url(key));
    if let Ok(mut icons) = cache.lock() {
        icons.insert(key.to_string(), icon.clone());
    }
    icon
}

fn image_file_data_url(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    if !matches!(extension.as_str(), "ico" | "png") {
        return None;
    }

    let image = image::ImageReader::open(path).ok()?.decode().ok()?;
    let image = image.resize(64, 64, image::imageops::FilterType::Lanczos3);
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();

    encode_rgba_png_data_url(rgba.as_raw(), width, height)
}

fn explicit_icon_candidates_for_path(path: &Path) -> Vec<PathBuf> {
    let start_dir = if path.is_dir() {
        path
    } else {
        match path.parent() {
            Some(parent) => parent,
            None => return Vec::new(),
        }
    };
    let executable_stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    let mut dir = Some(start_dir);
    for _ in 0..5 {
        let Some(current_dir) = dir else {
            break;
        };

        for candidate in icon_candidates_in_dir(current_dir, &executable_stem) {
            if candidate.exists() && seen.insert(candidate.clone()) {
                candidates.push(candidate);
            }
        }
        dir = current_dir.parent();
    }

    candidates
}

fn icon_candidates_in_dir(dir: &Path, executable_stem: &str) -> Vec<PathBuf> {
    let mut candidates = vec![
        dir.join("resources").join("icon.ico"),
        dir.join("resources").join("icon.png"),
        dir.join("resources").join("app.ico"),
        dir.join("resources").join("app.png"),
        dir.join("assets").join("Square150x150Logo.png"),
        dir.join("assets").join("Square44x44Logo.png"),
        dir.join("assets").join("icon.png"),
        dir.join("Assets").join("Square150x150Logo.png"),
        dir.join("Assets").join("Square44x44Logo.png"),
        dir.join("Assets").join("icon.png"),
        dir.join("icons").join("icon.ico"),
        dir.join("icons").join("icon.png"),
        dir.join("icon.ico"),
        dir.join("icon.png"),
    ];
    candidates.extend(discover_icon_assets(dir, executable_stem));
    candidates
}

fn discover_icon_assets(dir: &Path, executable_stem: &str) -> Vec<PathBuf> {
    let search_dirs = [
        dir.to_path_buf(),
        dir.join("resources"),
        dir.join("assets"),
        dir.join("Assets"),
        dir.join("icons"),
        dir.join("Images"),
        dir.join("images"),
        dir.join("media"),
        dir.join("webview-ui"),
        dir.join("webview-ui").join("assets"),
    ];
    let mut scored_candidates = Vec::new();

    for search_dir in search_dirs {
        let Ok(entries) = std::fs::read_dir(search_dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let score = icon_asset_score(&path, executable_stem, is_broad_icon_search_dir(dir));
            if score > 0 {
                scored_candidates.push((score, path));
            }
        }
    }

    scored_candidates.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.file_name().cmp(&right.1.file_name()))
    });
    scored_candidates
        .into_iter()
        .map(|(_, path)| path)
        .collect()
}

fn icon_asset_score(path: &Path, executable_stem: &str, broad_dir: bool) -> i32 {
    let extension = path
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "ico" | "png") {
        return 0;
    }

    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let matches_executable = !executable_stem.is_empty() && file_name.contains(executable_stem);
    if broad_dir && !matches_executable {
        return 0;
    }

    let mut score = 0;
    if matches_executable {
        score += 110;
    }
    if file_name.contains("appicon") {
        score += 90;
    }
    if file_name.contains("icon") {
        score += 80;
    }
    if file_name.contains("logo") {
        score += 70;
    }
    if file_name.contains("square") {
        score += 55;
    }
    if file_name.contains("codex") {
        score += 45;
    }
    if extension == "ico" {
        score += 10;
    }

    score
}

fn is_broad_icon_search_dir(dir: &Path) -> bool {
    let name = dir
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    matches!(
        name.as_str(),
        "temp" | "tmp" | "windowsapps" | "program files" | "program files (x86)"
    )
}

fn encode_rgba_png_data_url(rgba: &[u8], width: u32, height: u32) -> Option<String> {
    use base64::Engine;
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(rgba, width, height, ColorType::Rgba8.into())
        .ok()?;

    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

#[cfg(target_os = "windows")]
fn extract_native_icon_data_url(executable_path: &str) -> Option<String> {
    use std::ffi::OsStr;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS,
    };
    use windows_sys::Win32::UI::Shell::{
        ExtractIconExW, SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};

    const ICON_SIZE: i32 = 48;

    if !looks_like_windows_executable(Path::new(executable_path)) {
        return None;
    }

    let wide_path = OsStr::new(executable_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let icon_count = unsafe { ExtractIconExW(wide_path.as_ptr(), -1, null_mut(), null_mut(), 0) };
    if icon_count == 0 {
        return None;
    }

    let mut shell_info: SHFILEINFOW = unsafe { zeroed() };
    let shell_result = unsafe {
        SHGetFileInfoW(
            wide_path.as_ptr(),
            0,
            &mut shell_info,
            size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if shell_result == 0 || shell_info.hIcon.is_null() {
        return None;
    }

    let mut bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: ICON_SIZE,
            biHeight: -ICON_SIZE,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [unsafe { zeroed() }],
    };
    let mut bits = null_mut();

    let memory_dc = unsafe { CreateCompatibleDC(null_mut()) };
    if memory_dc.is_null() {
        unsafe {
            DestroyIcon(shell_info.hIcon);
        }
        return None;
    }

    let bitmap = unsafe {
        CreateDIBSection(
            memory_dc,
            &mut bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            null_mut(),
            0,
        )
    };
    if bitmap.is_null() || bits.is_null() {
        unsafe {
            DeleteDC(memory_dc);
            DestroyIcon(shell_info.hIcon);
        }
        return None;
    }

    let old_object = unsafe { SelectObject(memory_dc, bitmap) };
    let drew_icon = unsafe {
        DrawIconEx(
            memory_dc,
            0,
            0,
            shell_info.hIcon,
            ICON_SIZE,
            ICON_SIZE,
            0,
            null_mut(),
            DI_NORMAL,
        )
    } != 0;

    let byte_len = (ICON_SIZE * ICON_SIZE * 4) as usize;
    let bgra = if drew_icon {
        unsafe { std::slice::from_raw_parts(bits.cast::<u8>(), byte_len) }.to_vec()
    } else {
        Vec::new()
    };

    unsafe {
        SelectObject(memory_dc, old_object);
        DeleteObject(bitmap);
        DeleteDC(memory_dc);
        DestroyIcon(shell_info.hIcon);
    }

    if bgra.is_empty() {
        return None;
    }

    let mut rgba = Vec::with_capacity(byte_len);
    for pixel in bgra.chunks_exact(4) {
        rgba.push(pixel[2]);
        rgba.push(pixel[1]);
        rgba.push(pixel[0]);
        rgba.push(pixel[3]);
    }

    encode_rgba_png_data_url(&rgba, ICON_SIZE as u32, ICON_SIZE as u32)
}

#[cfg(target_os = "windows")]
fn looks_like_windows_executable(path: &Path) -> bool {
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };

    bytes.starts_with(b"MZ")
}

#[cfg(not(target_os = "windows"))]
fn extract_native_icon_data_url(_executable_path: &str) -> Option<String> {
    None
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::native_icon_data_url_for_path;
    use std::path::Path;

    #[test]
    fn finds_packaged_icon_files_near_executable() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let app_dir = temp_dir.path().join("app");
        let resources_dir = app_dir.join("resources");
        std::fs::create_dir_all(&resources_dir).expect("resources dir");
        let executable_path = app_dir.join("Codex.exe");
        let icon_path = resources_dir.join("icon.ico");
        std::fs::write(&executable_path, []).expect("exe placeholder");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates = super::explicit_icon_candidates_for_path(&executable_path);

        assert_eq!(candidates.first(), Some(&icon_path));
    }

    #[test]
    fn finds_named_logo_assets_near_executable() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let app_dir = temp_dir.path().join("app");
        let resources_dir = app_dir.join("resources");
        std::fs::create_dir_all(&resources_dir).expect("resources dir");
        let executable_path = app_dir.join("Codex.exe");
        let icon_path = resources_dir.join("codex-logo.png");
        std::fs::write(&executable_path, []).expect("exe placeholder");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates = super::explicit_icon_candidates_for_path(&executable_path);

        assert!(candidates.contains(&icon_path));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ignores_generic_shell_icon_for_executable_without_embedded_icon() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let executable_path = temp_dir.path().join("helper.exe");
        std::fs::write(&executable_path, []).expect("exe placeholder");

        let icon = native_icon_data_url_for_path(&executable_path.to_string_lossy());

        assert!(icon.is_none());
    }

    #[test]
    fn extracts_shell_icon_for_existing_executable() {
        let windows_dir = std::env::var("WINDIR").expect("WINDIR");
        let notepad = Path::new(&windows_dir).join("System32").join("notepad.exe");
        let icon = native_icon_data_url_for_path(&notepad.to_string_lossy()).expect("icon");

        assert!(icon.starts_with("data:image/png;base64,"));
    }
}
