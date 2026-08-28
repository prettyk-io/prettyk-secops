# PrettyK Pure — airgap installer (Windows).
#
# На чистой airgap-машине (без интернета):
#   1. Распаковать бандл: tar -xzf prettyk-pure-vX.Y.Z-airgap.tar.gz
#   2. Запустить: .\scripts\install.ps1
#
# Инвариант: 0 внешних сетевых запросов.
# Проверка Docker-окружения обязательна до старта.
param(
    [string]$DataDir = "prettyk-data"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSCommandPath
$BundleRoot = Resolve-Path (Join-Path $ScriptDir "..")

Write-Host "=== PrettyK Pure Airgap Install ==="

# 1. Проверить Docker
$dockerVersion = & docker version --format '{{.Server.Version}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Engine not available. Install Docker Desktop (standalone) first."
}
Write-Host "Docker $dockerVersion OK"

# 2. Загрузить образы
Write-Host "[install] load images"
Get-ChildItem "$BundleRoot\images\*.tar" | ForEach-Object {
    Write-Host "  $($_.Name)"
    docker load -i $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "docker load failed: $($_.Name)" }
}

# 3. Создать data-директории
Write-Host "[install] init data dirs"
$dataPath = Join-Path $BundleRoot $DataDir
New-Item -ItemType Directory -Force -Path "$dataPath\reports\allure-results" | Out-Null
New-Item -ItemType Directory -Force -Path "$dataPath\reports\allure3-report" | Out-Null
New-Item -ItemType Directory -Force -Path "$dataPath\reports\live" | Out-Null
New-Item -ItemType Directory -Force -Path "$dataPath\reports\runs" | Out-Null
New-Item -ItemType Directory -Force -Path "$dataPath\scanner\plugins" | Out-Null

# 4. Создать сеть
Write-Host "[install] create network pk-net"
docker network create pk-net 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "  network may already exist (ok)" }

# 5. Стартовать системный контур
Write-Host "[install] start system services (base)"
docker compose -f "$BundleRoot\compose\docker-compose.base.yml" up -d
if ($LASTEXITCODE -ne 0) { throw "base compose failed" }

Write-Host "=== install OK ==="
Write-Host "  Allure:    http://127.0.0.1:5050/"
Write-Host "  Session:   docker compose -f compose/session-template.yml -p pk-session-dev up -d"