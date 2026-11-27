use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

static ROOT: OnceLock<PathBuf> = OnceLock::new();

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Installed {
    pub version: String,
    pub kind: String,
    pub dir: Option<String>,
    pub exe: Option<String>,
    pub package: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct State {
    pub installed: BTreeMap<String, Installed>,
}

pub fn set_data_dir(path: PathBuf) {
    let _ = ROOT.set(path);
}

pub fn data_dir() -> PathBuf {
    ROOT.get().cloned().unwrap_or_else(|| std::env::temp_dir().join("desktop-native"))
}

pub fn load_state() -> State {
    fs::read_to_string(data_dir().join("state.json")).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

pub fn save_state(state: &State) -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let text = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    let temporary = dir.join("state.json.tmp");
    fs::write(&temporary, text).map_err(|error| error.to_string())?;
    fs::rename(&temporary, dir.join("state.json")).map_err(|error| error.to_string())
}
