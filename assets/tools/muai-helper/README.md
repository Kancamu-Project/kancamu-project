# muai-helper

A small program for your PC that lets **muAI** (`https://kancamu.site/muai/`) write, edit, read, list, and search text files in **one folder that you choose in muAI** (with its file explorer). With it an API model of muAI works as an **agent**: it can plan a long task and do it step by step by itself.

A web page cannot write to your disk by itself, so muAI asks this program. It listens on `127.0.0.1` only (this PC, never the network). Only the models of the **OpenAI-compatible API** in muAI can use it (they are the ones that can ask for tools); the models that run in the browser cannot.

## Run it (one command)

Open a terminal (in any folder) and paste the command; **it downloads the program and runs it right away**, there is nothing else to start. In muAI, press the button *muai-helper*: the window shows the commands while the program is not there, looks for it every second, and shows when it is connected.

```powershell
irm https://kancamu.site/assets/tools/muai-helper/install.ps1 | iex
```

on Windows (PowerShell), or

```sh
curl -fsSL https://kancamu.site/assets/tools/muai-helper/install.sh | sh
```

on macOS and Linux. The program lives in `C:\Users\<you>\kancamu\muai` (Windows) or `~/kancamu/muai` (macOS and Linux). Every time, the script first reads `latest.txt` from kancamu.site (the version, and the SHA-256 and address of the program for your system) and then looks in that folder:

- the program is there and its SHA-256 is the one of `latest.txt`: it is **run at once**, nothing is downloaded;
- the program is not there, or its SHA-256 is another one (a new version, or the file was changed): the script downloads the program (from kancamu.site, the folder `bin/` of this one), checks that it has the SHA-256 of `latest.txt` (it stops if it has not), keeps it, and **writes the new SHA-256** in `muai-helper.json` beside it (`{ "version", "sha256", "installed" }`);
- kancamu.site cannot be reached: the program that is there is run, but only if it still has the SHA-256 that `muai-helper.json` says (a program that was changed is never run without a check).

muAI looks for the program by itself (every few seconds, on `127.0.0.1:47615`) and connects: **you copy no address and no token**. There is **no question to answer**: the program gives its token at once to a page of an allowed origin (`https://kancamu.site`; others only with `--origin`), and refuses every other page. When the program is started again it has a new token, and muAI takes it by itself. If you want one more step, start it with `--confirm`: it then asks in its terminal (`y`) before an origin gets the token, and keeps the answer in `%APPDATA%\muai-helper\allowed-origins.json` (or `~/.config/muai-helper/allowed-origins.json`).

**The project folder is chosen in muAI.** When it is connected, a button of the project folder shows in the bar of the chat: it opens a file explorer (the names of the folders of this PC, which the program reads), and the folder that you pick with *Use this folder* is the one folder that the AI can use. It is kept for the next start. The root of a drive and your home folder are refused (too much for an AI). The AI gets its tools only after a folder is chosen. To fix the folder from the terminal instead, start the program with `--dir <folder>` (or set `MUAI_DIR` before the command): muAI cannot change it then.

The scripts are short and made to be read: `install.ps1` and `install.sh` in this folder. They change nothing but that folder (no setting, no registry, no PATH); to remove the program, delete the folder `kancamu/muai`. If you do not want to run a script from the internet, read it first (`irm <address>` without `| iex` shows it), or build the program yourself:

## Build it yourself

You need [Rust](https://rustup.rs). From this folder:

```powershell
cargo build --release
.	argeteleasemuai-helper.exe --dir C:UsersyouDocumentsmuai-files
```

(without `--dir` it uses the folder where you are). It prints the address and the token.

Options:

| Option | What it does |
| --- | --- |
| `--dir <folder>` | The one folder muAI may use, fixed: muAI cannot change it. Without it the folder is chosen in muAI (the last one is kept). The root of a drive and your home folder are refused (too much for an AI), unless `--allow-broad`. |
| `--port <number>` | The port (default `47615`, the one muAI looks at). |
| `--token <text>` | Your own token (at least 16 characters). Without it a random one is made at every start. |
| `--origin <address>` | Another web page that may use it, for example `--origin http://127.0.0.1:8123` to try muAI on your own computer (the variable `MUAI_ORIGINS`, with addresses separated by commas, does the same). `https://kancamu.site` is always in the list. |
| `--confirm` | Ask in the terminal before an origin gets the token (one more step, safer). Without it the origins of the list get the token at once. |
| `--allow-broad` | Allow the root of a drive or your home folder. |

## For the maker: a new version

The programs are in `bin/` of this folder, and `latest.txt` has their version and SHA-256 (the scripts read it, and download the programs from kancamu.site itself). The Windows program is made by hand:

```powershell
cargo build --release
copy targeteleasemuai-helper.exe binmuai-helper-windows-x64.exe
```

and its SHA-256 (`Get-FileHash binmuai-helper-windows-x64.exe`) goes in the line `windows-x64` of `latest.txt`. The other systems (Linux, macOS) are made by GitHub: change `version` in `Cargo.toml`, commit, and push a tag `muai-helper-v<version>` (or run the workflow `muai-helper release` by hand in the tab Actions). It tests and builds for Windows, Linux (x64 and arm64), and macOS (arm64 and x64), puts the programs in `bin/`, and writes `latest.txt` on `main`. Every new version adds the programs to the history of the repository (about 0.6 MB each).

## What keeps it safe

- It listens on `127.0.0.1` only, and the `Host` of a request must be this PC (a defence against DNS rebinding).
- Every request needs the token (`Authorization: Bearer <token>`). A page gets the token by itself (`POST /pair`) only if its origin is in the list (`https://kancamu.site`, and what you add with `--origin`), and with `--confirm` only after you said yes in the terminal; `GET /ping` is open to the allowed origins and tells only that the program is here, its version, the folder, and whether the token that was sent is good.
- A web page can use it only from an allowed origin; a page from another site is refused.
- The file explorer shows only the **names of folders** to the page that is allowed (never the files, never what is in them); what the AI can read and write is only the one folder that was chosen. A page that is allowed and has the token can choose another folder, so allow only a page that you trust (`https://kancamu.site`), or start the program with `--dir` to fix the folder.
- A path is relative to the folder: no `..`, no drive letter (`C:`), no leading slash, no reserved Windows names (`CON`, `NUL`…), and no link that leads out of the folder.
- A file is written whole into a temporary file and then renamed. An existing file is replaced only when the request says `"overwrite": true`, and muAI asks you first: for every change, once for each task (the default), or never, as you choose in its connections.
- A request is at most 8 MB, a file that is read at most 1 MB and must be UTF-8 text, a file after an edit or an append at most 10 MB, and a list gives at most 500 entries (a search looks at 5000 files at most, and does not follow links).

What it does **not** do: it is not a sandbox for a program that already runs on your PC with your rights, and what muAI reads with `read_file` goes to the API that you use, like the rest of the chat. Choose a folder that has nothing you do not want to share, and stop the program (Ctrl+C) when you do not use it.

## The operations

All are `POST` with a JSON body (`GET /ping` has none) and the token:

| Address | Body | Answer |
| --- | --- | --- |
| `GET /ping` | | `{ name, version, folder, authorized, approved }` (no token needed) |
| `POST /pair` | | `{ token, folder }` for an origin that the user allowed (202 `{ status: "pending" }` while the terminal waits for the answer, 403 `{ status: "denied" }`); a page only |
| `POST /write` | `{ path, content, overwrite?, append? }` | `{ ok, path, bytes, created }` (409 when the file exists and neither `overwrite` nor `append` is true) |
| `POST /edit` | `{ path, old, new, replace_all? }` | `{ ok, path, replacements, bytes }` (the text `old` must be in the file once, or `replace_all` must be true: 409 when it is found more than once, 404 when it is not found) |
| `POST /read` | `{ path, offset?, limit? }` | `{ path, content, bytes, total_lines }` (with `offset` and `limit`, only those lines, and `from` and `to`) |
| `POST /list` | `{ path?, recursive? }` | `{ path, entries: [{ name, type, bytes }], truncated }` (`recursive` gives the whole tree; `.git` and `node_modules` are listed but not entered) |
| `POST /search` | `{ query, path?, max? }` | `{ query, matches: [{ path, line, text }], truncated }` (the lines that have the text, capitals do not matter; at most 300) |
| `POST /browse` | `{ path? }` | `{ path, parent, entries: [{ name, path }], places, truncated }`: only the names of the folders inside a folder (no files, no hidden folders), for the file explorer of muAI; with no `path`, the places to start from (home, drives) |
| `POST /folder` | `{ path }` | `{ ok, folder }`: the folder of the work is now this one (403 when the program was started with `--dir`; 400 for the root of a drive or the home folder) |

An error is `{ "error": "…" }` with its status (400 the path is refused, 401 the token, 403 the origin or the host, 404, 409, 413, 415).

## Tests

```powershell
cargo test
```
