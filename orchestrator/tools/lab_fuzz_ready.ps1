#Requires -Version 5.1
<#
.SYNOPSIS
  Проверяет (и при необходимости поднимает) lab-контур под Juice + DAST-fuzz labs.

.DESCRIPTION
  Без -StartOnlyCheck вызывает lab_up.ps1, затем HTTP-пробы ZAP/Juice/Live/Allure
  и печатает команды smoke. Webswing не трогает.

.EXAMPLE
  .\orchestrator\tools\lab_fuzz_ready.ps1

.EXAMPLE
  .\orchestrator\tools\lab_fuzz_ready.ps1 -CheckOnly
#>
param(
    [switch]$CheckOnly,
    [switch]$IncludeDefectDojo
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$VenvPython = Join-Path $RepoRoot '.venv\Scripts\python.exe'
$LabUp = Join-Path $PSScriptRoot 'lab_up.ps1'

function Test-HttpOk {
    param([string]$Url, [int]$TimeoutSec = 5)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch {
        return $false
    }
}

Write-Host "branch-seat: stay on current (do not switch). cwd=$RepoRoot"

if (-not $CheckOnly) {
    Write-Host "START lab_up.ps1$(if ($IncludeDefectDojo) { ' -IncludeDefectDojo' } else { '' })"
    if ($IncludeDefectDojo) {
        & $LabUp -IncludeDefectDojo
    } else {
        & $LabUp
    }
    if ($LASTEXITCODE -ne 0) {
        throw "lab_up.ps1 failed (exit $LASTEXITCODE)"
    }
}

$probes = @(
    @{ Name = 'ZAP demon'; Url = 'http://127.0.0.1:8080/JSON/core/view/version/' },
    @{ Name = 'Juice'; Url = 'http://127.0.0.1:3000/' },
    @{ Name = 'PrettyK Live'; Url = 'http://127.0.0.1:8767/api/meta' },
    @{ Name = 'Allure'; Url = 'http://127.0.0.1:5050/' }
)

$failed = @()
foreach ($p in $probes) {
    $ok = Test-HttpOk -Url $p.Url
    if ($ok) {
        Write-Host "OK  $($p.Name)  $($p.Url)"
    } else {
        Write-Host "RED $($p.Name)  $($p.Url)"
        $failed += $p.Name
    }
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "RED venv python missing: $VenvPython"
    $failed += 'venv'
} else {
    Write-Host "OK  venv  $VenvPython"
}

Write-Host ''
Write-Host '--- fuzz smoke (copy/paste) ---'
Write-Host @'
.\.venv\Scripts\python.exe orchestrator\tools\lab_fuzz_wave_juice.py --max-requests 3 --no-live
.\.venv\Scripts\python.exe orchestrator\tools\lab_fuzz_juice_session_wave.py --max-requests 3 --no-live
.\.venv\Scripts\python.exe orchestrator\tools\lab_fuzz_juice_df11.py --mode all --max-requests 3 --no-live
.\.venv\Scripts\python.exe orchestrator\tools\lab_fuzz_juice_df12.py --mode all --max-requests 4 --no-live
'@
Write-Host '--- unit band ---'
Write-Host @'
.\.venv\Scripts\python.exe -m pytest orchestrator/tests/test_fuzz_poc.py orchestrator/tests/test_fuzz_df10.py orchestrator/tests/test_fuzz_df11.py orchestrator/tests/test_fuzz_df12.py orchestrator/tests/test_fuzz_df13_14.py orchestrator/tests/test_fuzz_mc3_reflection.py -q
'@
Write-Host '--- guide ---'
Write-Host 'docs/fuzz-lab-debug.md'
Write-Host ''

if ($failed.Count -gt 0) {
    Write-Host "FAIL: not ready: $($failed -join ', ')"
    exit 2
}

Write-Host 'READY: Juice + ZAP demon + Live contour for fuzz labs'
exit 0
