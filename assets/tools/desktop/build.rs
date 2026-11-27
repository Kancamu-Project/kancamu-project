const COMMANDS: &[&str] = &["native_status", "native_install", "native_open", "native_remove"];

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("the build of the app failed");
}
