# Build-check, push, wait for GitHub Actions, then download the APK and Windows installer.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 ["commit message"] [-Tag v1.2.3]
# Needs git, node and the GitHub CLI (gh auth login).
param([string]$Message = "Blind Hub update $(Get-Date -Format 'yyyy-MM-dd_HH-mm')", [string]$Tag = "", [string]$Repo = "smartboyhacker66-stack/blind-", [string]$Branch = "main", [string]$Out = "dist-download")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
function Run($cmd) { & $cmd[0] $cmd[1..($cmd.Length - 1)]; if ($LASTEXITCODE -ne 0) { throw "Failed: $($cmd -join ' ')" } }

foreach ($t in "git", "node", "gh") { if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { throw "Missing tool: $t" } }
gh auth status 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { throw "Run 'gh auth login' first." }

Write-Host "== 1/5 Checks"; Run @("node", "scripts/ci/verify.js")

Write-Host "== 2/5 Commit"
if (-not (Test-Path ".git")) { Run @("git", "init", "-b", $Branch); Run @("git", "remote", "add", "origin", "https://github.com/$Repo.git") }
git config user.email 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { git config user.email "blindhub@users.noreply.github.com" }
git config user.name 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { git config user.name "Blind Hub" }
Run @("git", "add", "-A")
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { Run @("git", "commit", "-m", $Message) }

Write-Host "== 3/5 Push (never forced)"
git fetch origin $Branch 2>$null; if ($LASTEXITCODE -eq 0) { git pull --rebase origin $Branch }
Run @("git", "push", "-u", "origin", "HEAD:$Branch")
if ($Tag) { Run @("git", "tag", "-f", $Tag); Run @("git", "push", "origin", $Tag) }
$sha = (git rev-parse HEAD).Trim()

Write-Host "== 4/5 Waiting for the build"
$run = ""
for ($i = 0; $i -lt 30 -and -not $run; $i++) {
  $run = (gh run list --repo $Repo --workflow build.yml --commit $sha --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>$null)
  if (-not $run) { Start-Sleep 5 }
}
if (-not $run) { throw "The workflow did not start. Check the Actions tab." }
gh run watch $run --repo $Repo --exit-status; if ($LASTEXITCODE -ne 0) { throw "The build failed." }

Write-Host "== 5/5 Downloading"
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory $Out | Out-Null
Run @("gh", "run", "download", $run, "--repo", $Repo, "--dir", $Out)
Get-ChildItem $Out -Recurse -Include *.apk, *.exe | ForEach-Object { $_.FullName }
Write-Host "Release page: https://github.com/$Repo/releases"
