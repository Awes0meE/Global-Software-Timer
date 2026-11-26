use global_software_timer_lib::{app_state::AppState, commands, storage::Store, tray};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};
use tauri::{Manager, WebviewWindowBuilder};

const CHECK_RENDER: &str = r##"
(async () => {
  if (window.top !== window || location.href === "about:blank") return;
  async function waitFor(selector) {
    const deadline = performance.now() + 10000;
    while (performance.now() < deadline) {
      const element = document.querySelector(selector);
      if (element?.getBoundingClientRect().height > 0) return element;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error("Timed out waiting for " + selector);
  }

  function openPage(label) {
    const button = [...document.querySelectorAll("nav button")]
      .find(item => item.textContent === label);
    button.click();
  }

  const report = (success, message) =>
    window.__TAURI_INTERNALS__.invoke("qa_report", { success, message });
  try {
    await waitFor(".usage-scroll .usage-row");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const overviewPaint = Math.round(performance.now());
    const start = performance.now();
    openPage("软件");
    await waitFor(".discovered-row");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const elapsed = Math.round(performance.now() - start);

    openPage("设置");
    await waitFor(".settings-readout .settings-slogan");
    await report(elapsed < 1000, JSON.stringify({
      overview_data_paint_ms: overviewPaint,
      software_first_paint_ms: elapsed,
      settings_status_visible: true,
      tray_created: true,
      scale: devicePixelRatio,
    }));
  } catch (error) {
    await report(false, String(error));
  }
})();
"##;

struct RenderReceipt(PathBuf);

#[tauri::command]
fn qa_report(app: tauri::AppHandle, success: bool, message: String) {
    #[cfg(windows)]
    let success = {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SendMessageW, ICON_BIG, WM_GETICON};
        let window = app.get_webview_window("main").expect("main window");
        let hwnd = window.hwnd().expect("native window").0 as _;
        let taskbar_icon = unsafe { SendMessageW(hwnd, WM_GETICON, ICON_BIG as usize, 0) } != 0;
        println!("Native taskbar icon present: {taskbar_icon}");
        success && taskbar_icon
    };
    println!("NATIVE QA {message}");
    if success {
        std::fs::write(&app.state::<RenderReceipt>().0, &message).expect("record completed render");
    }
    app.exit(if success { 0 } else { 1 });
}

// The snapshot includes committed WAL pages. Only the private copy undergoes
// normal startup migration and open-session recovery.
fn copy_qa_database(
    source: &Path,
    directory: &Path,
) -> Result<tempfile::TempPath, Box<dyn std::error::Error>> {
    let source = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let copy = tempfile::NamedTempFile::new_in(directory)?.into_temp_path();
    let mut dest = Connection::open(&copy)?;
    rusqlite::backup::Backup::new(&source, &mut dest)?.run_to_completion(
        512,
        std::time::Duration::from_millis(1),
        None,
    )?;
    Ok(copy)
}

// The hosted Windows check uses synthetic history; local runs can supply GST_BENCH_DB.
fn fixture_database(directory: &Path) -> Result<tempfile::TempPath, Box<dyn std::error::Error>> {
    let db = tempfile::NamedTempFile::new_in(directory)?.into_temp_path();
    let store = Store::open(&db)?;
    store.migrate()?;
    let batch = store.savepoint()?;
    let now = chrono::Utc::now();
    for i in 0..200 {
        let name = format!("Sample{i}");
        let process = format!("{name}.exe");
        let app = store.upsert_app(&process, &format!(r"C:\Apps\{name}\{process}"), &name)?;
        for day in 0..16 {
            let end = now - chrono::Duration::days(day);
            let session = store.start_session(app.id, end - chrono::Duration::minutes(15))?;
            store.close_session(session, end, "process_closed", false)?;
        }
    }
    batch.commit()?;
    drop(store);

    // Historical events dominate long-running installations. Keep them on disk
    // so a regression that scans the event log shows up in the render check.
    let history = Connection::open(&db)?;
    history.execute(
        "WITH RECURSIVE sample(n) AS (
            VALUES (1) UNION ALL SELECT n + 1 FROM sample WHERE n < 10900000
         ) INSERT INTO run_events (app_id, event_kind, payload_json)
           SELECT 1 + n % 200, 'sample_observed', json_object('sample', 1) FROM sample",
        [],
    )?;
    drop(history);
    println!(
        "Synthetic history size: {} bytes",
        std::fs::metadata(&db)?.len()
    );
    Ok(db)
}

fn main() -> Result<std::process::ExitCode, Box<dyn std::error::Error>> {
    // The parent owns the temporary files even if WebView startup aborts the child.
    if let Some(dir) = std::env::args_os().nth(1) {
        let db = match std::env::var_os("GST_BENCH_DB") {
            Some(source) => copy_qa_database(Path::new(&source), Path::new(&dir))?,
            None => fixture_database(Path::new(&dir))?,
        };
        run_window(&db, Path::new(&dir));
        return Ok(std::process::ExitCode::SUCCESS);
    }
    let scratch = tempfile::tempdir()?;
    let status = std::process::Command::new(std::env::current_exe()?)
        .arg(scratch.path())
        .status()?;
    Ok(
        if status.success() && scratch.path().join("render-passed.json").is_file() {
            std::process::ExitCode::SUCCESS
        } else {
            std::process::ExitCode::FAILURE
        },
    )
}

fn run_window(db: &Path, scratch: &Path) {
    let db = db.to_owned();
    let profile = scratch.join("webview");
    let receipt = RenderReceipt(scratch.join("render-passed.json"));
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(30));
        eprintln!("WebView2 did not complete the native render check within 30 seconds");
        std::process::exit(1);
    });
    tauri::Builder::default()
        .manage(receipt)
        .setup(move |app| {
            app.manage(AppState::new(db)?);
            tray::setup_tray(app)?;
            let window =
                WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                    .data_directory(profile)
                    .initialization_script(CHECK_RENDER)
                    .build()?;
            #[cfg(windows)]
            global_software_timer_lib::window_icon::apply(&window)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_settings,
            commands::get_dashboard_summary,
            commands::get_software_page_summary,
            qa_report
        ])
        .run(tauri::generate_context!(".backlog-qa/tauri.conf.json"))
        .expect("start native render check");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qa_copy_includes_wal_and_isolates_writes() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("source.sqlite3");
        assert!(copy_qa_database(&original, dir.path()).is_err());
        assert!(!original.exists());
        let writer = Connection::open(&original).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
            CREATE TABLE sessions(ended INTEGER); INSERT INTO sessions VALUES(NULL);",
            )
            .unwrap();
        let copy = copy_qa_database(&original, dir.path()).unwrap();
        let snapshot = Connection::open(copy).unwrap();
        assert_eq!(
            snapshot
                .execute("UPDATE sessions SET ended = 1 WHERE ended IS NULL", [])
                .unwrap(),
            1
        );
        let still_open: bool = writer
            .query_row("SELECT ended IS NULL FROM sessions", [], |r| r.get(0))
            .unwrap();
        assert!(still_open);
    }
}
