# PW-C2: Airgap bundle — один образ Playwright (браузеры + либы + ffmpeg).
# Windows-эквивалент airgap-bundle.sh.
#
#   .\services\scripts\airgap-bundle.ps1 [out.tar.gz]
#
# На чистом хосте (без интернета):
#   docker load < out.tar.gz
#   docker compose -f services/docker-compose.yml up -d playwright-authoring
#
# Инвариант: playwright install / pip install / npx playwright НЕ вызывается
# на рантайме и при load — браузеры и либы уже в образе.
param(
    [string]$Out = "pk-pw-airgap.tar.gz"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")   # → services/

$Image = "pk-playwright-authoring:local"

Write-Host "[airgap-bundle] build image $Image"
docker compose -f docker-compose.yml build playwright-authoring
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "[airgap-bundle] verify: browsers baked into image"
$check = docker run --rm --entrypoint sh $Image -c 'test -d /ms-playwright/chromium-1129 && test -d /ms-playwright/firefox-1458 && echo browsers-OK'
Write-Host "[airgap-bundle] $check"

Write-Host "[airgap-bundle] docker save -> $Out"
docker save $Image | gzip > $Out
if ($LASTEXITCODE -ne 0) { throw "save failed" }

$size = (Get-Item $Out).Length
Write-Host "[airgap-bundle] done: $Out ($([math]::Round($size/1MB,1)) MB)"
Write-Host "  load: docker load < $Out"
Write-Host "  up:   docker compose -f services/docker-compose.yml up -d playwright-authoring"
