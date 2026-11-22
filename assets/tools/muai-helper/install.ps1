# muai-helper for Windows: gets the program that lets muAI work with the files of this PC, and runs it in the folder where you are.
#
#   irm https://kancamu.site/assets/tools/muai-helper/install.ps1 | iex
#
# What it does, step by step (read it before you run it: it is short):
#   1. reads latest.txt from kancamu.site: the version, and for every system the address and the SHA-256 of the program;
#   2. downloads the program from that address (a release of the project on GitHub), unless the same one is already here;
#   3. checks that what it downloaded has the SHA-256 of latest.txt, and stops if it has not;
#   4. keeps it in %LOCALAPPDATA%\muai-helper, and runs it for the folder where you are (it is the only folder that muAI can use).
# It changes nothing else: no setting, no registry, no PATH. To remove it, delete the folder %LOCALAPPDATA%\muai-helper.
# A folder other than the current one: set $env:MUAI_DIR first. For tests, $env:MUAI_SITE is the address that holds latest.txt.

function Start-MuaiHelper {
    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $site = if ($env:MUAI_SITE) { $env:MUAI_SITE.TrimEnd("/") } else { "https://kancamu.site/assets/tools/muai-helper" }
    $folder = if ($env:MUAI_DIR) { $env:MUAI_DIR } else { (Get-Location).Path }
    $appFolder = Join-Path $env:LOCALAPPDATA "muai-helper"
    $exe = Join-Path $appFolder "muai-helper.exe"

    try {
        # already running (in another terminal)? then muAI finds it by itself
        try {
            $running = Invoke-RestMethod -Uri "http://127.0.0.1:47615/ping" -TimeoutSec 2
            if ($running.name -eq "muai-helper") {
                Write-Host "muai-helper is already running (folder: $($running.folder))." -ForegroundColor Yellow
                Write-Host "Close it (Ctrl+C in its terminal) to start it in this folder: $folder"
                return
            }
        } catch { }

        $content = (Invoke-WebRequest -UseBasicParsing -Uri "$site/latest.txt").Content
        if ($content -is [byte[]]) { $content = [Text.Encoding]::UTF8.GetString($content) }   # a server without a type of content gives bytes
        $latest = $content -split "\r?\n"
        $version = ($latest | Where-Object { $_ -match "^version " } | Select-Object -First 1) -replace "^version ", ""
        $keys = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { @("windows-arm64", "windows-x64") } else { @("windows-x64") }   # Windows on ARM runs the x64 program too
        $entry = $null
        foreach ($key in $keys) {
            $line = $latest | Where-Object { $_ -like "$key *" } | Select-Object -First 1
            if ($line) { $entry = $line -split "\s+"; break }
        }
        if (-not $entry -or $entry.Count -lt 3) { throw "There is no program for this system in latest.txt." }
        $expected = $entry[1].ToLower()
        $address = $entry[2]

        New-Item -ItemType Directory -Force -Path $appFolder | Out-Null
        $have = if (Test-Path $exe) { (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower() } else { "" }
        if ($have -ne $expected) {
            Write-Host "Downloading muai-helper $version ..."
            $temporary = Join-Path $appFolder ("download-" + [guid]::NewGuid().ToString("N") + ".tmp")
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $address -OutFile $temporary
                $got = (Get-FileHash $temporary -Algorithm SHA256).Hash.ToLower()
                if ($got -ne $expected) { throw "The program that was downloaded is not the expected one (SHA-256 $got, expected $expected). It was not run." }
                Move-Item -Force -Path $temporary -Destination $exe
            } finally {
                if (Test-Path $temporary) { Remove-Item -Force $temporary }
            }
        }

        Write-Host "Running muai-helper $version for the folder: $folder"
        & $exe --dir $folder
    } catch {
        Write-Host "muai-helper: $($_.Exception.Message)" -ForegroundColor Red
    }
}
Start-MuaiHelper
