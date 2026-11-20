//! Use the executable's multi-resolution clock for both native window icon slots.
use tauri::WebviewWindow;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    LoadImageW, SendMessageW, ICON_BIG, IDI_APPLICATION, IMAGE_ICON, LR_SHARED, SM_CXICON,
    WM_SETICON,
};

pub fn apply(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    // Tauri sets the small (caption) icon, while Explorer looks up ICON_BIG.
    window.set_icon(tauri::include_image!("./icons/32x32.png"))?;
    let hwnd = window.hwnd()?.0 as _;
    unsafe {
        // Tauri embeds icon.ico as resource 32512 (IDI_APPLICATION) in our module.
        let module = GetModuleHandleW(std::ptr::null());
        if module.is_null() {
            return Err(std::io::Error::last_os_error().into());
        }
        let dpi = GetDpiForWindow(hwnd);
        let size = GetSystemMetricsForDpi(SM_CXICON, dpi);
        // Module-owned handle, valid while Explorer uses the window.
        let icon = LoadImageW(module, IDI_APPLICATION, IMAGE_ICON, size, size, LR_SHARED);
        if icon.is_null() {
            return Err(std::io::Error::last_os_error().into());
        }
        SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, icon as isize);
    }
    Ok(())
}
