#!/bin/sh
# muai-helper for macOS and Linux: gets the program that lets muAI work with the files of this computer, and runs it in the folder where you are.
#
#   curl -fsSL https://kancamu.site/assets/tools/muai-helper/install.sh | sh
#
# What it does, step by step (read it before you run it: it is short):
#   1. reads latest.txt from kancamu.site: the version, and for every system the address and the SHA-256 of the program;
#   2. downloads the program from that address (a release of the project on GitHub), unless the same one is already here;
#   3. checks that what it downloaded has the SHA-256 of latest.txt, and stops if it has not;
#   4. keeps it in ~/.local/share/muai-helper, and runs it for the folder where you are (it is the only folder that muAI can use).
# It changes nothing else: no setting, no PATH. To remove it, delete the folder ~/.local/share/muai-helper.
# A folder other than the current one: MUAI_DIR=/path ... For tests: MUAI_SITE is the address that holds latest.txt, and MUAI_PLATFORM names the system.
set -eu

main() {
  site="${MUAI_SITE:-https://kancamu.site/assets/tools/muai-helper}"
  site="${site%/}"
  folder="${MUAI_DIR:-$PWD}"
  home="${XDG_DATA_HOME:-$HOME/.local/share}/muai-helper"
  bin="$home/muai-helper"

  key="${MUAI_PLATFORM:-}"
  if [ -z "$key" ]; then
    os="$(uname -s)"; machine="$(uname -m)"
    case "$os" in
      Linux) system=linux ;;
      Darwin) system=macos ;;
      *) echo "muai-helper: on Windows use PowerShell: irm $site/install.ps1 | iex" >&2; return 1 ;;
    esac
    case "$machine" in
      x86_64 | amd64) cpu=x64 ;;
      arm64 | aarch64) cpu=arm64 ;;
      *) echo "muai-helper: there is no program for $machine" >&2; return 1 ;;
    esac
    key="$system-$cpu"
  fi

  if command -v sha256sum >/dev/null 2>&1; then hash() { sha256sum "$1" | cut -d' ' -f1; }
  elif command -v shasum >/dev/null 2>&1; then hash() { shasum -a 256 "$1" | cut -d' ' -f1; }
  else echo "muai-helper: sha256sum or shasum is needed to check the program" >&2; return 1; fi

  # already running (in another terminal)? then muAI finds it by itself
  if curl -fsS -m 2 "http://127.0.0.1:47615/ping" 2>/dev/null | grep -q '"muai-helper"'; then
    echo "muai-helper is already running. Close it (Ctrl+C in its terminal) to start it in this folder: $folder"
    return 0
  fi

  latest="$(curl -fsSL "$site/latest.txt")" || { echo "muai-helper: latest.txt cannot be read from $site (is it published yet?)" >&2; return 1; }
  version="$(printf '%s\n' "$latest" | awk '$1 == "version" { print $2; exit }')"
  entry="$(printf '%s\n' "$latest" | awk -v key="$key" '$1 == key { print $2 " " $3; exit }')"
  [ -n "$entry" ] || { echo "muai-helper: there is no program for $key in latest.txt" >&2; return 1; }
  expected="${entry%% *}"
  address="${entry#* }"

  mkdir -p "$home"
  have=""
  [ -f "$bin" ] && have="$(hash "$bin")"
  if [ "$have" != "$expected" ]; then
    echo "Downloading muai-helper $version ..."
    temporary="$home/download-$$.tmp"
    trap 'rm -f "$temporary"' EXIT
    curl -fsSL "$address" -o "$temporary"
    got="$(hash "$temporary")"
    if [ "$got" != "$expected" ]; then
      echo "muai-helper: the program that was downloaded is not the expected one (SHA-256 $got, expected $expected). It was not run." >&2
      return 1
    fi
    chmod +x "$temporary"
    mv -f "$temporary" "$bin"
    trap - EXIT
  fi

  echo "Running muai-helper $version for the folder: $folder"
  # the script came through a pipe, so the program asks its question (allow muAI?) in the terminal, not in the pipe
  if (: </dev/tty) 2>/dev/null; then exec "$bin" --dir "$folder" </dev/tty; else exec "$bin" --dir "$folder"; fi
}

main "$@"
