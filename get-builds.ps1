# Blind Hub: बिल्ड पूरा होने तक इंतज़ार, फिर सफल हो तो फ़ाइलें डाउनलोड, नहीं तो गड़बड़ की वजह दिखाना.
$repo = "smartboyhacker66-stack/blind-"
$out  = Join-Path $env:USERPROFILE "Downloads\BlindHub-builds"
New-Item -ItemType Directory -Force -Path $out | Out-Null

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Host "GitHub CLI (gh) is not installed. Install it from cli.github.com, then run gh auth login once."; exit 1 }
$runId = gh run list --repo $repo --limit 1 --json databaseId --jq '.[0].databaseId'
if (-not $runId) { Write-Host "No build run found. Did you run push_to_github.bat first?"; exit 1 }
Write-Host "Run number $runId found."

Write-Host "Build is running. Please wait 5 to 15 minutes. Nothing else to do."
gh run watch $runId --repo $repo --exit-status | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESS. Downloading files..."
    gh run download $runId --repo $repo --dir $out | Out-Null
    Write-Host "DONE. Your files are in: $out"
    Start-Process explorer.exe $out
    exit 0
}

Write-Host "BUILD FAILED. Saving the error log and finding the reason..."
$log = Join-Path $out "failed-log.txt"
gh run view $runId --repo $repo --log-failed | Out-File -FilePath $log -Encoding utf8
$hits = Select-String -Path $log -Pattern "e: |error|Error|FAILED|Exception" | Select-Object -First 12
if ($hits) {
    Write-Host "Reason (first lines of the error):"
    $hits | ForEach-Object { Write-Host $_.Line }
} else {
    Write-Host "No clear error line found. Please send the file: $log"
}
Write-Host "Full error log saved here: $log"
Start-Process explorer.exe $out
exit 1
