# lab_ensure_ui.ps1 - start PrettyK playground + Live (no desktop windows)
# Canon: AGENTS.md, SKILLS-ROUTING.md
# Run from any CWD, script resolves repo root from its own location.

param([switch]$SkipHealth)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir "..\..\")
$Or = Join-Path $Root "orchestrator"
$Frontend = Join-Path $Root "frontend"
$Py = Join-Path $Root ".venv\Scripts\python.exe"

if (-not (Test-Path (Join-Path $Or "tools\data_playground.py"))) {
    throw "Cannot resolve repo root from $ScriptDir"
}
if (-not (Test-Path $Py)) {
    throw "Missing .venv at $Root"
}

# Editor :5173
$ed = netstat -ano | Select-String ":5173 .*LISTENING"
if (-not $ed) {
    Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$Frontend`" && npm run dev" -WindowStyle Hidden
    Write-Host "editor :5173 launched"
} else {
    Write-Host "editor :5173 alive"
}

# Playground :8765
$pg = netstat -ano | Select-String ":8765 .*LISTENING"
if (-not $pg) {
    Start-Process -FilePath $Py -ArgumentList "-u","-m","tools.data_playground" -WorkingDirectory $Or -WindowStyle Hidden
    Write-Host "playground :8765 launched"
} else {
    Write-Host "playground :8765 alive"
}

# Live :8767
$lv = netstat -ano | Select-String ":8767 .*LISTENING"
if (-not $lv) {
    Start-Process -FilePath $Py -ArgumentList "-u","tools\run_live_idle.py" -WorkingDirectory $Or -WindowStyle Hidden
    Write-Host "live :8767 launched"
} else {
    Write-Host "live :8767 alive"
}

if (-not $SkipHealth) {
    Start-Sleep 6
    $edChk = try { (Invoke-WebRequest -Uri http://localhost:5173/ -UseBasicParsing -TimeoutSec 5).StatusCode }
    catch { 0 }
    Write-Host ("editor :5173 " + $(if($edChk -eq 200){"HEALTH OK"}else{"WAIT"}))
    $chk = try {
        (Invoke-WebRequest -Uri http://127.0.0.1:8767/api/meta -UseBasicParsing -TimeoutSec 5).Content
    } catch { $null }
    if ($chk -match '"session_name"') {
        Write-Host "live HEALTH OK"
    } else {
        Write-Host "live HEALTH WAIT"
    }
}