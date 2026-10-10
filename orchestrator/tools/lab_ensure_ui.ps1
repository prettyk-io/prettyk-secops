# lab_ensure_ui.ps1 - start PrettyK UI contour (Editor/Playground/Live/relay) + watchdog.
# Canon: AGENTS.md, sanctuary/pure/stand-port-meta.md (lab_ensure_ui.ps1 -StartIfDown).
# LIVE-MONITOR-REVIVE: reliable bring-up + self-heal. Fallen/hung UI processes are
# restarted by a background supervisor within ~1 min (probe every 20s; bounded
# restart counters; single instance via temp pidfile).
#
# Usage:
#   .\lab_ensure_ui.ps1                  # ensure all UI processes + health + watchdog
#   .\lab_ensure_ui.ps1 -StartIfDown     # canon flag: ensure semantics (same as default)
#   .\lab_ensure_ui.ps1 -CheckOnly       # probe only, no starts; exit 0/1
#   .\lab_ensure_ui.ps1 -NoWatchdog      # do not start the background supervisor
#   .\lab_ensure_ui.ps1 -StopWatchdog    # stop the supervisor
#   .\lab_ensure_ui.ps1 -SkipHealth      # skip HTTP health wait
#
# ASCII-only operator strings (PS 5.1 reads BOM-less .ps1 as ANSI; em-dash and
# smart quotes break parsing - see COS-195 lesson).

param(
    [switch]$SkipHealth,
    [switch]$StartIfDown,
    [switch]$CheckOnly,
    [switch]$NoWatchdog,
    [switch]$StopWatchdog,
    [switch]$WatchLoop
)
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

# VP-L1: authoring browser lives in playwright-authoring :9223; playground must
# know the CDP endpoint, otherwise /api/browser/status answers connected:false.
$env:PK_BROWSER_CDP_ENDPOINT = "http://127.0.0.1:9223"

$UiPorts = @{ editor = 5173; playground = 8765; live = 8767; relay = 9224 }
$UiOrder = @("editor", "playground", "live", "relay")
$WatchdogPidFile = Join-Path ([IO.Path]::GetTempPath()) "secops-ui-watchdog.pid"
$WatchdogLogFile = Join-Path ([IO.Path]::GetTempPath()) "secops-ui-watchdog.log"
$WatchdogIntervalSec = 20
$WatchdogRestartWindowSec = 600
$WatchdogRestartMax = 6

function Test-PortListen {
    param([int]$Port)
    $line = netstat -ano | Select-String ":$Port\s+.*LISTENING" | Select-Object -First 1
    return [bool]$line
}

function Get-PortPid {
    param([int]$Port)
    $line = netstat -ano | Select-String ":$Port\s+.*LISTENING" | Select-Object -First 1
    if (-not $line) { return "" }
    return (($line.Line -split "\s+")[-1]).Trim()
}

function Test-HttpReachable {
    # Any HTTP response means the process is alive (even 403/404). Network
    # failure / no response means down.
    param([string]$Url, [int]$TimeoutSec = 4)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null
        return $true
    } catch {
        $resp = $_.Exception.Response
        if ($null -ne $resp) { return $true }
        return $false
    }
}

function Test-UiProbe {
    param([string]$Name)
    switch ($Name) {
        "editor"     { return (Test-PortListen $UiPorts.editor)     -and (Test-HttpReachable "http://localhost:5173/") }
        "playground" { return (Test-PortListen $UiPorts.playground) -and (Test-HttpReachable "http://127.0.0.1:8765/") }
        "live"       { return (Test-PortListen $UiPorts.live)       -and (Test-HttpReachable "http://127.0.0.1:8767/api/meta") }
        "relay"      { return (Test-PortListen $UiPorts.relay) }
    }
    return $false
}

function Start-UiProcess {
    param([string]$Name)
    $tmp = [IO.Path]::GetTempPath()
    switch ($Name) {
        "editor" {
            Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$Frontend`" && npm run dev > `"$tmp\secops-ui-editor.log`" 2>&1" -WindowStyle Hidden
        }
        "playground" {
            Start-Process -FilePath $Py -ArgumentList "-u", "-m", "tools.data_playground" -WorkingDirectory $Or -WindowStyle Hidden `
                -RedirectStandardOutput "$tmp\secops-ui-playground.out.log" `
                -RedirectStandardError "$tmp\secops-ui-playground.err.log"
        }
        "live" {
            Start-Process -FilePath $Py -ArgumentList "-u", "tools\run_live_idle.py" -WorkingDirectory $Or -WindowStyle Hidden `
                -RedirectStandardOutput "$tmp\secops-ui-live.out.log" `
                -RedirectStandardError "$tmp\secops-ui-live.err.log"
        }
        "relay" {
            Start-Process -FilePath $Py -ArgumentList "-u", "-m", "browser.cdp_viewport_relay" -WorkingDirectory $Or -WindowStyle Hidden `
                -RedirectStandardOutput "$tmp\secops-ui-relay.out.log" `
                -RedirectStandardError "$tmp\secops-ui-relay.err.log"
        }
    }
}

function Stop-UiProcessPort {
    param([int]$Port)
    $procId = Get-PortPid $Port
    if ($procId) {
        taskkill /PID $procId /F 2>$null | Out-Null
        Start-Sleep -Milliseconds 400
    }
}

function Write-WatchdogLog {
    param([string]$Message)
    try {
        if ((Test-Path $WatchdogLogFile) -and ((Get-Item $WatchdogLogFile).Length -gt 1MB)) {
            Remove-Item $WatchdogLogFile -ErrorAction SilentlyContinue
        }
        $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
        Add-Content -Path $WatchdogLogFile -Value $line -Encoding UTF8
    } catch { }
}

function Get-WatchdogPid {
    if (Test-Path $WatchdogPidFile) {
        $raw = Get-Content $WatchdogPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($raw) { return $raw.Trim() }
    }
    return ""
}

function Test-WatchdogAlive {
    $wp = Get-WatchdogPid
    if (-not $wp) { return $false }
    return [bool](Get-Process -Id $wp -ErrorAction SilentlyContinue)
}

function Start-Watchdog {
    if (Test-WatchdogAlive) { return $false }
    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -WatchLoop"
    $proc = Start-Process -FilePath "powershell" -ArgumentList $argLine -WindowStyle Hidden -PassThru
    $proc.Id | Out-File -Encoding ascii $WatchdogPidFile
    return $true
}

function Stop-Watchdog {
    $wp = Get-WatchdogPid
    if ($wp) {
        taskkill /PID $wp /F 2>$null | Out-Null
        Remove-Item $WatchdogPidFile -ErrorAction SilentlyContinue
    }
}

# ---- background supervisor loop (internal) --------------------------------
if ($WatchLoop) {
    $restarts = @{}
    Write-WatchdogLog "watchdog started (interval ${WatchdogIntervalSec}s)"
    while ($true) {
        Start-Sleep -Seconds $WatchdogIntervalSec
        try {
            foreach ($name in $UiOrder) {
                if (Test-UiProbe $name) { continue }
                if (-not $restarts.ContainsKey($name)) {
                    $restarts[$name] = New-Object System.Collections.ArrayList
                }
                $stamps = $restarts[$name]
                $cutoff = [DateTime]::UtcNow.AddSeconds(-$WatchdogRestartWindowSec)
                for ($k = $stamps.Count - 1; $k -ge 0; $k--) {
                    if ($stamps[$k] -lt $cutoff) { $stamps.RemoveAt($k) }
                }
                if ($stamps.Count -ge $WatchdogRestartMax) {
                    Write-WatchdogLog "backoff: $name restart limit reached ($($stamps.Count) in window)"
                    continue
                }
                [void]$stamps.Add([DateTime]::UtcNow)
                $port = $UiPorts[$name]
                if (Test-PortListen $port) {
                    Write-WatchdogLog "hung: $name port :$port busy but probe failed; killing pid"
                    Stop-UiProcessPort $port
                }
                Start-UiProcess $name
                Write-WatchdogLog "restarted: $name"
            }
        } catch {
            Write-WatchdogLog ("watchdog error: " + $_.Exception.Message)
        }
    }
    exit 0
}

# ---- stop supervisor ------------------------------------------------------
if ($StopWatchdog) {
    Stop-Watchdog
    Write-Host "watchdog stopped"
    exit 0
}

# ---- probe only (no starts) ----------------------------------------------
if ($CheckOnly) {
    $allOk = $true
    foreach ($name in $UiOrder) {
        $ok = Test-UiProbe $name
        if (-not $ok) { $allOk = $false }
        $state = "DOWN"
        if ($ok) { $state = "OK" }
        Write-Host ("{0,-10} {1}" -f $name, $state)
    }
    if (Test-WatchdogAlive) { Write-Host "watchdog   ALIVE" } else { Write-Host "watchdog   DOWN" }
    if ($allOk) { exit 0 } else { exit 1 }
}

# ---- ensure (default / -StartIfDown) --------------------------------------
foreach ($name in $UiOrder) {
    if (Test-UiProbe $name) {
        Write-Host "$name alive"
        continue
    }
    Start-UiProcess $name
    Write-Host "$name launched"
}

if (-not $SkipHealth) {
    $deadline = (Get-Date).AddSeconds(40)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        if ((Test-UiProbe "editor") -and (Test-UiProbe "live")) {
            $ready = $true
            break
        }
    }
    foreach ($name in $UiOrder) {
        $state = "WAIT"
        if (Test-UiProbe $name) { $state = "HEALTH OK" }
        Write-Host ("{0,-10} {1}" -f $name, $state)
    }
    if (-not $ready) {
        Write-Host "UI contour not ready"
        exit 1
    }
}

if (-not $NoWatchdog) {
    if (Start-Watchdog) { Write-Host "watchdog started" } else { Write-Host "watchdog alive" }
}

exit 0
