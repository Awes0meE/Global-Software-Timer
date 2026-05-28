pub mod activity;
pub mod classifier;
pub mod domain;
pub mod process_source;
pub mod storage;
pub mod tracker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}
