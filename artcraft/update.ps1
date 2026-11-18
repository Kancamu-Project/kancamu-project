# Downloads the latest web build (<app>-web-<version>.zip) of every app in data.json from its GitHub release,
# checks its SHA-256, and unpacks it into this folder, one folder per app, replaced whole.
#
#   powershell -ExecutionPolicy Bypass -File artcraft\update.ps1                    update every app that has a newer release
#   powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Check             only show installed and latest versions
#   powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Only photocraft,deckcraft
#   powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Force             download again even when up to date
#
# Works with Windows PowerShell 5.1 (built into Windows) and PowerShell 7. Needs nothing else installed.
# -ExecutionPolicy Bypass applies to this one run only; it does not change the policy of the computer.

param(
    [string[]]$Only,
    [switch]$Check,
    [switch]$Force
)

# "powershell -File ... -Only a,b" passes "a,b" as one string; split it so both ways of writing work.
if ($Only) { $Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # without this Invoke-WebRequest is very slow on 5.1
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Dest = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataFile = Join-Path $Dest 'data.json'   # { "photocraft": { "repo": "storytold/photocraft", "version": "v0.23.1" }, ... }
$UserAgent = 'kancamu-artcraft-updater'

# The tag of the latest release: github.com/<repo>/releases/latest redirects to /releases/tag/<tag>.
function Get-LatestTag($repo) {
    $request = [Net.HttpWebRequest]::Create("https://github.com/$repo/releases/latest")
    $request.AllowAutoRedirect = $false
    $request.UserAgent = $UserAgent
    $response = $request.GetResponse()
    try { $location = $response.Headers['Location'] } finally { $response.Close() }
    if ($location -notmatch '/releases/tag/([^/?#]+)') { throw "$repo has no release" }
    [Uri]::UnescapeDataString($Matches[1])
}

# The SHA-256 the release publishes for a file, or nothing.
function Get-ExpectedChecksum($repo, $tag, $asset) {
    try {
        $text = (Invoke-WebRequest -UseBasicParsing -UserAgent $UserAgent -Uri "https://github.com/$repo/releases/download/$tag/SHA256SUMS.txt").Content
        if ($text -is [byte[]]) { $text = [Text.Encoding]::UTF8.GetString($text) }
    } catch { return $null }
    foreach ($line in ($text -split "`r?`n")) {
        if ($line.Trim() -match '^([0-9a-fA-F]{64})\s+\*?(.+)$' -and $Matches[2] -eq $asset) { return $Matches[1].ToLower() }
    }
    $null
}

# Unpacks the zip into $dir. The one top-level folder (photocraft-web-0.23.1/) is removed from the paths,
# and README.md and HOSTING.md are left out.
function Expand-Site($zipPath, $dir) {
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $root = [IO.Path]::GetFullPath($dir).TrimEnd('\', '/')
        $files = 0
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName.EndsWith('/')) { continue }
            $relative = ($entry.FullName.Split('/') | Select-Object -Skip 1) -join '/'
            if (-not $relative -or $relative -match '^(README|HOSTING)\.md$') { continue }
            $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
            if (-not $target.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) { throw "unsafe path in zip: $($entry.FullName)" }
            [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target))
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
            $files++
        }
        $files
    } finally { $archive.Dispose() }
}

# data.json holds each app, the GitHub repository whose releases carry its web build, and the installed release.
$Apps = [ordered]@{}
$versions = [ordered]@{}
foreach ($property in ([IO.File]::ReadAllText($DataFile) | ConvertFrom-Json).PSObject.Properties) {
    $Apps[$property.Name] = $property.Value.repo
    $versions[$property.Name] = $property.Value.version
}

if ($Only) { foreach ($id in $Only) { if (-not $Apps.Contains($id)) { throw "unknown app: $id" } } }
$failed = 0

foreach ($id in $Apps.Keys) {
    if ($Only -and $Only -notcontains $id) { continue }
    $repo = $Apps[$id]
    $folder = Join-Path $Dest $id
    $installed = $versions[$id]
    try {
        $tag = Get-LatestTag $repo
        $upToDate = ($installed -eq $tag) -and (Test-Path $folder)
        if ($Check) { Write-Host ("- {0} installed {1}, latest {2}" -f $id.PadRight(12), $(if ($installed) { $installed } else { '-' }), $tag); continue }
        if ($upToDate -and -not $Force) { Write-Host "- ${id}: $tag is up to date"; continue }

        $asset = "$id-web-$($tag.TrimStart('v')).zip"
        Write-Host "- ${id}: downloading $asset"
        $zip = Join-Path $Dest ".$id.zip"
        $staging = Join-Path $Dest ".$id.new"
        try {
            Invoke-WebRequest -UseBasicParsing -UserAgent $UserAgent -OutFile $zip -Uri "https://github.com/$repo/releases/download/$tag/$asset"
            $expected = Get-ExpectedChecksum $repo $tag $asset
            if ($expected -and $expected -ne (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()) { throw 'checksum mismatch' }

            if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
            [void](New-Item -ItemType Directory -Force -Path $staging)
            $files = Expand-Site $zip $staging

            # Some loaders import "./snippets/..." relative to app/ although the zip only has snippets/ at the root.
            if ((Test-Path "$staging\app") -and (Test-Path "$staging\snippets") -and -not (Test-Path "$staging\app\snippets")) {
                Copy-Item "$staging\snippets" "$staging\app\snippets" -Recurse
            }
            # The zips carry no icon: keep the one already in the folder, or take it from the repository.
            if (Test-Path "$folder\icon-256.png") { Copy-Item "$folder\icon-256.png" "$staging\icon-256.png" }
            elseif (-not (Test-Path "$staging\icon-256.png")) {
                try { Invoke-WebRequest -UseBasicParsing -UserAgent $UserAgent -OutFile "$staging\icon-256.png" -Uri "https://raw.githubusercontent.com/$repo/$tag/assets/app-icon/hicolor/256x256/apps/ai.storyteller.$id.png" }
                catch { Remove-Item "$staging\icon-256.png" -Force -ErrorAction SilentlyContinue }
            }

            if (Test-Path $folder) { Remove-Item $folder -Recurse -Force }
            Move-Item $staging $folder
            Write-Host ("  {0} files, checksum {1}" -f $files, $(if ($expected) { 'verified' } else { 'not published' }))
            $versions[$id] = $tag
            $out = [ordered]@{}
            foreach ($key in $Apps.Keys) { $out[$key] = [ordered]@{ repo = $Apps[$key]; version = $versions[$key] } }
            [IO.File]::WriteAllText($DataFile, ((ConvertTo-Json $out) + "`n"))
        } finally {
            if (Test-Path $zip) { Remove-Item $zip -Force }
            if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
        }
    } catch {
        $failed++
        [Console]::Error.WriteLine("- ${id}: FAILED, $($_.Exception.Message)")
    }
}

if ($failed) { exit 1 }
