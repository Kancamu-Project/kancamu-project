# muai-helper for Windows: gets the program that lets muAI work with the files of this PC, and runs it in the folder where you are.
#
#   irm https://kancamu.site/assets/tools/muai-helper/install.ps1 | iex
#
# What it does, step by step (read it before you run it: it is short):
#   1. reads latest.txt from kancamu.site: the version, and for every system the address and the SHA-256 of the program;
#   2. looks in C:\Users\<you>\kancamu\muai: is the program there already, and has it the SHA-256 of latest.txt? Then it runs it at once, without downloading;
#   3. if it is not there, or its SHA-256 is another one (a new version), it downloads the program from the address of latest.txt (kancamu.site, the folder bin/ of this one),
#      checks that what it downloaded has the SHA-256 of latest.txt (it stops if it has not), keeps it in that folder, and writes the new SHA-256 in muai-helper.json beside it;
#   4. runs it for the folder where you are (it is the only folder that muAI can use).
# When kancamu.site cannot be reached, the program that is already there is run, if it still has the SHA-256 that muai-helper.json says.
# It changes nothing else: no setting, no registry, no PATH. To remove it, delete the folder C:\Users\<you>\kancamu\muai.
# A folder other than the current one: set $env:MUAI_DIR first. For tests, $env:MUAI_SITE is the address that holds latest.txt.

function Start-MuaiHelper {
    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $site = if ($env:MUAI_SITE) { $env:MUAI_SITE.TrimEnd("/") } else { "https://kancamu.site/assets/tools/muai-helper" }
    $folder = if ($env:MUAI_DIR) { $env:MUAI_DIR } else { (Get-Location).Path }
    $appFolder = Join-Path $env:USERPROFILE "kancamu\muai"
    $exe = Join-Path $appFolder "muai-helper.exe"
    $record = Join-Path $appFolder "muai-helper.json"   # what was installed: { "version", "sha256" }

    function Get-Sha256($path) { (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() }
    function Save-Record($version, $hash) {
        [ordered]@{ version = $version; sha256 = $hash; installed = (Get-Date).ToString("s") } | ConvertTo-Json | Set-Content -Path $record -Encoding UTF8
    }

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

        # what is here: the program, its SHA-256 as it is now, and the SHA-256 and version that were written when it was installed
        $here = if (Test-Path $exe) { Get-Sha256 $exe } else { "" }
        $written = $null
        if (Test-Path $record) { try { $written = Get-Content -Raw -Path $record | ConvertFrom-Json } catch { } }

        # what the site says
        try {
            $content = (Invoke-WebRequest -UseBasicParsing -Uri "$site/latest.txt").Content
            if ($content -is [byte[]]) { $content = [Text.Encoding]::UTF8.GetString($content) }   # a server without a type of content gives bytes
        } catch {
            if ($here -and $written -and $written.sha256 -eq $here) {
                Write-Host "kancamu.site cannot be reached: the program that is here is run (version $($written.version))." -ForegroundColor Yellow
                Write-Host "Running muai-helper for the folder: $folder"
                & $exe --dir $folder
                return
            }
            if ($here) { throw "latest.txt cannot be read from $site, and the program here has not the SHA-256 that was written when it was installed, so it is not run ($($_.Exception.Message))." }
            throw "latest.txt cannot be read from $site, and there is no program here to run yet ($($_.Exception.Message))."
        }
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

        if ($here -eq $expected) {
            Write-Host "muai-helper $version is already in $appFolder (same SHA-256): it is not downloaded again."
            if (-not $written -or $written.sha256 -ne $here) { Save-Record $version $here }
        } else {
            New-Item -ItemType Directory -Force -Path $appFolder | Out-Null
            Write-Host $(if ($here) { "The program in $appFolder is not the one of latest.txt (a new version, or it was changed): downloading $version ..." } else { "Downloading muai-helper $version into $appFolder ..." })
            $temporary = Join-Path $appFolder ("download-" + [guid]::NewGuid().ToString("N") + ".tmp")
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $address -OutFile $temporary
                $got = Get-Sha256 $temporary
                if ($got -ne $expected) { throw "The program that was downloaded is not the expected one (SHA-256 $got, expected $expected). It was not run." }
                Move-Item -Force -Path $temporary -Destination $exe
                Save-Record $version $got
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
