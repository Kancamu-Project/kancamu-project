#!/bin/sh
# muai-helper for macOS and Linux: gets the program that lets muAI work with the files of this computer, and runs it in the folder where you are.
#
#   curl -fsSL https://kancamu.site/assets/tools/muai-helper/install.sh | sh
#
# What it does, step by step (read it before you run it: it is short):
#   1. reads latest.txt from kancamu.site: the version, and for every system the address and the SHA-256 of the program;
#   2. looks in ~/kancamu/muai: is the program there already, and has it the SHA-256 of latest.txt? Then it runs it at once, without downloading;
#   3. if it is not there, or its SHA-256 is another one (a new version), it downloads the program from the address of latest.txt (kancamu.site, the folder bin/ of this one),
#      checks that what it downloaded has the SHA-256 of latest.txt (it stops if it has not), keeps it in that folder, and writes the new SHA-256 in muai-helper.json beside it;
#   4. runs it for the folder where you are (it is the only folder that muAI can use).
# When kancamu.site cannot be reached, the program that is already there is run, if it still has the SHA-256 that muai-helper.json says.
# It changes nothing else: no setting, no PATH. To remove it, delete the folder ~/kancamu/muai.
# A folder other than the current one: MUAI_DIR=/path ... For tests: MUAI_SITE is the address that holds latest.txt, MUAI_HOME the folder of the program, and MUAI_PLATFORM names the system.
set -eu

main() {
  site="${MUAI_SITE:-https://kancamu.site/assets/tools/muai-helper}"
  site="${site%/}"
  folder="${MUAI_DIR:-$PWD}"
  home="${MUAI_HOME:-$HOME/kancamu/muai}"
  bin="$home/muai-helper"
  record="$home/muai-helper.json"   # what was installed: { "version", "sha256" }

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

  run() {
    echo "Running muai-helper $1 for the folder: $folder"
    # the script came through a pipe, so the program asks its question (allow muAI?) in the terminal, not in the pipe
    if (: </dev/tty) 2>/dev/null; then exec "$bin" --dir "$folder" </dev/tty; else exec "$bin" --dir "$folder"; fi
  }
  save_record() {
    printf '{\n  "version": "%s",\n  "sha256": "%s",\n  "installed": "%s"\n}\n' "$1" "$2" "$(date '+%Y-%m-%dT%H:%M:%S')" > "$record"
  }
  field() { sed -n "s/.*\"$1\": *\"\\([^\"]*\\)\".*/\\1/p" "$record" 2>/dev/null | head -n 1; }

  # already running (in another terminal)? then muAI finds it by itself
  if curl -fsS -m 2 "http://127.0.0.1:47615/ping" 2>/dev/null | grep -q '"muai-helper"'; then
    echo "muai-helper is already running. Close it (Ctrl+C in its terminal) to start it in this folder: $folder"
    return 0
  fi

  # what is here: the program, its SHA-256 as it is now, and the SHA-256 and version that were written when it was installed
  here=""; [ -f "$bin" ] && here="$(hash "$bin")"
  written=""; written_version=""
  if [ -f "$record" ]; then written="$(field sha256)"; written_version="$(field version)"; fi

  # what the site says
  if ! latest="$(curl -fsSL "$site/latest.txt")"; then
    if [ -n "$here" ] && [ "$here" = "$written" ]; then
      echo "kancamu.site cannot be reached: the program that is here is run (version $written_version)."
      run "$written_version"
    fi
    if [ -n "$here" ]; then echo "muai-helper: latest.txt cannot be read from $site, and the program here has not the SHA-256 that was written when it was installed, so it is not run" >&2
    else echo "muai-helper: latest.txt cannot be read from $site, and there is no program here to run yet" >&2; fi
    return 1
  fi
  version="$(printf '%s\n' "$latest" | awk '$1 == "version" { print $2; exit }')"
  entry="$(printf '%s\n' "$latest" | awk -v key="$key" '$1 == key { print $2 " " $3; exit }')"
  [ -n "$entry" ] || { echo "muai-helper: there is no program for $key in latest.txt" >&2; return 1; }
  expected="${entry%% *}"
  address="${entry#* }"

  if [ "$here" = "$expected" ]; then
    echo "muai-helper $version is already in $home (same SHA-256): it is not downloaded again."
    [ "$written" = "$here" ] || save_record "$version" "$here"
  else
    mkdir -p "$home"
    if [ -n "$here" ]; then echo "The program in $home is not the one of latest.txt (a new version, or it was changed): downloading $version ..."; else echo "Downloading muai-helper $version into $home ..."; fi
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
    save_record "$version" "$got"
  fi
  run "$version"
}

main "$@"
