# H2 field pipeline: stand -> validate-only -> full run -> run_summary / teardown check.
# Canon: docs/acceptance/05-trials-editor-phase-2026-08-04.md §6b · docs/stand.md §5
#
# From repo root:
#   .\orchestrator\tools\h2_field_pipeline.ps1 -Stage all
#   .\orchestrator\tools\h2_field_pipeline.ps1 -Stage validate
#   .\orchestrator\tools\h2_field_pipeline.ps1 -Stage run -Manifest path\to\from-editor.json
#   .\orchestrator\tools\h2_field_pipeline.ps1 -Stage p10
#
# Codes: 0 = step ok; 2 on Stage run = quality gate (normal for High); other = pipeline fail.
# Strings are ASCII-safe for Windows PowerShell 5.1 without UTF-8 BOM.

param(
    [ValidateSet(
        "prep", "up", "health", "validate", "run", "assert", "p10", "journal", "all"
    )]
    [string]$Stage = "all",

    [string]$Manifest = "",

    [string]$RunDir = "",

    [switch]$SkipUp,
    [switch]$SkipHealth
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

$Py = Join-Path $Root ".venv\Scripts\python.exe"
$Main = Join-Path $Root "orchestrator\main.py"
$DefaultFixture = Join-Path $Root "docs\acceptance\fixtures\operator_juice_editor.sanitized.json"
$IdleManifest = Join-Path $Root "orchestrator\manifests\webswing_manual_idle.json"
$Schema = Join-Path $Root "docs\run_summary.schema.json"

if (-not $Manifest) { $Manifest = $DefaultFixture }
if (-not $RunDir) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $RunDir = Join-Path $Root "reports\h2-runs\$stamp"
}

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Assert-Py {
    if (-not (Test-Path $Py)) {
        throw "Missing $Py - create .venv (see docs/stand.md section 3)"
    }
}

function Invoke-Prep {
    Write-Step "prep: network + dirs + tip"
    Assert-Py
    docker network inspect prettyk-net *> $null
    if ($LASTEXITCODE -ne 0) {
        docker network create prettyk-net
        if ($LASTEXITCODE -ne 0) { throw "docker network create prettyk-net failed" }
    }
    New-Item -ItemType Directory -Force -Path `
        (Join-Path $Root "reports\allure-results"), `
        (Join-Path $Root "reports\allure-report"), `
        (Join-Path $Root "reports\scanner-results"), `
        (Join-Path $Root "reports\video"), `
        $RunDir | Out-Null
    $sha = (git -C $Root rev-parse --short HEAD 2>$null)
    if (-not $sha) { $sha = "?" }
    Write-Host "tip=$sha"
    Write-Host "RunDir=$RunDir"
    Write-Host "Manifest=$Manifest"
    @{ tip = $sha; run_dir = "$RunDir"; manifest = "$Manifest"; started = (Get-Date).ToString("o") } |
        ConvertTo-Json |
        Set-Content -Encoding utf8 (Join-Path $RunDir "pipeline_meta.json")
}

function Invoke-Up {
    Write-Step "up: Grid + Allure + ZAP demon + Juice"
    docker compose -f (Join-Path $Root "services\docker-compose.yml") up -d
    if ($LASTEXITCODE -ne 0) { throw "compose.yml up failed" }
    docker compose -f (Join-Path $Root "services\docker-compose.zap.yml") up -d
    if ($LASTEXITCODE -ne 0) { throw "compose.zap up failed" }
    docker compose -f (Join-Path $Root "services\docker-compose.target.yml") up -d
    if ($LASTEXITCODE -ne 0) { throw "compose.target up failed" }
}

function Test-Http([string]$Url, [string]$Name, [switch]$Quiet) {
    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
        if (-not $Quiet) { Write-Host "OK  $Name  $Url" }
        return $true
    } catch {
        if (-not $Quiet) {
            Write-Host "FAIL $Name  $Url - $($_.Exception.Message)" -ForegroundColor Yellow
        }
        return $false
    }
}

function Invoke-Health {
    Write-Step "health: Grid / Allure / ZAP / Juice (up to ~90s)"
    $checks = @(
        @{ Url = "http://127.0.0.1:4444/status"; Name = "Grid" },
        @{ Url = "http://127.0.0.1:5050/health"; Name = "allure3-secops" },
        @{ Url = "http://127.0.0.1:8080/JSON/core/view/version/"; Name = "ZAP API" },
        @{ Url = "http://127.0.0.1:3000/"; Name = "Juice Shop" }
    )
    $deadline = (Get-Date).AddSeconds(90)
    while ($true) {
        $ok = $true
        foreach ($c in $checks) {
            if (-not (Test-Http $c.Url $c.Name -Quiet)) { $ok = $false }
        }
        if ($ok) {
            foreach ($c in $checks) { $null = Test-Http $c.Url $c.Name }
            return
        }
        if ((Get-Date) -ge $deadline) {
            foreach ($c in $checks) { $null = Test-Http $c.Url $c.Name }
            throw "health: services not ready - see docs/stand.md section 5.3"
        }
        Start-Sleep -Seconds 5
    }
}

function Invoke-Validate {
    Write-Step "validate-only (T-juice-IDE)"
    Assert-Py
    if (-not (Test-Path $Manifest)) { throw "manifest missing: $Manifest" }
    & $Py $Main --manifest $Manifest --validate-only
    if ($LASTEXITCODE -ne 0) {
        throw "validate-only exit=$LASTEXITCODE (expected 0)"
    }
    Write-Host "validate-only OK"
}

function Invoke-Run {
    Write-Step "full run -> KDT_RUN_DIR (P-09 / teardown)"
    Assert-Py
    if (-not (Test-Path $Manifest)) { throw "manifest missing: $Manifest" }
    New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
    $env:KDT_RUN_DIR = $RunDir
    if (-not $env:KDT_WEBDRIVER_MODE) {
        $env:KDT_WEBDRIVER_MODE = "remote"
    }
    Write-Host "KDT_RUN_DIR=$env:KDT_RUN_DIR"
    Write-Host "KDT_WEBDRIVER_MODE=$env:KDT_WEBDRIVER_MODE"
    & $Py $Main --manifest $Manifest
    $code = $LASTEXITCODE
    Set-Content -Encoding utf8 (Join-Path $RunDir "process_exit.txt") "$code"
    Write-Host "process exit_code=$code (0=ok, 2=gate High often normal for Juice)"
    if ($code -ne 0 -and $code -ne 2) {
        throw "full run unexpected exit=$code"
    }
    return $code
}

function Invoke-Assert {
    Write-Step "assert: run_summary + artifacts"
    $summary = Join-Path $RunDir "run_summary.json"
    if (-not (Test-Path $summary)) {
        $fallback = Join-Path $Root "orchestrator\run_summary.json"
        $cwdSum = Join-Path (Get-Location) "run_summary.json"
        if (Test-Path $fallback) { Copy-Item $fallback $summary -Force }
        elseif (Test-Path $cwdSum) { Copy-Item $cwdSum $summary -Force }
    }
    if (-not (Test-Path $summary)) {
        throw "missing run_summary.json in $RunDir (and fallback) - P-09 fail"
    }
    Write-Host "run_summary: $summary"
    $json = Get-Content -Raw -Encoding utf8 $summary | ConvertFrom-Json
    if ($null -eq $json.exit_code) { throw "run_summary: missing exit_code" }
    if (-not $json.gate) { throw "run_summary: missing gate" }
    $procFile = Join-Path $RunDir "process_exit.txt"
    if (Test-Path $procFile) {
        $procExit = [int](Get-Content -Raw $procFile).Trim()
        if ($procExit -ne [int]$json.exit_code) {
            throw "P-09: process exit ($procExit) != run_summary.exit_code ($($json.exit_code))"
        }
    }
    Write-Host "gate=$($json.gate)  exit_code=$($json.exit_code)  zap_mode=$($json.zap_mode)"
    if (Test-Path $Schema) {
        Write-Host "schema ref: $Schema (full jsonschema in CI; here required fields)"
    }
    $zapDir = Join-Path $Root "reports\scanner-results"
    if (Test-Path $zapDir) {
        $n = @(Get-ChildItem $zapDir -File -ErrorAction SilentlyContinue).Count
        Write-Host "reports/scanner-results files: $n"
    } else {
        Write-Host "warn: no reports/scanner-results" -ForegroundColor Yellow
    }
    Write-Host "assert OK (P-09 minimum)"
}

function Invoke-P10 {
    Write-Step "P-10: Webswing up + idle manifest (hold)"
    Assert-Py
    $up = Join-Path $Root "services\zap-webswing-up.ps1"
    if (-not (Test-Path $up)) { throw "missing $up" }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $up
    if ($LASTEXITCODE -ne 0) { throw "zap-webswing-up failed" }
    if (-not (Test-Path $IdleManifest)) { throw "missing $IdleManifest" }
    Write-Host "idle run (empty scenarios -> hold). Stop with Ctrl+C or manifest timeout."
    Write-Host "manifest: $IdleManifest"
    $env:KDT_RUN_DIR = $RunDir
    & $Py $Main --manifest $IdleManifest
    Write-Host "P-10 process exit=$LASTEXITCODE (record hold in journal 05)"
}

function Invoke-Journal {
    Write-Step "journal 05 snippet"
    $sha = (git -C $Root rev-parse --short HEAD 2>$null)
    if (-not $sha) { $sha = "?" }
    $summary = Join-Path $RunDir "run_summary.json"
    $gate = "?"
    $ex = "?"
    $p09 = "missing"
    if (Test-Path $summary) {
        $j = Get-Content -Raw -Encoding utf8 $summary | ConvertFrom-Json
        $gate = $j.gate
        $ex = $j.exit_code
        $p09 = "ok"
    }
    $day = Get-Date -Format "yyyy-MM-dd"
    $block = @(
        "| Pole | Znachenie |",
        "|---|---|",
        "| Data / kto | $day / |",
        "| Tip SHA | $sha |",
        "| FE URL | http://127.0.0.1:5173 |",
        "| Playground health | |",
        "| Manifest | $Manifest |",
        "| RunDir | $RunDir |",
        "| validate-only | |",
        "| E1..E6 | |",
        "| V1..V6 | |",
        "| T-juice-IDE full | exit=$ex gate=$gate |",
        "| P-09 run_summary | $p09 |",
        "| P-10 idle | skip / ok |",
        "| R1..R3 | |",
        "| Verdikt UI-geita | PASS / FAIL |"
    ) -join "`n"
    $out = Join-Path $RunDir "journal_snippet.md"
    Set-Content -Encoding utf8 $out $block
    Write-Host $block
    Write-Host ""
    Write-Host "snippet: $out"
}

$stages = switch ($Stage) {
    "all" { @("prep", "up", "health", "validate", "run", "assert", "journal") }
    default { @($Stage) }
}

foreach ($s in $stages) {
    if ($s -eq "up" -and $SkipUp) { continue }
    if ($s -eq "health" -and $SkipHealth) { continue }
    switch ($s) {
        "prep" { Invoke-Prep }
        "up" { Invoke-Up }
        "health" { Invoke-Health }
        "validate" { Invoke-Validate }
        "run" { $null = Invoke-Run }
        "assert" { Invoke-Assert }
        "p10" {
            if ($Stage -eq "all") {
                Write-Host "P-10 not in -Stage all. Run: -Stage p10"
            } else {
                Invoke-Prep
                Invoke-P10
            }
        }
        "journal" { Invoke-Journal }
    }
}

Write-Host ""
Write-Host "pipeline done. Stage=$Stage RunDir=$RunDir" -ForegroundColor Green
