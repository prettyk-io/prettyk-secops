#Requires -Version 5.1
<#
.SYNOPSIS
  PrettyK Atest Pipeline -- one-shot: services → tests → detailed evidence → debuggable.
.DESCRIPTION
  pw_pipeline.ps1 [-Project smoke] [-Headed] [-SkipEnsure] [-OpenReport] [-Retries N]

  Steps:
    1. Ensure Editor :5173, Playground :8765, Live :8767 (skip with -SkipEnsure)
    2. Run Playwright tests (with configurable retries)
    3. Detailed per-failure report: file, test name, error snippet, screenshot path, duration
    4. Environment snapshot: git hash, Node/PW/Chrome versions
    5. Slowest 5 tests -- identify bottlenecks
    6. Service health post-run (did anything crash?)
    7. -OpenReport: auto-open Playwright HTML report in browser

  Debug faster: one glance at the output tells you exactly what broke and where.
#>
param(
    [ValidateSet('smoke','regression','monitor','cdp','all')]
    [string]$Project = 'smoke',
    [switch]$Headed,
    [switch]$SkipEnsure,
    [switch]$OpenReport,
    [int]$Retries = 0
)

$ErrorActionPreference = 'Continue'
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$Atest = 'D:\prettyk-atest'
$Py = Join-Path $Root '.venv\Scripts\python.exe'
$Cosmo = Join-Path $Root 'cosmo'
$Or = Join-Path $Root 'orchestrator'

if (-not (Test-Path $Py)) { $Py = Join-Path $Root 'venv\Scripts\python.exe' }
if (-not (Test-Path $Py)) { Write-Warning ".venv not found -- trying system python"; $Py = 'python' }

function Write-Bar($text, $color = 'Cyan') { Write-Host "`n$('=' * 72)" -ForegroundColor DarkGray; Write-Host " $text" -ForegroundColor $color }

Write-Host "`n  +==============================================================+"  -ForegroundColor Cyan
Write-Host "  |        PrettyK Atest Pipeline -- $($Project.ToUpper())"       -ForegroundColor Cyan
$timePadding = ' ' * (17 - $Project.Length)
Write-Host "  |        $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')$timePadding                             |"  -ForegroundColor Cyan
Write-Host "  +==============================================================+`n"  -ForegroundColor Cyan

# -- 0. Environment snapshot --------------------------------------
Write-Bar 'ENVIRONMENT' Cyan
try { $gitHash = (& git -C $Root rev-parse --short HEAD 2>$null) -replace '\s','' } catch { $gitHash = '?' }
try { $nodeVer = (& node --version 2>$null) -replace '\s','' } catch { $nodeVer = '?' }
try { $pwVer = (& npx playwright --version 2>$null) -replace '\s','' } catch { $pwVer = '?' }

$envRows = @(
    @{K='Git';     V=$gitHash},
    @{K='Node';    V=$nodeVer},
    @{K='PW';      V=$pwVer},
    @{K='Editor';  V=':5173'},
    @{K='Playgr';  V=':8765'},
    @{K='Live';    V=':8767'},
    @{K='Project'; V=$Project},
    @{K='Headed';  V=$Headed},
    @{K='Retries'; V=$Retries}
)
$envRows | ForEach-Object { Write-Host "  $($_.K.PadRight(8)) $($_.V)" -ForegroundColor DarkGray }

# -- 1. Ensure services ------------------------------------------
if (-not $SkipEnsure) {
    Write-Bar 'SERVICES' Cyan

    $needs = @{}
    $ed = netstat -ano | Select-String ':5173 .*LISTENING'
    if (-not $ed) { Write-Host "  Starting Editor :5173 ..." -ForegroundColor Yellow; Start-Process -FilePath cmd -ArgumentList @('/c','cd','/d',$Cosmo,'&','npm','run','dev') -WindowStyle Hidden; $needs.Editor = $true }
    else { Write-Host "  Editor :5173   [ok]" -ForegroundColor Green }

    $pg = netstat -ano | Select-String ':8765 .*LISTENING'
    if (-not $pg) { Write-Host "  Starting Playground :8765 ..." -ForegroundColor Yellow; Start-Process -FilePath $Py -ArgumentList '-u','-m','tools.data_playground' -WorkingDirectory $Or -WindowStyle Hidden; $needs.Playground = $true }
    else { Write-Host "  Playground :8765 [ok]" -ForegroundColor Green }

    $lv = netstat -ano | Select-String ':8767 .*LISTENING'
    if (-not $lv) { Write-Host "  Starting Live :8767 ..." -ForegroundColor Yellow; Start-Process -FilePath $Py -ArgumentList '-u','tools\run_live_idle.py' -WorkingDirectory $Or -WindowStyle Hidden; $needs.Live = $true }
    else { Write-Host "  Live :8767      [ok]" -ForegroundColor Green }

    if ($needs.Count -gt 0) {
        Write-Host "  Waiting for health ..." -ForegroundColor Yellow
        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep 3
            try {
                $edChk = (Invoke-WebRequest -Uri http://localhost:5173/ -UseBasicParsing -TimeoutSec 3).StatusCode
                if ($edChk -ne 200) { continue }
                $lvChk = Invoke-WebRequest -Uri http://127.0.0.1:8767/api/meta -UseBasicParsing -TimeoutSec 3
                if ($lvChk.Content -match '"session_name"') {
                    Write-Host "  All healthy" -ForegroundColor Green
                    break
                }
            } catch {}
            Write-Host "  ." -NoNewline
        }
        Write-Host ""
    }
} else {
    Write-Bar 'SERVICES (skip)' DarkGray
    Write-Host "  Skipped -- assuming services are already running" -ForegroundColor DarkGray
}

# -- 2. Run tests ------------------------------------------------
Write-Bar "TESTS $Project" Cyan

$env:ATEST_EDITOR_URL = 'http://localhost:5173'
$env:ATEST_PLAYGROUND_URL = 'http://127.0.0.1:8765'
$env:ATEST_LIVE_URL = 'http://127.0.0.1:8767'
if ($Headed) { $env:ATEST_HEADED = '1' }
if ($Retries -gt 0) { $env:PW_RETRIES = $Retries }

$pwOutputFile = Join-Path $env:TEMP "pw-pipeline-$Project-output.txt"

Push-Location $Atest
try {
    $cmdArgs = @('playwright','test','--config','playwright-ui/playwright.config.ts')
    if ($Project -ne 'all') { $cmdArgs += '--project',$Project }
    if ($Retries -gt 0) { $cmdArgs += '--retries',$Retries }

    $pwTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $raw = & npx @cmdArgs 2>&1
    $PlaywrightExit = $LASTEXITCODE
    $pwTimer.Stop()
    $raw | Out-File $pwOutputFile -Encoding utf8

    # Parse structured output -- extract PASS/FAIL lines
    $failLines = $raw | Select-String '^\s+\d+\)\s+\['
    $passLines = $raw | Select-String '^\s+ok\s+\d+'
    $flakyLines = $raw | Select-String 'flaky|retry|retries'

    $passedCount = $passLines.Count
    $failedCount = $failLines.Count
    $flakyCount = $flakyLines.Count

    # Show live output
    $raw | Select-Object -Last 40 | ForEach-Object { Write-Host "  $_" }
} finally {
    Pop-Location
}

# -- 3. Detailed failures -----------------------------------------
$evidenceFile = Join-Path $Atest 'evidence\test-results.json'
$hasEvidence = Test-Path $evidenceFile

if ($hasEvidence) {
    try { $results = Get-Content $evidenceFile -Raw | ConvertFrom-Json } catch { $results = $null }
} else { $results = $null }

if ($failedCount -gt 0) {
    Write-Bar "FAILED TESTS ($failedCount)" Red

    if ($results) {
        $allTests = @()
        foreach ($suite in $results.suites) {
            foreach ($spec in $suite.specs) {
                foreach ($t in $spec.tests) {
                    $r = $t.results[0]
                    if ($r.status -ne 'passed') {
                        $allTests += [PSCustomObject]@{
                            File     = Split-Path $spec.file -Leaf
                            Test     = $t.title
                            Error    = if ($r.error.message) { ($r.error.message -split "`n")[0] } elseif ($r.error.stack) { ($r.error.stack -split "`n")[0] } else { '?' }
                            DurSec   = [math]::Round($r.duration / 1000, 1)
                            Screenshot = if ($r.attachments) { ($r.attachments | Where-Object { $_.name -like '*screenshot*' }).path } else { $null }
                        }
                    }
                }
            }
        }
    } else {
        # Fallback: parse from raw output
        Write-Host "  (parsing from raw output - evidence JSON unavailable)`n" -ForegroundColor DarkGray
        foreach ($line in $failLines) {
            Write-Host "  $($line -replace '^\s+','')" -ForegroundColor DarkGray
        }
    }

    if ($allTests -and $allTests.Count -gt 0) {
        foreach ($t in $allTests) {
            Write-Host "  -- $($t.File)" -ForegroundColor Red
            Write-Host "  -- $($t.Test)" -ForegroundColor White
            Write-Host "  -- $($t.DurSec)s" -ForegroundColor DarkGray
            Write-Host "  -- $($t.Error.Substring(0, [Math]::Min(140, $t.Error.Length)))" -ForegroundColor DarkYellow
            if ($t.Screenshot) {
                $fullPath = Join-Path $Atest $t.Screenshot
                $relPath = $t.Screenshot
                Write-Host "  -- 🖼  $relPath" -ForegroundColor DarkCyan
            } else {
                Write-Host "  -- (no screenshot)" -ForegroundColor DarkGray
            }
            Write-Host ""
        }
    }
}

# -- 4. Slowest tests ---------------------------------------------
Write-Bar "SLOWEST 5" DarkGray
$timed = @()

# Try evidence JSON first
if ($results) {
    foreach ($suite in $results.suites) {
        foreach ($spec in $suite.specs) {
            $file = Split-Path $spec.file -Leaf
            foreach ($t in $spec.tests) {
                $dur = [math]::Round($t.results[0].duration / 1000, 1)
                $timed += [PSCustomObject]@{ File=$file; Test=$t.title; Dur=$dur }
            }
        }
    }
}

# Fallback: parse timing from raw output lines like "ok  4 ... (8.6s)"
if ($timed.Count -eq 0 -and $raw) {
    $raw | Select-String '^\s+ok\s+\d+' | ForEach-Object {
        $line = $_.Line
        if ($line -match '\(([\d.]+)s\)') {
            $dur = [double]$matches[1]
            # Extract file name + test name
            $parts = $line -split '›'
            if ($parts.Count -ge 3) {
                $file = ($parts[1] -split '\\')[-1] -replace '\s+$',''
                $test = ($parts[2..($parts.Count-1)] -join '›') -replace '\([\d.]+s\)','' -replace '\s+$',''
                $timed += [PSCustomObject]@{ File=$file; Test=$test.Trim(); Dur=$dur }
            }
        }
    }
}

$timed | Sort-Object Dur -Descending | Select-Object -First 5 | ForEach-Object {
    $bar = if ($_.Dur -gt 60) { 'RED' } elseif ($_.Dur -gt 10) { 'YEL' } else { 'GRN' }
    $color = if ($_.Dur -gt 60) { 'Red' } elseif ($_.Dur -gt 10) { 'Yellow' } else { 'Green' }
    Write-Host "  [$bar] $($_.Dur.ToString('0.0').PadLeft(6))s  $($_.File): $($_.Test)" -ForegroundColor $color
}

if ($timed.Count -eq 0) {
    Write-Host "  (no timing data)" -ForegroundColor DarkGray
}

# -- 5. Service health post-run ----------------------------------
Write-Bar "POST-RUN HEALTH" DarkGray
$postEd = netstat -ano | Select-String ':5173 .*LISTENING'
$postPg = netstat -ano | Select-String ':8765 .*LISTENING'
$postLv = netstat -ano | Select-String ':8767 .*LISTENING'
Write-Host "  Editor :5173    $(if ($postEd) {'[ok]'} else {'[DEAD]'})" -ForegroundColor $(if ($postEd) {'Green'} else {'Red'})
Write-Host "  Playgr :8765    $(if ($postPg) {'[ok]'} else {'[DEAD]'})" -ForegroundColor $(if ($postPg) {'Green'} else {'Red'})
Write-Host "  Live   :8767    $(if ($postLv) {'[ok]'} else {'[DEAD]'})" -ForegroundColor $(if ($postLv) {'Green'} else {'Red'})

# Quick API probes
if ($postLv) {
    try {
        $meta = Invoke-RestMethod -Uri http://127.0.0.1:8767/api/meta -TimeoutSec 3
        Write-Host "  Live meta        session=$($meta.session_name) phase=$($meta.ci_phase) verdict=$($meta.ci_verdict)" -ForegroundColor DarkGray
    } catch { Write-Host "  Live meta        DOWN" -ForegroundColor Red }
}
if ($postPg) {
    try {
        $rs = Invoke-RestMethod -Uri http://127.0.0.1:8765/api/run/status -TimeoutSec 3
        Write-Host "  Playgr status    phase=$($rs.phase) run_id=$($rs.run_id) exit=$($rs.exit_code)" -ForegroundColor DarkGray
    } catch { Write-Host "  Playgr status    DOWN" -ForegroundColor Red }
}

# -- 6. Summary ---------------------------------------------------
$Stopwatch.Stop()
$totalSec = [math]::Round($Stopwatch.Elapsed.TotalSeconds, 0)

Write-Bar "SUMMARY" $(if ($PlaywrightExit -eq 0) {'Green'} else {'Red'})
Write-Host "  Passed : $passedCount" -ForegroundColor $(if ($passedCount -gt 0) {'Green'} else {'DarkGray'})
Write-Host "  Failed : $failedCount" -ForegroundColor $(if ($failedCount -gt 0) {'Red'} else {'Green'})
if ($flakyCount -gt 0) { Write-Host "  Flaky  : $flakyCount" -ForegroundColor Yellow }
Write-Host "  Total  : ${totalSec}s" -ForegroundColor DarkGray
Write-Host "  Log    : $pwOutputFile" -ForegroundColor DarkGray
Write-Host ""

# Show report commands
Write-Host "  Report : npx playwright show-report $Atest\playwright-report" -ForegroundColor Magenta
if ($evidenceFile -and (Test-Path $evidenceFile)) {
    $evidenceSize = [math]::Round((Get-Item $evidenceFile).Length / 1KB, 1)
    Write-Host "  Evidence: $evidenceFile ($evidenceSize KB)" -ForegroundColor DarkGray
}
Write-Host ""

if ($OpenReport) {
    Write-Host "  Opening Playwright HTML report ..." -ForegroundColor Cyan
    Start-Process npx -ArgumentList 'playwright','show-report',"$Atest\playwright-report" -WindowStyle Hidden
}

exit $PlaywrightExit
