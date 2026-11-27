# desktop

The website in its own window (Tauri, Rust). It opens https://kancamu.site, and the website can ask it to install, update, open and remove the native ArtCraft apps. Everything else is the website. See Desktop app in the README of the repository for what the website may ask and how.

## Build it yourself

On Windows you need Rust with the MSVC toolchain and the C++ build tools of Visual Studio. The window uses WebView2, which Windows 11 has. From this folder:

```
cargo test
cargo run
cargo build --release
```

The program is `target/release/desktop.exe`. Windows needs `icons/icon.ico` to build it: it is the favicon of the site made bigger, pixel by pixel.

## The automatic build

`.github/workflows/desktop-release.yml` builds and tests the app on GitHub:

- on every push to main that changes this folder or the workflow, it tests and builds (nothing is published);
- when a tag `desktop-v<version>` is pushed, or by hand (the tab Actions, "Run workflow"), it also publishes: the program goes to `bin/` on main, with its SHA-256 and its address in `latest.txt`, and kancamu.site serves them. There is no GitHub release, like muai-helper.

To make a release, raise `version` in `Cargo.toml` and in `tauri.conf.json` (the build stops if they differ, or if the tag is another version), push, and then:

```
git tag desktop-v0.2.0
git push origin desktop-v0.2.0
```

`latest.txt` has the line `version <version>` and one line per system: `<system> <sha256> <address>`. Check a download with `Get-FileHash` (Windows) or `sha256sum` against it.

For now the program is made for Windows x64 only, because installing native apps works on Windows only. Another system is one more line in `matrix` of the workflow.
