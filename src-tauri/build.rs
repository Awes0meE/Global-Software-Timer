fn main() {
    tauri_build::build();
    // The native QA example needs the same Common Controls v6 manifest as the app.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!(
            "cargo:rustc-link-arg-examples={}/resource.lib",
            std::env::var("OUT_DIR").unwrap()
        );
    }
}
