use std::path::PathBuf;
use std::process::Command;

fn main() {
    compile_macos_capture_probe();
    tauri_build::build();
}

fn compile_macos_capture_probe() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let source = manifest_dir.join("native/macos/MacCaptureProbe.swift");
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("out dir"));
    let output = out_dir.join("gst-macos-capture-probe");

    println!("cargo:rerun-if-changed={}", source.display());

    let status = Command::new("xcrun")
        .args(["swiftc"])
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .status()
        .expect("failed to run xcrun swiftc for macOS capture probe");

    if !status.success() {
        panic!("xcrun swiftc failed for {}", source.display());
    }

    println!(
        "cargo:rustc-env=GST_MACOS_CAPTURE_HELPER={}",
        output.display()
    );
}
