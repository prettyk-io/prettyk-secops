# LVL-1-RW: live smoke - honest chain Record -> reduce -> step -> replay.
# Usage (repo root, stack up):
#   .\orchestrator\tools\live_smoke_actions.ps1
# Params: -Cdp http://localhost:9223
#
# Honest smoke (LVL-1-RW): chain executed by python driver
# orchestrator/tools/live_smoke_actions.py:
#   Record (observe + real CDP actions) -> reduce to snake DSL steps ->
#   step execute -> scenario_replay -> checkpoint fresh replay_timeline.json.
# VERDICT computed strictly from timeline freshness (mtime of this run +
# embedded replay_id): absent / stale / mismatch = FAIL.
param(
    [string]$Cdp = "http://localhost:9223"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$env:PK_BROWSER_CDP_ENDPOINT = $Cdp
if (-not $env:PK_REPLAY_ARTIFACTS_DIR) {
    $env:PK_REPLAY_ARTIFACTS_DIR = Join-Path $root "replay_artifacts"
}

Write-Host "== LVL-1-RW live smoke ==" -ForegroundColor Cyan
Write-Host "  CDP: $Cdp"
Write-Host "  artifacts: $env:PK_REPLAY_ARTIFACTS_DIR"

# 1. CDP reachability.
try {
    $null = Invoke-WebRequest -Uri "$Cdp/json/version" -TimeoutSec 3 -UseBasicParsing
    Write-Host "[1/2] CDP reachable: OK" -ForegroundColor Green
} catch {
    Write-Host "[1/2] CDP unreachable - bring up stack: docker compose -f services/docker-compose.yml up -d playwright-authoring" -ForegroundColor Red
    exit 2
}

# 2. Honest live chain via python driver.
Write-Host "[2/2] live chain: Record -reduce-> step -replay-> fresh timeline..." -ForegroundColor Cyan
$json = py -3 orchestrator/tools/live_smoke_actions.py $Cdp 2>&1
$code = $LASTEXITCODE
if ($code -eq 2) {
    Write-Host "[2/2] CDP unreachable in driver: FAIL" -ForegroundColor Red
    exit 2
}
if ($code -ne 0) {
    Write-Host "[2/2] live chain: FAIL (exit $code)" -ForegroundColor Red
    Write-Host $json
    exit $code
}

# 3. Freshness verdict: parse driver JSON (fields, not stdout tail).
$result = $json | ConvertFrom-Json
if (-not $result) {
    Write-Host "[2/2] cannot parse driver result - VERDICT FAIL" -ForegroundColor Red
    exit 4
}
if ($result.fresh -ne $true) {
    Write-Host "[2/2] timeline stale/absent: $($result.reason) - VERDICT FAIL" -ForegroundColor Red
    exit 4
}
if ($result.verdict -ne "passed") {
    Write-Host "[2/2] replay verdict '$($result.verdict)' - VERDICT FAIL" -ForegroundColor Red
    exit 3
}

$timelineFull = Join-Path $env:PK_REPLAY_ARTIFACTS_DIR "$($result.replay_id)\replay_timeline.json"
Write-Host "  steps:      $($result.steps)" -ForegroundColor Yellow
Write-Host "  replay_id:  $($result.replay_id)" -ForegroundColor Yellow
Write-Host "  timeline:   $timelineFull" -ForegroundColor Yellow
Write-Host "  fresh:      $($result.fresh) (mtime >= run start, replay_id match)" -ForegroundColor Yellow
Write-Host "  Eyes-on:    noVNC :7902 (playwright-authoring) - replay walks the page."

Write-Host ""
Write-Host "== VERDICT: LVL-1-RW green (Record -reduce-> step -replay-> fresh timeline) ==" -ForegroundColor Green
exit 0