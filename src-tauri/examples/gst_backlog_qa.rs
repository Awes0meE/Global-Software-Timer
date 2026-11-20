use global_software_timer_lib::{app_state::AppState, commands, tray};
use tauri::{webview::PageLoadEvent, Manager, WebviewWindowBuilder};

const CHECK_RENDER: &str = r##"
(async () => {
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
    const start = performance.now();
    openPage("软件");
    await waitFor(".discovered-row");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const elapsed = Math.round(performance.now() - start);

    openPage("设置");
    await waitFor("#settings-status-title");
    await report(elapsed < 1000, JSON.stringify({
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

#[tauri::command]
fn qa_report(app: tauri::AppHandle, success: bool, message: String) {
    println!("NATIVE QA {message}");
    app.exit(if success { 0 } else { 1 });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let snapshot = std::env::var_os("GST_BENCH_DB").ok_or("GST_BENCH_DB is required")?;
            app.manage(AppState::new(snapshot.into())?);
            tray::setup_tray(app)?;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(30));
                eprintln!("WebView2 did not complete the native render check within 30 seconds");
                // A stalled WebView can block the event loop that handles app.exit().
                std::process::exit(1);
            });
            let profile = tempfile::tempdir()?;
            WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                .data_directory(profile.path().to_owned())
                .build()?;
            app.manage(profile);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_settings,
            commands::get_dashboard_summary,
            commands::get_software_page_summary,
            qa_report
        ])
        .on_page_load(|window, event| {
            if matches!(event.event(), PageLoadEvent::Finished) {
                window.eval(CHECK_RENDER).expect("run native render check");
            }
        })
        .run(tauri::generate_context!(".backlog-qa/tauri.conf.json"))
        .expect("start native render check");
}
