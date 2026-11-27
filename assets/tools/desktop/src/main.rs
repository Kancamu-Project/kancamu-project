#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod catalog;
mod github;
mod install;
mod platform;
mod store;
mod version;

use std::sync::Mutex;

use serde::Serialize;
use tauri::Manager;

static BUSY: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());

#[derive(Serialize)]
struct Installation {
    version: String,
    changed: bool,
}

struct Turn(&'static str);

impl Turn {
    fn take(id: &'static str) -> Result<Self, String> {
        let mut busy = BUSY.lock().map_err(|error| error.to_string())?;
        if busy.contains(&id) {
            return Err("This app is already being changed".to_string());
        }
        busy.push(id);
        Ok(Self(id))
    }
}

impl Drop for Turn {
    fn drop(&mut self) {
        if let Ok(mut busy) = BUSY.lock() {
            busy.retain(|id| *id != self.0);
        }
    }
}

fn app_of(id: &str) -> Result<&'static catalog::App, String> {
    catalog::find(id).ok_or_else(|| "This app is not in the list".to_string())
}

fn supported() -> Result<(), String> {
    if platform::can_install() { Ok(()) } else { Err("Installing native apps works on Windows only for now".to_string()) }
}

#[tauri::command]
fn native_status(id: String) -> Result<Option<String>, String> {
    supported()?;
    let app = app_of(&id)?;
    Ok(store::load_state().installed.get(app.id).map(|installed| installed.version.clone()))
}

#[tauri::command]
async fn native_install(id: String) -> Result<Installation, String> {
    supported()?;
    let app = app_of(&id)?;
    let turn = Turn::take(app.id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _turn = turn;
        let release = github::fetch_latest(&github::agent(), app.repo)?;
        let mut state = store::load_state();
        let previous = state.installed.get(app.id).cloned();
        if let Some(old) = &previous {
            if !version::is_newer(&release.version(), &old.version) {
                return Ok(Installation { version: old.version.clone(), changed: false });
            }
        }
        let installed = install::install(app, &release, previous.as_ref())?;
        let result = Installation { version: installed.version.clone(), changed: true };
        state.installed.insert(app.id.to_string(), installed);
        store::save_state(&state)?;
        Ok(result)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn native_open(id: String) -> Result<(), String> {
    supported()?;
    let app = app_of(&id)?;
    let installed = store::load_state().installed.get(app.id).cloned().ok_or("This app is not installed")?;
    install::open(&installed)
}

#[tauri::command]
async fn native_remove(id: String) -> Result<(), String> {
    supported()?;
    let app = app_of(&id)?;
    let turn = Turn::take(app.id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _turn = turn;
        let mut state = store::load_state();
        let installed = state.installed.get(app.id).cloned().ok_or("This app is not installed")?;
        install::uninstall(&installed)?;
        state.installed.remove(app.id);
        store::save_state(&state)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Ok(dir) = app.path().app_local_data_dir() {
                store::set_data_dir(dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![native_status, native_install, native_open, native_remove])
        .run(tauri::generate_context!())
        .expect("the window could not be opened");
}
