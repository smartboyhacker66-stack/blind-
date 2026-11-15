# Blind Hub: बिल्ड पूरा होने तक हर 10 सेकंड पर स्थिति, फिर फ़ाइलें डाउनलोड (प्रतिशत के साथ). फ़ेल हो तो वजह.
$repo = "smartboyhacker66-stack/blind-"
$out  = Join-Path $env:USERPROFILE "Downloads\BlindHub-builds"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$logFile = Join-Path $out "download-log.txt"
function Log($msg) { $line = "{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $msg; Write-Host $line; Add-Content -Path $logFile -Value $line }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Log "GitHub CLI (gh) नहीं है. cli.github.com से इंस्टॉल कीजिए, फिर gh auth login एक बार चलाइए."; exit 1 }

$runId = gh run list --repo $repo --limit 1 --json databaseId --jq '.[0].databaseId'
if (-not $runId) { Log "कोई बिल्ड रन नहीं मिला. पहले push_to_github.bat चलाइए."; exit 1 }
Log "बिल्ड रन $runId मिला. इंतज़ार शुरू (हर 10 सेकंड पर स्थिति)."

$start = Get-Date
do {
    Start-Sleep -Seconds 10
    $info = gh run view $runId --repo $repo --json status,conclusion | ConvertFrom-Json
    $el = [int]((Get-Date) - $start).TotalSeconds
    Log ("{0} मिनट {1} सेकंड: स्थिति = {2}" -f [math]::Floor($el / 60), ($el % 60), $info.status)
} while ($info.status -ne "completed")

if ($info.conclusion -ne "success") {
    Log "बिल्ड फ़ेल हुआ. एरर की वजह निकाल रहा हूँ..."
    $errLog = Join-Path $out "failed-log.txt"
    gh run view $runId --repo $repo --log-failed | Out-File -FilePath $errLog -Encoding utf8
    $hits = Select-String -Path $errLog -Pattern "e: |error|Error|FAILED|Exception|macro" | Select-Object -First 12
    if ($hits) { Log "वजह (पहली लाइनें):"; $hits | ForEach-Object { Log $_.Line } } else { Log "साफ़ एरर लाइन नहीं मिली. यह फ़ाइल भेजिए: $errLog" }
    Log "पूरा लॉग: $errLog"
    Start-Process explorer.exe $out
    exit 1
}

Log "बिल्ड सफल. फ़ाइलों का आकार देखकर डाउनलोड शुरू."
$total = [double](gh api "repos/$repo/actions/runs/$runId/artifacts" --jq '[.artifacts[].size_in_bytes] | add')
if (-not $total) { $total = 1 }
Log ("कुल डाउनलोड: {0} MB" -f [math]::Round($total / 1MB, 1))

$job = Start-Job -ScriptBlock { param($r, $rep, $d) gh run download $r --repo $rep --dir $d } -ArgumentList $runId, $repo, $out
while ($job.State -eq "Running") {
    Start-Sleep -Seconds 10
    $got = (Get-ChildItem $out -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "download-log.txt" } | Measure-Object Length -Sum).Sum
    $pct = [math]::Min(99, [math]::Round(100 * $got / $total))
    Log "डाउनलोड: लगभग $pct प्रतिशत"
}
Receive-Job $job | Out-Null
Remove-Job $job

Log "डाउनलोड पूरा. फ़ाइलें:"
Get-ChildItem $out -Recurse -File | Where-Object { $_.Name -ne "download-log.txt" } | ForEach-Object { Log ("  {0} ({1} MB)" -f $_.Name, [math]::Round($_.Length / 1MB, 1)) }
Log "हो गया. फ़ाइलें यहाँ हैं: $out"
Start-Process explorer.exe $out
exit 0
