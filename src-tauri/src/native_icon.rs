use std::collections::HashMap;
use std::path::Path;
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

    let icon = extract_native_icon_data_url(key);
    if let Ok(mut icons) = cache.lock() {
        icons.insert(key.to_string(), icon.clone());
    }
    icon
}

#[cfg(target_os = "windows")]
fn extract_native_icon_data_url(executable_path: &str) -> Option<String> {
    use base64::Engine;
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
    use std::ffi::OsStr;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS,
    };
    use windows_sys::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};

    const ICON_SIZE: i32 = 48;

    let wide_path = OsStr::new(executable_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

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

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(
            &rgba,
            ICON_SIZE as u32,
            ICON_SIZE as u32,
            ColorType::Rgba8.into(),
        )
        .ok()?;

    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

#[cfg(not(target_os = "windows"))]
fn extract_native_icon_data_url(_executable_path: &str) -> Option<String> {
    None
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::native_icon_data_url_for_path;

    #[test]
    fn extracts_shell_icon_for_existing_executable() {
        let current_exe = std::env::current_exe().expect("current exe");
        let icon = native_icon_data_url_for_path(&current_exe.to_string_lossy()).expect("icon");

        assert!(icon.starts_with("data:image/png;base64,"));
    }
}
