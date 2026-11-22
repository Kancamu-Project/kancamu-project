//! muai-helper: lets muAI (https://kancamu.site/muai/) write, edit, read, list, and search files on this PC, in ONE folder that you choose.
//!
//! A web page cannot write to your disk by itself, so muAI asks this small program, which runs on your PC and listens on 127.0.0.1 only.
//! What keeps it safe:
//!   - it listens on 127.0.0.1 (this PC), never on the network;
//!   - every request needs the token that is printed when it starts (a random one, new at every start unless you give --token);
//!   - muAI gets the token by itself ("pairing"), but only after YOU allow its origin here, in this terminal (once: the answer is kept in a file);
//!   - a web page can use it only when its address is in the list of allowed origins (https://kancamu.site, plus the ones you add with --origin);
//!   - the Host header must be this PC (a defence against DNS rebinding);
//!   - every path is relative to the folder you chose: no "..", no drive letters, no absolute paths, no links that lead out of the folder;
//!   - a file is written whole into a temporary file and then renamed, and an existing file is replaced only when the request says so.
//!
//! Usage:  muai-helper [--dir <folder>] [--port 47615] [--origin <address>]... [--token <text>] [--yes] [--allow-broad]
//!   --dir          the one folder muAI may use (the folder where you are, when it is not given)
//!   --yes          allow the origins of the list without asking (less safe: for a computer without a terminal)
//!   --allow-broad  allow the root of a drive or your home folder as the folder (it is refused otherwise: it is too much)

use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, IsTerminal, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

const DEFAULT_PORT: u16 = 47615;
const DEFAULT_ORIGIN: &str = "https://kancamu.site";
const MAX_BODY: u64 = 8 * 1024 * 1024; // a request
const MAX_READ: u64 = 1024 * 1024; // a file that is read
const MAX_LIST: usize = 500; // the entries of a folder that are listed

struct Config {
    root: PathBuf, // the folder, as the system names it (no links)
    token: String,
    port: u16,
    origins: Vec<String>,
    yes: bool,                          // the origins of the list are allowed without asking
    approvals: Arc<Mutex<Approvals>>,   // the origins that were allowed (kept in a file), refused, or are waiting for an answer
}

impl Config {
    fn new(root: PathBuf, token: String, port: u16, origins: Vec<String>) -> Config {
        Config { root, token, port, origins, yes: false, approvals: Arc::new(Mutex::new(Approvals::default())) }
    }
}

/* ---------- the pairing: muAI gets the token by itself, after the user allowed its origin in the terminal ---------- */

#[derive(Default)]
struct Approvals {
    path: Option<PathBuf>, // the file that keeps the allowed origins
    approved: HashSet<String>,
    denied: HashSet<String>, // until the program is started again
    pending: HashSet<String>,
}

#[derive(Debug, PartialEq)]
enum Pairing {
    Approved,
    Pending,
    Denied,
}

impl Approvals {
    fn load(path: Option<PathBuf>) -> Approvals {
        let approved = path
            .as_ref()
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
            .unwrap_or_default()
            .into_iter()
            .collect();
        Approvals { path, approved, ..Approvals::default() }
    }

    fn save(&self) {
        let Some(path) = &self.path else { return };
        let mut list: Vec<&String> = self.approved.iter().collect();
        list.sort();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, json!(list).to_string());
    }

    /// What an origin gets now, and whether somebody has to be asked (the first time it is seen)
    fn register(&mut self, origin: &str, yes: bool) -> (Pairing, bool) {
        if self.approved.contains(origin) {
            return (Pairing::Approved, false);
        }
        if self.denied.contains(origin) {
            return (Pairing::Denied, false);
        }
        if yes {
            self.approved.insert(origin.to_string());
            self.save();
            return (Pairing::Approved, false);
        }
        (Pairing::Pending, self.pending.insert(origin.to_string()))
    }
}

fn approvals_file() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    Some(base.join("muai-helper").join("allowed-origins.json"))
}

static PROMPT: Mutex<()> = Mutex::new(()); // one question at a time in the terminal

/// The question in the terminal. It is asked in a thread, so the requests go on (the page asks again until it has the answer).
fn ask_in_terminal(approvals: Arc<Mutex<Approvals>>, origin: String, folder: String) {
    std::thread::spawn(move || {
        let _one_at_a_time = PROMPT.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let answer = if std::io::stdin().is_terminal() {
            print!("\n>>> The page {origin} asks to use this folder:\n    {folder}\n    Allow it? (y/N) ");
            let _ = std::io::stdout().flush();
            let mut line = String::new();
            let _ = std::io::stdin().lock().read_line(&mut line);
            line.trim().eq_ignore_ascii_case("y") || line.trim().eq_ignore_ascii_case("yes")
        } else {
            println!("\nThe page {origin} asks to use this folder, but there is no terminal to ask in. Start it again in a terminal, or with --yes.");
            false
        };
        let mut approvals = approvals.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        approvals.pending.remove(&origin);
        if answer {
            approvals.approved.insert(origin.clone());
            approvals.save();
            println!("    Allowed. muAI is connected.\n");
        } else {
            approvals.denied.insert(origin.clone());
            println!("    Not allowed. Start the program again if you change your mind.\n");
        }
    });
}

fn pair_status(config: &Config, origin: &str) -> Pairing {
    let (status, ask) = config.approvals.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).register(origin, config.yes);
    if ask {
        ask_in_terminal(config.approvals.clone(), origin.to_string(), display(&config.root));
    }
    status
}

fn main() {
    let config = match parse_args(std::env::args().skip(1).collect()) {
        Ok(config) => config,
        Err(message) => {
            eprintln!("{message}\n\nUsage: muai-helper --dir <folder> [--port {DEFAULT_PORT}] [--origin <address>]... [--token <text>]");
            std::process::exit(2);
        }
    };
    let address = format!("127.0.0.1:{}", config.port);
    let server = match Server::http(&address) {
        Ok(server) => server,
        Err(error) => {
            eprintln!("It cannot listen on {address}: {error}\nIs another muai-helper already running? Use --port to choose another port.");
            std::process::exit(1);
        }
    };
    println!("muai-helper {} is running.", env!("CARGO_PKG_VERSION"));
    println!("  Folder : {}", display(&config.root));
    println!("  Address: http://{address}");
    println!("  Token  : {}", config.token);
    println!("  Origins: {}", config.origins.join(", "));
    println!("muAI finds this program and connects by itself (it asks here the first time). Press Ctrl+C to stop.\n");
    for request in server.incoming_requests() {
        handle(&config, request);
    }
}

fn parse_args(args: Vec<String>) -> Result<Config, String> {
    let (mut dir, mut port, mut token, mut origins) = (None, DEFAULT_PORT, None, vec![DEFAULT_ORIGIN.to_string()]);
    let (mut yes, mut allow_broad) = (false, false);
    // more origins can also come from the variable MUAI_ORIGINS (addresses separated by commas), for a program that is started by a script
    if let Ok(more) = std::env::var("MUAI_ORIGINS") {
        origins.extend(more.split(',').map(|origin| origin.trim().trim_end_matches('/').to_string()).filter(|origin| !origin.is_empty()));
    }
    let mut iter = args.into_iter();
    while let Some(flag) = iter.next() {
        let mut value = |name: &str| iter.next().ok_or_else(|| format!("{name} needs a value"));
        match flag.as_str() {
            "--dir" => dir = Some(value("--dir")?),
            "--port" => port = value("--port")?.parse().map_err(|_| "--port must be a number from 1 to 65535".to_string())?,
            "--token" => token = Some(value("--token")?),
            "--origin" => origins.push(value("--origin")?.trim_end_matches('/').to_string()),
            "--yes" => yes = true,
            "--allow-broad" => allow_broad = true,
            "--help" | "-h" => return Err("muai-helper lets muAI write files in one folder of this PC.".to_string()),
            other => return Err(format!("unknown option: {other}")),
        }
    }
    // without --dir it is the folder where the program was started: the folder of the project
    let dir = match dir {
        Some(dir) => dir,
        None => std::env::current_dir().map_err(|error| format!("the folder where you are cannot be read: {error}"))?.to_string_lossy().to_string(),
    };
    let root = fs::canonicalize(&dir).map_err(|error| format!("the folder {dir} cannot be used: {error}"))?;
    if !root.is_dir() {
        return Err(format!("{dir} is not a folder"));
    }
    if !allow_broad && is_broad(&root) {
        return Err(format!("{} is the root of a drive or your home folder: that is too much for an AI. Go to a project folder first (or give --dir), or add --allow-broad if you really want it.", display(&root)));
    }
    let token = match token {
        Some(token) if token.len() >= 16 => token,
        Some(_) => return Err("--token must have at least 16 characters".to_string()),
        None => random_token(),
    };
    let mut config = Config::new(root, token, port, origins);
    config.yes = yes;
    config.approvals = Arc::new(Mutex::new(Approvals::load(approvals_file())));
    Ok(config)
}

/// The root of a drive, or the home folder of the user
fn is_broad(root: &Path) -> bool {
    if root.parent().is_none() {
        return true;
    }
    ["USERPROFILE", "HOME"].iter().filter_map(|name| std::env::var_os(name)).filter_map(|home| fs::canonicalize(home).ok()).any(|home| home == root)
}

fn random_token() -> String {
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).expect("the system has no random numbers");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

// A path as it is shown to the user (the system form of a Windows path starts with \\?\)
fn display(path: &Path) -> String {
    path.display().to_string().trim_start_matches(r"\\?\").to_string()
}

/* ---------- the paths ---------- */

// Windows does not allow these names (with or without an extension)
fn reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit() && stem.as_bytes()[3] != b'0')
}

/// The parts of a path that was written relative to the folder, or why it is refused.
fn parts(relative: &str, allow_empty: bool) -> Result<Vec<String>, String> {
    if relative.contains('\0') {
        return Err("the path has a null character".into());
    }
    let normal = relative.replace('\\', "/");
    if normal.starts_with('/') || normal.contains(':') {
        return Err("the path must be relative to the folder: no leading slash, no drive letter".into());
    }
    let mut result = Vec::new();
    for component in Path::new(&normal).components() {
        match component {
            Component::Normal(name) => {
                let name = name.to_string_lossy().to_string();
                if name.ends_with('.') || name.ends_with(' ') || reserved(&name) || name.chars().any(|c| matches!(c, '<' | '>' | '"' | '|' | '?' | '*') || c.is_control()) {
                    return Err(format!("the name \"{name}\" cannot be used"));
                }
                result.push(name);
            }
            Component::CurDir => {}
            _ => return Err("the path cannot go up (\"..\") or start from a root".into()),
        }
    }
    if result.is_empty() && !allow_empty {
        return Err("the path is empty".into());
    }
    Ok(result)
}

/// The place of a path inside the folder. The result is inside the folder even when a link on the way leads out of it (that is refused).
fn resolve(root: &Path, relative: &str, allow_empty: bool) -> Result<PathBuf, String> {
    let names = parts(relative, allow_empty)?;
    let target = names.iter().fold(root.to_path_buf(), |path, name| path.join(name));
    // the part that exists is looked at as the system names it (links followed), and it must be inside the folder
    let mut existing = target.as_path();
    let mut missing: Vec<&std::ffi::OsStr> = Vec::new();
    while !existing.exists() {
        match (existing.file_name(), existing.parent()) {
            (Some(name), Some(parent)) => {
                missing.push(name);
                existing = parent;
            }
            _ => return Err("the path cannot be used".into()),
        }
    }
    let real = fs::canonicalize(existing).map_err(|error| error.to_string())?;
    if !real.starts_with(root) {
        return Err("the path leads out of the folder".into());
    }
    Ok(missing.iter().rev().fold(real, |path, name| path.join(name)))
}

fn relative_name(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/* ---------- the operations ---------- */

type Done = Result<Value, (u16, String)>;
const BAD: u16 = 400;
const SKIPPED: [&str; 2] = [".git", "node_modules"]; // folders that a recursive list and a search do not enter
const MAX_FILE: u64 = 10 * 1024 * 1024; // a file after an append or an edit
const MAX_SCAN: usize = 5000; // files that a search or a recursive list looks at
const MAX_DEPTH: usize = 12;

fn text<'a>(body: &'a Value, key: &str) -> Result<&'a str, (u16, String)> {
    body.get(key).and_then(Value::as_str).ok_or((BAD, format!("\"{key}\" is missing or is not a text")))
}

fn io_error(error: std::io::Error) -> (u16, String) {
    (500, error.to_string())
}

/// A file is written whole into a temporary file of its folder and then renamed over the target, so a file is never half written.
fn atomic_write(target: &Path, content: &str) -> Result<(), (u16, String)> {
    let parent = target.parent().ok_or((BAD, "the path has no folder".to_string()))?;
    let mut random = [0u8; 6];
    getrandom::getrandom(&mut random).map_err(|error| (500, error.to_string()))?;
    let temporary = parent.join(format!(".muai-{}.tmp", random.iter().map(|b| format!("{b:02x}")).collect::<String>()));
    let written = fs::File::create(&temporary).and_then(|mut file| file.write_all(content.as_bytes()).and_then(|_| file.sync_all()));
    if let Err(error) = written.and_then(|_| fs::rename(&temporary, target)) {
        let _ = fs::remove_file(&temporary);
        return Err(io_error(error));
    }
    Ok(())
}

/// The text of an existing file (UTF-8, not bigger than the limit)
fn read_text(target: &Path, limit: u64) -> Result<String, (u16, String)> {
    let metadata = fs::metadata(target).map_err(|_| (404, "no such file".to_string()))?;
    if !metadata.is_file() {
        return Err((BAD, "it is not a file".into()));
    }
    if metadata.len() > limit {
        return Err((413, format!("the file is bigger than {} KB", limit / 1024)));
    }
    String::from_utf8(fs::read(target).map_err(io_error)?).map_err(|_| (415, "the file is not a text (UTF-8)".to_string()))
}

fn write_file(config: &Config, body: &Value) -> Done {
    let content = text(body, "content")?;
    let overwrite = body.get("overwrite").and_then(Value::as_bool).unwrap_or(false);
    let append = body.get("append").and_then(Value::as_bool).unwrap_or(false);
    let target = resolve(&config.root, text(body, "path")?, false).map_err(|message| (BAD, message))?;
    let existed = target.exists();
    if target.is_dir() {
        return Err((409, "a folder has this name".into()));
    }
    if existed && !overwrite && !append {
        return Err((409, "the file exists: send \"overwrite\": true to replace it, or \"append\": true to add to it".into()));
    }
    let parent = target.parent().ok_or((BAD, "the path has no folder".to_string()))?;
    fs::create_dir_all(parent).map_err(io_error)?;
    // inside the folder again after the folders were made (a link could have been put there meanwhile)
    if !fs::canonicalize(parent).map_err(io_error)?.starts_with(&config.root) {
        return Err((BAD, "the path leads out of the folder".into()));
    }
    if append {
        let current = if existed { fs::metadata(&target).map_err(io_error)?.len() } else { 0 };
        if current + content.len() as u64 > MAX_FILE {
            return Err((413, format!("the file would be bigger than {} MB", MAX_FILE / 1024 / 1024)));
        }
        let mut file = fs::OpenOptions::new().create(true).append(true).open(&target).map_err(io_error)?;
        file.write_all(content.as_bytes()).map_err(io_error)?;
        println!("append {} (+{} bytes)", relative_name(&config.root, &target), content.len());
        return Ok(json!({ "ok": true, "path": relative_name(&config.root, &target), "bytes": content.len(), "created": !existed, "appended": true }));
    }
    atomic_write(&target, content)?;
    println!("write {} ({} bytes{})", relative_name(&config.root, &target), content.len(), if existed { ", replaced" } else { "" });
    Ok(json!({ "ok": true, "path": relative_name(&config.root, &target), "bytes": content.len(), "created": !existed }))
}

/// Replaces a text of a file by another one: the text must be found once (or replace_all must be true), so an edit never lands in the wrong place.
fn edit_file(config: &Config, body: &Value) -> Done {
    let old = text(body, "old")?;
    let new = text(body, "new")?;
    let replace_all = body.get("replace_all").and_then(Value::as_bool).unwrap_or(false);
    if old.is_empty() {
        return Err((BAD, "\"old\" is empty".into()));
    }
    let target = resolve(&config.root, text(body, "path")?, false).map_err(|message| (BAD, message))?;
    let content = read_text(&target, MAX_FILE)?;
    let found = content.matches(old).count();
    if found == 0 {
        return Err((404, "the text to replace is not in the file (it must match exactly, spaces and line ends included)".into()));
    }
    if found > 1 && !replace_all {
        return Err((409, format!("the text is found {found} times: give more of the text around it, or send \"replace_all\": true")));
    }
    let edited = if replace_all { content.replace(old, new) } else { content.replacen(old, new, 1) };
    if edited.len() as u64 > MAX_FILE {
        return Err((413, format!("the file would be bigger than {} MB", MAX_FILE / 1024 / 1024)));
    }
    atomic_write(&target, &edited)?;
    let replacements = if replace_all { found } else { 1 };
    println!("edit  {} ({replacements} replaced)", relative_name(&config.root, &target));
    Ok(json!({ "ok": true, "path": relative_name(&config.root, &target), "replacements": replacements, "bytes": edited.len() }))
}

/// A whole file, or only some of its lines: "offset" (the first line, from 1) and "limit" (how many lines)
fn read_file(config: &Config, body: &Value) -> Done {
    let target = resolve(&config.root, text(body, "path")?, false).map_err(|message| (BAD, message))?;
    let content = read_text(&target, MAX_READ)?;
    let offset = body.get("offset").and_then(Value::as_u64).unwrap_or(1).max(1) as usize;
    let limit = body.get("limit").and_then(Value::as_u64).map(|n| n as usize);
    let total = content.lines().count();
    let path = relative_name(&config.root, &target);
    println!("read  {path} ({} bytes)", content.len());
    if offset == 1 && limit.is_none() {
        return Ok(json!({ "path": path, "content": content, "bytes": content.len(), "total_lines": total }));
    }
    let lines: Vec<&str> = content.lines().skip(offset - 1).take(limit.unwrap_or(usize::MAX)).collect();
    Ok(json!({ "path": path, "content": lines.join("\n"), "from": offset, "to": offset + lines.len().saturating_sub(1), "total_lines": total }))
}

/// The files and folders under a folder (not the links), up to MAX_SCAN files and the depth of MAX_DEPTH
fn walk(dir: &Path, depth: usize, out: &mut Vec<(PathBuf, bool, u64)>) {
    let Ok(reader) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = reader.filter_map(Result::ok).collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        if out.len() >= MAX_SCAN {
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(".muai-") && name.ends_with(".tmp") {
            continue;
        }
        let Ok(metadata) = fs::symlink_metadata(entry.path()) else { continue };
        if metadata.file_type().is_symlink() {
            continue;
        }
        out.push((entry.path(), metadata.is_dir(), metadata.len()));
        if metadata.is_dir() && depth < MAX_DEPTH && !SKIPPED.contains(&name.as_str()) {
            walk(&entry.path(), depth + 1, out);
        }
    }
}

fn list_files(config: &Config, body: &Value) -> Done {
    let relative = body.get("path").and_then(Value::as_str).unwrap_or("");
    let recursive = body.get("recursive").and_then(Value::as_bool).unwrap_or(false);
    let target = resolve(&config.root, relative, true).map_err(|message| (BAD, message))?;
    let mut entries: Vec<(String, bool, u64)> = if recursive {
        let mut found = Vec::new();
        walk(&target, 0, &mut found);
        found.into_iter().map(|(path, dir, bytes)| (path.strip_prefix(&target).unwrap_or(&path).to_string_lossy().replace('\\', "/"), dir, bytes)).collect()
    } else {
        let reader = fs::read_dir(&target).map_err(|_| (404, "no such folder".to_string()))?;
        let mut flat: Vec<(String, bool, u64)> = reader
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(".muai-") && name.ends_with(".tmp") {
                    return None;
                }
                let metadata = entry.metadata().ok()?;
                Some((name, metadata.is_dir(), metadata.len()))
            })
            .collect();
        flat.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.to_lowercase().cmp(&b.0.to_lowercase())));
        flat
    };
    let truncated = entries.len() > MAX_LIST;
    entries.truncate(MAX_LIST);
    println!("list  /{}{}", relative_name(&config.root, &target), if recursive { " (all)" } else { "" });
    Ok(json!({
        "path": relative_name(&config.root, &target),
        "entries": entries.iter().map(|(name, dir, bytes)| json!({ "name": name, "type": if *dir { "dir" } else { "file" }, "bytes": if *dir { Value::Null } else { json!(bytes) } })).collect::<Vec<_>>(),
        "truncated": truncated,
    }))
}

/// The lines that have a text (without caring for capitals), in the files under a folder; the files that are not UTF-8 text or are big are left
fn search_files(config: &Config, body: &Value) -> Done {
    let query = text(body, "query")?;
    if query.is_empty() {
        return Err((BAD, "\"query\" is empty".into()));
    }
    let limit = body.get("max").and_then(Value::as_u64).unwrap_or(100).clamp(1, 300) as usize;
    let target = resolve(&config.root, body.get("path").and_then(Value::as_str).unwrap_or(""), true).map_err(|message| (BAD, message))?;
    let needle = query.to_lowercase();
    let mut files = Vec::new();
    if target.is_file() {
        files.push((target.clone(), false, fs::metadata(&target).map(|m| m.len()).unwrap_or(0)));
    } else {
        walk(&target, 0, &mut files);
    }
    let mut matches = Vec::new();
    let mut truncated = false;
    'files: for (path, dir, bytes) in files {
        if dir || bytes > MAX_READ {
            continue;
        }
        let Ok(content) = fs::read(&path).map(String::from_utf8) else { continue };
        let Ok(content) = content else { continue };
        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                if matches.len() >= limit {
                    truncated = true;
                    break 'files;
                }
                matches.push(json!({ "path": relative_name(&config.root, &path), "line": index + 1, "text": line.trim().chars().take(200).collect::<String>() }));
            }
        }
    }
    println!("search \"{query}\" ({} found)", matches.len());
    Ok(json!({ "query": query, "matches": matches, "truncated": truncated }))
}

/* ---------- the requests ---------- */

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("a header")
}

fn request_header(request: &Request, name: &str) -> Option<String> {
    request.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str().to_string())
}

// Without a timing that tells how many characters were right
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn answer(request: Request, status: u16, body: Value, origin: Option<&str>) {
    let mut response = Response::from_string(body.to_string()).with_status_code(status);
    response.add_header(header("Content-Type", "application/json; charset=utf-8"));
    response.add_header(header("Cache-Control", "no-store"));
    response.add_header(header("X-Content-Type-Options", "nosniff"));
    if let Some(origin) = origin {
        response.add_header(header("Access-Control-Allow-Origin", origin));
        response.add_header(header("Vary", "Origin"));
    }
    let _ = request.respond(response);
}

fn handle(config: &Config, mut request: Request) {
    let origin = request_header(&request, "Origin");
    let allowed = origin.as_deref().filter(|origin| config.origins.iter().any(|allowed| allowed == origin));
    // the Host must be this PC: a page that was moved to 127.0.0.1 by a DNS trick has another name
    let host_ok = request_header(&request, "Host")
        .map(|host| host == format!("127.0.0.1:{}", config.port) || host == format!("localhost:{}", config.port))
        .unwrap_or(false);
    if !host_ok {
        return answer(request, 403, json!({ "error": "wrong Host" }), None);
    }
    if origin.is_some() && allowed.is_none() {
        return answer(request, 403, json!({ "error": "this origin is not allowed (see --origin)" }), None);
    }
    if *request.method() == Method::Options {
        // the answer to the question of the browser before a request from a page; the second header is for a page on the internet that asks for this PC
        let mut response = Response::empty(204);
        if let Some(origin) = allowed {
            response.add_header(header("Access-Control-Allow-Origin", origin));
            response.add_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"));
            response.add_header(header("Access-Control-Allow-Headers", "authorization, content-type"));
            response.add_header(header("Access-Control-Allow-Private-Network", "true"));
            response.add_header(header("Access-Control-Max-Age", "600"));
            response.add_header(header("Vary", "Origin"));
        }
        let _ = request.respond(response);
        return;
    }
    let token = request_header(&request, "Authorization").and_then(|value| value.strip_prefix("Bearer ").map(str::to_string)).unwrap_or_default();
    let path = request.url().split('?').next().unwrap_or("").to_string();
    let method = request.method().clone();
    // /ping tells that the program is here (a page that is allowed can see it, with the folder and whether its token is good); /pair gives the token to an origin that the user allowed
    if method == Method::Get && path == "/ping" {
        let approved = allowed.map(|origin| config.approvals.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).approved.contains(origin)).unwrap_or(false);
        return answer(request, 200, json!({ "name": "muai-helper", "version": env!("CARGO_PKG_VERSION"), "folder": display(&config.root), "authorized": same(&token, &config.token), "approved": approved }), allowed);
    }
    if method == Method::Post && path == "/pair" {
        let Some(origin) = allowed else {
            return answer(request, BAD, json!({ "error": "pairing is for a web page: give the token with --token" }), None);
        };
        return match pair_status(config, origin) {
            Pairing::Approved => answer(request, 200, json!({ "token": config.token, "folder": display(&config.root) }), allowed),
            Pairing::Pending => answer(request, 202, json!({ "status": "pending" }), allowed),
            Pairing::Denied => answer(request, 403, json!({ "status": "denied" }), allowed),
        };
    }
    if !same(&token, &config.token) {
        return answer(request, 401, json!({ "error": "the token is missing or wrong" }), allowed);
    }
    if method != Method::Post {
        return answer(request, 405, json!({ "error": "use POST" }), allowed);
    }
    let mut raw = String::new();
    if request.as_reader().take(MAX_BODY + 1).read_to_string(&mut raw).is_err() || raw.len() as u64 > MAX_BODY {
        return answer(request, 413, json!({ "error": "the request is too big or is not a text" }), allowed);
    }
    let body: Value = match serde_json::from_str(&raw) {
        Ok(body) => body,
        Err(_) => return answer(request, BAD, json!({ "error": "the body must be JSON" }), allowed),
    };
    let done = match path.as_str() {
        "/write" => write_file(config, &body),
        "/read" => read_file(config, &body),
        "/list" => list_files(config, &body),
        "/edit" => edit_file(config, &body),
        "/search" => search_files(config, &body),
        _ => Err((404, "no such operation".to_string())),
    };
    match done {
        Ok(value) => answer(request, 200, value, allowed),
        Err((status, message)) => answer(request, status, json!({ "error": message }), allowed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("muai-helper-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        fs::canonicalize(path).unwrap()
    }

    #[test]
    fn paths_that_stay_inside_are_fine() {
        let root = folder("fine");
        assert!(resolve(&root, "a.txt", false).unwrap().starts_with(&root));
        assert!(resolve(&root, "notes/deep/b.md", false).unwrap().starts_with(&root));
        assert!(resolve(&root, "./c.txt", false).is_ok());
        assert!(resolve(&root, "notes\\d.txt", false).is_ok()); // a Windows separator is accepted
        assert_eq!(resolve(&root, "", true).unwrap(), root);
    }

    #[test]
    fn paths_that_leave_are_refused() {
        let root = folder("bad");
        for bad in ["../x", "a/../../x", "/etc/passwd", "\\windows\\x", "C:\\x", "C:x", "a:b", "x\0y", "", "con", "a/NUL.txt", "lpt1", "a/", "dir /x", "x.", "a|b", "a?b"] {
            let result = resolve(&root, bad, false);
            // "a/" is the file "a": a name without a trailing slash is fine, so only the others must fail
            if bad != "a/" {
                assert!(result.is_err(), "{bad:?} should be refused");
            }
        }
    }

    #[test]
    fn write_read_list_and_overwrite() {
        let root = folder("ops");
        let config = Config::new(root.clone(), "x".repeat(16), 1, vec![]);
        let wrote = write_file(&config, &json!({ "path": "notes/a.txt", "content": "héllo" })).unwrap();
        assert_eq!(wrote["created"], true);
        assert_eq!(fs::read_to_string(root.join("notes/a.txt")).unwrap(), "héllo");
        assert_eq!(write_file(&config, &json!({ "path": "notes/a.txt", "content": "x" })).unwrap_err().0, 409);
        assert!(write_file(&config, &json!({ "path": "notes/a.txt", "content": "new", "overwrite": true })).is_ok());
        assert_eq!(read_file(&config, &json!({ "path": "notes/a.txt" })).unwrap()["content"], "new");
        let listed = list_files(&config, &json!({})).unwrap();
        assert_eq!(listed["entries"][0]["name"], "notes");
        assert_eq!(listed["entries"][0]["type"], "dir");
        assert!(write_file(&config, &json!({ "path": "../out.txt", "content": "x" })).is_err());
        assert!(!root.parent().unwrap().join("out.txt").exists());
        // no temporary file is left
        assert!(fs::read_dir(root.join("notes")).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".tmp")));
    }

    #[test]
    fn a_folder_is_not_replaced_and_a_big_file_is_not_read() {
        let root = folder("limits");
        let config = Config::new(root.clone(), "x".repeat(16), 1, vec![]);
        fs::create_dir(root.join("d")).unwrap();
        assert_eq!(write_file(&config, &json!({ "path": "d", "content": "x", "overwrite": true })).unwrap_err().0, 409);
        fs::write(root.join("big.txt"), vec![b'a'; (MAX_READ + 1) as usize]).unwrap();
        assert_eq!(read_file(&config, &json!({ "path": "big.txt" })).unwrap_err().0, 413);
        fs::write(root.join("bin.dat"), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_file(&config, &json!({ "path": "bin.dat" })).unwrap_err().0, 415);
    }

    fn config(root: &Path) -> Config {
        Config::new(root.to_path_buf(), "x".repeat(16), 1, vec![])
    }

    #[test]
    fn edit_needs_one_exact_match() {
        let root = folder("edit");
        let config = config(&root);
        write_file(&config, &json!({ "path": "a.txt", "content": "one two
two three
" })).unwrap();
        // two matches without replace_all: refused, the file is as it was
        assert_eq!(edit_file(&config, &json!({ "path": "a.txt", "old": "two", "new": "2" })).unwrap_err().0, 409);
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one two
two three
");
        // not found
        assert_eq!(edit_file(&config, &json!({ "path": "a.txt", "old": "four", "new": "4" })).unwrap_err().0, 404);
        // empty old
        assert_eq!(edit_file(&config, &json!({ "path": "a.txt", "old": "", "new": "x" })).unwrap_err().0, 400);
        // one match
        assert_eq!(edit_file(&config, &json!({ "path": "a.txt", "old": "three", "new": "3" })).unwrap()["replacements"], 1);
        assert_eq!(edit_file(&config, &json!({ "path": "a.txt", "old": "two", "new": "2", "replace_all": true })).unwrap()["replacements"], 2);
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one 2
2 3
");
        // outside the folder
        assert!(edit_file(&config, &json!({ "path": "../a.txt", "old": "x", "new": "y" })).is_err());
        assert_eq!(edit_file(&config, &json!({ "path": "missing.txt", "old": "x", "new": "y" })).unwrap_err().0, 404);
    }

    #[test]
    fn append_adds_to_a_file() {
        let root = folder("append");
        let config = config(&root);
        write_file(&config, &json!({ "path": "log.txt", "content": "a
", "append": true })).unwrap(); // makes it
        write_file(&config, &json!({ "path": "log.txt", "content": "b
", "append": true })).unwrap();
        assert_eq!(fs::read_to_string(root.join("log.txt")).unwrap(), "a
b
");
        assert_eq!(write_file(&config, &json!({ "path": "log.txt", "content": "c" })).unwrap_err().0, 409);
    }

    #[test]
    fn read_gives_some_lines() {
        let root = folder("lines");
        let config = config(&root);
        write_file(&config, &json!({ "path": "n.txt", "content": "1
2
3
4
5
" })).unwrap();
        let part = read_file(&config, &json!({ "path": "n.txt", "offset": 2, "limit": 2 })).unwrap();
        assert_eq!(part["content"], "2
3");
        assert_eq!(part["from"], 2);
        assert_eq!(part["to"], 3);
        assert_eq!(part["total_lines"], 5);
        assert_eq!(read_file(&config, &json!({ "path": "n.txt" })).unwrap()["total_lines"], 5);
        assert_eq!(read_file(&config, &json!({ "path": "n.txt", "offset": 9 })).unwrap()["content"], "");
    }

    #[test]
    fn list_all_and_search() {
        let root = folder("search");
        let config = config(&root);
        write_file(&config, &json!({ "path": "src/main.rs", "content": "fn Main() {}
// TODO fix
" })).unwrap();
        write_file(&config, &json!({ "path": "docs/a.md", "content": "a todo here
" })).unwrap();
        write_file(&config, &json!({ "path": "node_modules/x/y.js", "content": "todo hidden
" })).unwrap();
        fs::write(root.join("bin.dat"), [0xff, 0xfe, 0x00]).unwrap();
        let all = list_files(&config, &json!({ "recursive": true })).unwrap();
        let names: Vec<&str> = all["entries"].as_array().unwrap().iter().map(|e| e["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"src/main.rs") && names.contains(&"docs/a.md"));
        assert!(!names.contains(&"node_modules/x/y.js")); // a folder that is left is listed, but not entered
        let found = search_files(&config, &json!({ "query": "todo" })).unwrap();
        let paths: Vec<&str> = found["matches"].as_array().unwrap().iter().map(|m| m["path"].as_str().unwrap()).collect();
        assert_eq!(paths.len(), 2, "{paths:?}");
        assert!(paths.contains(&"src/main.rs") && paths.contains(&"docs/a.md"));
        assert_eq!(found["matches"][0]["line"].as_u64().is_some(), true);
        assert_eq!(search_files(&config, &json!({ "query": "" })).unwrap_err().0, 400);
        assert!(search_files(&config, &json!({ "query": "x", "path": "../" })).is_err());
        let limited = search_files(&config, &json!({ "query": "todo", "max": 1 })).unwrap();
        assert_eq!(limited["matches"].as_array().unwrap().len(), 1);
        assert_eq!(limited["truncated"], true);
    }

    #[test]
    fn an_origin_is_allowed_only_after_a_yes() {
        let mut approvals = Approvals::default();
        // the first time: pending, and somebody has to be asked; the second time: pending, and nobody is asked again
        assert_eq!(approvals.register("https://kancamu.site", false), (Pairing::Pending, true));
        assert_eq!(approvals.register("https://kancamu.site", false), (Pairing::Pending, false));
        approvals.pending.clear();
        approvals.approved.insert("https://kancamu.site".into());
        assert_eq!(approvals.register("https://kancamu.site", false), (Pairing::Approved, false));
        approvals.denied.insert("https://other.example".into());
        assert_eq!(approvals.register("https://other.example", true), (Pairing::Denied, false)); // --yes does not undo a no
        // --yes allows what is new
        assert_eq!(approvals.register("https://third.example", true), (Pairing::Approved, false));
    }

    #[test]
    fn the_allowed_origins_are_kept_in_a_file() {
        let root = folder("approvals");
        let file = root.join("sub").join("allowed.json");
        let mut approvals = Approvals::load(Some(file.clone()));
        assert!(approvals.approved.is_empty());
        assert_eq!(approvals.register("https://kancamu.site", true).0, Pairing::Approved);
        let again = Approvals::load(Some(file));
        assert!(again.approved.contains("https://kancamu.site"));
        assert!(Approvals::load(Some(root.join("missing.json"))).approved.is_empty());
    }

    #[test]
    fn a_whole_drive_or_the_home_folder_is_too_broad() {
        let root = folder("broad");
        assert!(!is_broad(&root));
        let mut top = root.clone();
        while let Some(parent) = top.parent() {
            top = parent.to_path_buf();
        }
        assert!(is_broad(&top));
        if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
            assert!(is_broad(&fs::canonicalize(home).unwrap()));
        }
    }

    #[test]
    fn the_token_is_compared_whole() {
        assert!(same("abcdef", "abcdef"));
        assert!(!same("abcdef", "abcdeg"));
        assert!(!same("abcdef", "abcde"));
        assert!(!same("", "a"));
    }
}
