use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use sha2::{Digest, Sha256};

use crate::catalog::App;
use crate::github::Release;
use crate::platform::{self, Kind};
use crate::store::{self, Installed};

const MAX_DOWNLOAD: u64 = 2 * 1024 * 1024 * 1024;
const MAX_FILE: u64 = 4 * 1024 * 1024 * 1024;

pub fn install(app: &App, release: &Release, previous: Option<&Installed>) -> Result<Installed, String> {
    if !platform::can_install() {
        return Err("Installing native apps works on Windows only for now".to_string());
    }
    let (asset, kind) = platform::pick_windows(&release.assets, app.id, platform::current_arch()).ok_or("This release has no build for this computer")?;
    let hash = asset.sha256.as_deref().ok_or("The release publishes no checksum, so it is not installed")?;
    let version = release.version();

    let cache = store::data_dir().join("downloads");
    fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    let file = cache.join(safe_file_name(&asset.name));
    download(&crate::github::agent(), &asset.url, &file, hash)?;

    let installed = match kind {
        Kind::Portable => install_portable(app, &version, &file)?,
        Kind::Msi => install_msi(app, &version, &file)?,
    };
    if let Some(old) = previous {
        remove_old(old, &installed);
    }
    Ok(installed)
}

pub fn uninstall(installed: &Installed) -> Result<(), String> {
    match Kind::from_label(&installed.kind) {
        Some(Kind::Portable) => {
            if let Some(dir) = &installed.dir {
                fs::remove_dir_all(dir).or_else(|error| if Path::new(dir).exists() { Err(error) } else { Ok(()) }).map_err(|error| error.to_string())?;
            }
            Ok(())
        }
        Some(Kind::Msi) => {
            let package = installed.package.as_deref().ok_or("The installer file is gone, remove it from Apps in Windows")?;
            run_msi(&["/x", package, "/passive", "/norestart"])
        }
        None => Err("Unknown kind of installation".to_string()),
    }
}

pub fn open(installed: &Installed) -> Result<(), String> {
    let exe = installed.exe.as_deref().ok_or("The program was not found, open it from the Start menu")?;
    if !Path::new(exe).exists() {
        return Err("The program is no longer there, install it again".to_string());
    }
    let mut command = Command::new(exe);
    if let Some(dir) = Path::new(exe).parent() {
        command.current_dir(dir);
    }
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

fn safe_file_name(name: &str) -> String {
    name.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' }).collect()
}

fn download(agent: &ureq::Agent, url: &str, destination: &Path, expected: &str) -> Result<(), String> {
    let response = agent.get(url).call().map_err(|error| error.to_string())?;
    let total = response.header("Content-Length").and_then(|value| value.parse::<u64>().ok()).unwrap_or(0);
    if total > MAX_DOWNLOAD {
        return Err("The download is larger than allowed".to_string());
    }
    let partial = destination.with_extension("part");
    match copy_checked(response.into_reader(), &partial, expected) {
        Ok(()) => fs::rename(&partial, destination).map_err(|error| error.to_string()),
        Err(error) => {
            let _ = fs::remove_file(&partial);
            Err(error)
        }
    }
}

fn copy_checked(reader: impl Read, partial: &Path, expected: &str) -> Result<(), String> {
    let mut reader = reader.take(MAX_DOWNLOAD + 1);
    let mut file = File::create(partial).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut done = 0u64;
    loop {
        let count = reader.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        done += count as u64;
        if done > MAX_DOWNLOAD {
            return Err("The download is larger than allowed".to_string());
        }
        hasher.update(&buffer[..count]);
        file.write_all(&buffer[..count]).map_err(|error| error.to_string())?;
    }
    file.flush().map_err(|error| error.to_string())?;
    let actual = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if actual.eq_ignore_ascii_case(expected) { Ok(()) } else { Err("The checksum does not match, the file was discarded".to_string()) }
}

fn install_portable(app: &App, version: &str, file: &Path) -> Result<Installed, String> {
    let target = store::data_dir().join("apps").join(app.id).join(safe_file_name(version));
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    if let Err(error) = extract(file, &target) {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    let exe = find_exe(&target, app);
    Ok(Installed { version: version.to_string(), kind: Kind::Portable.label().to_string(), dir: Some(path_text(&target)), exe: exe.map(|path| path_text(&path)), package: None })
}

fn install_msi(app: &App, version: &str, file: &Path) -> Result<Installed, String> {
    run_msi(&["/i", &path_text(file), "/passive", "/norestart"])?;
    let root = std::env::var_os("ProgramFiles").map(PathBuf::from).unwrap_or_default().join("ArtCraft");
    let exe = [root.join(app.name), root.clone()].iter().find(|dir| dir.is_dir()).and_then(|dir| find_exe(dir, app));
    Ok(Installed { version: version.to_string(), kind: Kind::Msi.label().to_string(), dir: None, exe: exe.map(|path| path_text(&path)), package: Some(path_text(file)) })
}

fn run_msi(arguments: &[&str]) -> Result<(), String> {
    let status = Command::new("msiexec").args(arguments).status().map_err(|error| error.to_string())?;
    match status.code() {
        Some(0 | 3010) => Ok(()),
        Some(1602 | 1223) => Err("Cancelled".to_string()),
        Some(code) => Err(format!("Windows Installer stopped with code {code}")),
        None => Err("Windows Installer was stopped".to_string()),
    }
}

fn extract(file: &Path, target: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(File::open(file).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let mut written = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative = entry.enclosed_name().ok_or("The archive has a path that leaves its folder")?;
        let out = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut output = File::create(&out).map_err(|error| error.to_string())?;
        written += std::io::copy(&mut (&mut entry).take(MAX_FILE), &mut output).map_err(|error| error.to_string())?;
        if written > MAX_FILE {
            return Err("The archive is larger than allowed".to_string());
        }
    }
    Ok(())
}

fn find_exe(dir: &Path, app: &App) -> Option<PathBuf> {
    let plain = |text: &str| text.to_ascii_lowercase().replace(['-', '_', ' '], "");
    let wanted = [plain(app.id), plain(app.name)];
    let mut found = Vec::new();
    collect_exe(dir, 0, &mut found);
    let named = found.iter().find(|path| path.file_stem().and_then(|stem| stem.to_str()).is_some_and(|stem| wanted.contains(&plain(stem))));
    if let Some(path) = named {
        return Some(path.clone());
    }
    found.into_iter().max_by_key(|path| fs::metadata(path).map_or(0, |meta| meta.len()))
}

fn collect_exe(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth < 3 {
                collect_exe(&path, depth + 1, found);
            }
        } else if path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("exe")) {
            found.push(path);
        }
    }
}

fn remove_old(old: &Installed, new: &Installed) {
    if old.kind == Kind::Portable.label() && old.dir != new.dir {
        if let Some(dir) = &old.dir {
            let _ = fs::remove_dir_all(dir);
        }
    }
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("desktop-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_download_with_another_checksum_is_discarded() {
        let dir = temporary("hash");
        let partial = dir.join("a.part");
        let good = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert!(copy_checked(&b"abc"[..], &partial, good).is_ok());
        assert!(copy_checked(&b"abd"[..], &partial, good).is_err());
    }

    #[test]
    fn an_archive_cannot_write_outside_its_folder() {
        let dir = temporary("zip");
        let archive = dir.join("bad.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive).unwrap());
        writer.start_file("../escape.txt", zip::write::SimpleFileOptions::default()).unwrap();
        writer.write_all(b"x").unwrap();
        writer.finish().unwrap();
        let target = dir.join("out");
        fs::create_dir_all(&target).unwrap();
        assert!(extract(&archive, &target).is_err());
        assert!(!dir.join("escape.txt").exists());
    }

    #[test]
    fn the_program_named_like_the_app_is_found() {
        let dir = temporary("exe");
        fs::create_dir_all(dir.join("bin")).unwrap();
        fs::write(dir.join("bin").join("PhotoCraft.exe"), b"1").unwrap();
        fs::write(dir.join("helper.exe"), b"larger helper file").unwrap();
        let app = crate::catalog::find("photocraft").unwrap();
        assert_eq!(find_exe(&dir, app).unwrap().file_name().unwrap(), "PhotoCraft.exe");
    }
}
