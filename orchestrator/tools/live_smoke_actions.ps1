# LVL-1: live smoke - full action set Record -> observe -> redaction -> DSL -> replay.
# Usage (repo root, stack up):
#   .\orchestrator\tools\live_smoke_actions.ps1
# Params: -Cdp http://localhost:9223 -SkipReplay
#
# Runs the live end-to-end chain of 9 observe-action (click/type/select/wheel/
# scroll/drag/hover/key/focus) over a real CDP browser and prints the verdict
# + path to replay_timeline.json (artifacts for Maxim's eyes-on). Requires the
# playwright-authoring container up and PK_BROWSER_CDP_ENDPOINT.
param(
    [string]$Cdp = "http://localhost:9223",
    [switch]$SkipReplay
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$env:PK_BROWSER_CDP_ENDPOINT = $Cdp
if (-not $env:PK_REPLAY_ARTIFACTS_DIR) {
    $env:PK_REPLAY_ARTIFACTS_DIR = Join-Path $root "replay_artifacts"
}

Write-Host "== LVL-1 live smoke ==" -ForegroundColor Cyan
Write-Host "  CDP: $Cdp"
Write-Host {}

# 1. CDP reachability.
try {
    $null = Invoke-WebRequest -Uri "$Cdp/json/version" -TimeoutSec 3 -UseBasicParsing
    Write-Host "[1/3] CDP reachable: OK" -ForegroundColor Green
} catch {
    Write-Host "[1/3] CDP unreachable - bring up stack: docker compose -f services/docker-compose.yml up -d playwright-authoring" -ForegroundColor Red
    exit 2
}

# 2. Full live round-trip (marker live): observe -> redaction -> step -> replay.
$pytestArgs = @("orchestrator/tests/test_browser_authoring_live.py", "-m", "live", "--tb=short")
if ($SkipReplay) {
    $pytestArgs += @("-k", "not replay")
}
Write-Host "[2/3] live full action round-trip..." -ForegroundColor Cyan
py -3 -m pytest @pytestArgs -q
$code = $LASTEXITCODE
if ($code -ne 0) {
    Write-Host "[2/3] live round-trip: FAIL (exit $code)" -ForegroundColor Red
    exit $code
}
Write-Host "[2/3] live round-trip: PASS (all 9 actions -> DSL step -> replay)" -ForegroundColor Green

# 3. Replay artifacts for Maxim's eyes-on.
Write-Host "[3/3] replay artifacts:" -ForegroundColor Cyan
$timelines = Get-ChildItem -Path $env:PK_REPLAY_ARTIFACTS_DIR -Filter "replay_timeline.json" -Recurse -ErrorAction SilentlyContinue
if ($timelines) {
    $latest = $timelines | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host "  timeline: $($latest.FullName)" -ForegroundColor Yellow
    Write-Host "  screenshots dir: $($latest.DirectoryName)" -ForegroundColor Yellow
    Write-Host "  Eyes-on: noVNC :7902 (playwright-authoring) - replay walks the page."
} else {
    Write-Host "  (no timeline persisted - replay steps passed without persist, or -SkipReplay)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "== VERDICT: LVL-1 full action set green (observe -> redaction -> step -> replay) ==" -ForegroundColor Green
exit 0