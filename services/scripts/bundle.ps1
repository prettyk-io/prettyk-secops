# PrettyK Pure — airgap bundle builder (Windows).
#
# Собирает самодостаточный offline-бандл для чистой airgap-машины:
#   .\services\scripts\bundle.ps1 [-Version 0.1.0]
#
# Формат бандла:
#   prettyk-pure-vX.Y.Z-airgap.tar.gz
#   ├── manifest.json      # версии + sha256 + совместимость
#   ├── images/               # OCI-образы (.tar)
#   ├── compose/              # base.yml + session-template.yml
#   ├── scripts/              # install.ps1 / install.sh / verify-bundle.sh
#   └── migrations/           # SQL-схемы (опционально)
#
# Инвариант: 0 внешних сетевых запросов при установке.
# pip install / npm install / playwright install / scanner-плагины — только на этапе сборки.
param(
    [string]$Version = "0.1.0",
    [string]$OutDir = "bundle-out",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ServicesDir = Join-Path $RepoRoot "services"
$BundleWork = Join-Path $RepoRoot $OutDir
$BundleName = "prettyk-pure-v$Version-airgap"

# Образы для включения в бандл.
$Images = @(
    @{ Name = "pk-playwright-authoring"; Tag = "local"; ComposeSvc = "playwright-authoring"; ComposeFile = "session-template.yml" },
    @{ Name = "prettyk-allure3";          Tag = "local"; ComposeSvc = "prettyk-allure3";        ComposeFile = "docker-compose.base.yml" },
    @{ Name = "pk-llm-server";            Tag = "dev";  ComposeSvc = "llm-server";             ComposeFile = "docker-compose.base.yml" },
    @{ Name = "pk-api-lab";               Tag = "local"; ComposeSvc = "pk-api-lab";             ComposeFile = "session-template.yml" }
)

# External pull images.
$PullImages = @(
    @{ Name = "zaproxy/zap-stable";              Tag = "2.17.0" },
    @{ Name = "bkimminich/juice-shop";       Tag = "v20.1.1" }
)

Write-Host "=== PrettyK Pure Airgap Bundle v$Version ==="

# 1. Подготовка
if ($DryRun) {
    Write-Host "[bundle] Dry-run mode: skipping bundle dir preparation"
} else {
    if (Test-Path $BundleWork) { Remove-Item -Recurse -Force $BundleWork }
    New-Item -ItemType Directory -Path "$BundleWork\images" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\compose" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\scripts" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\migrations" -Force | Out-Null
}

# 2. Сборка build-образов
Write-Host "[bundle] build images$(if ($DryRun) { ' (dry-run)' })"
Push-Location $RepoRoot
try {
    foreach ($img in $Images) {
        Write-Host "  build $($img.Name):$($img.Tag) [svc: $($img.ComposeSvc)]"
        $composePath = "services\$($img.ComposeFile)"
        if (-not (Test-Path $composePath) -and (Test-Path "services\docker-compose.$($img.ComposeFile)")) {
            $composePath = "services\docker-compose.$($img.ComposeFile)"
        }
        if ($DryRun) {
            docker compose -f $composePath build --dry-run $img.ComposeSvc
        } else {
            docker compose -f $composePath build $img.ComposeSvc
        }
        if ($LASTEXITCODE -ne 0) { throw "build failed: $($img.Name)" }
    }
} finally {
    Pop-Location
}

if ($DryRun) {
    Write-Host "[bundle] Dry-run complete. All compose services validated successfully."
    return
}

# 3. Pull внешних образов
foreach ($img in $PullImages) {
    Write-Host "  pull $($img.Name):$($img.Tag)"
    docker pull "$($img.Name):$($img.Tag)"
    if ($LASTEXITCODE -ne 0) { throw "pull failed: $($img.Name)" }
}

# 4. Сохранить build-образы
Write-Host "[bundle] save images"
foreach ($img in $Images) {
    $tarName = "$($img.Name.Replace('/', '_').Replace(':', '_'))_$($img.Tag).tar"
    Write-Host "  $tarName"
    docker save "$($img.Name):$($img.Tag)" -o "$BundleWork\images\$tarName"
    if ($LASTEXITCODE -ne 0) { throw "save failed: $($img.Name)" }
}
foreach ($img in $PullImages) {
    $tarName = "$($img.Name.Replace('/', '_').Replace(':', '_'))_$($img.Tag).tar"
    Write-Host "  $tarName"
    docker save "$($img.Name):$($img.Tag)" -o "$BundleWork\images\$tarName"
    if ($LASTEXITCODE -ne 0) { throw "save failed: $($img.Name)" }
}

# 5. Копировать compose-файлы
Write-Host "[bundle] copy compose"
Copy-Item "$ServicesDir\docker-compose.base.yml" "$BundleWork\compose\" -Force
Copy-Item "$ServicesDir\session-template.yml"   "$BundleWork\compose\" -Force

# 6. Копировать install/verify скрипты
Copy-Item "$ServicesDir\scripts\install.ps1"        "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue
Copy-Item "$ServicesDir\scripts\install.sh"         "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue
Copy-Item "$ServicesDir\scripts\verify-bundle.sh"   "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue

# 7. Сгенерировать manifest.json
$wired = @{
    bundle = "prettyk-pure"
    version = $Version
    created = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    compatibility = @{
        docker = ">= 24.0"
        os = @("windows", "linux")
        arch = @("amd64")
    }
    images = @(
        foreach ($img in $Images) {
            $tarName = "$($img.Name.Replace('/', '_').Replace(':', '_'))_$($img.Tag).tar"
            @{ name = "$($img.Name):$($img.Tag)"; file = "images/$tarName" }
        }
        foreach ($img in $PullImages) {
            $tarName = "$($img.Name.Replace('/', '_').Replace(':', '_'))_$($img.Tag).tar"
            @{ name = "$($img.Name):$($img.Tag)"; file = "images/$tarName" }
        }
    )
    compose = @(
        @{ file = "compose/docker-compose.base.yml"; role = "system" },
        @{ file = "compose/session-template.yml"; role = "session" }
    )
}
$wired | ConvertTo-Json -Depth 4 | Set-Content -Path "$BundleWork\manifest.json" -Encoding UTF8

# 8. Вычислить checksums
Push-Location $BundleWork
try {
    $checksums = Get-ChildItem -Recurse -File | Where-Object { $_.Name -ne "manifest.json" } | ForEach-Object {
        $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
        $rel = $_.FullName.Substring($BundleWork.Length + 1).Replace('\', '/')
        "$hash  $rel"
    }
    $checksums | Set-Content -Path "$BundleWork\checksums.sha256" -Encoding ASCII
} finally {
    Pop-Location
}

# 9. Упаковать
Write-Host "[bundle] pack $BundleName.tar.gz"
Push-Location $BundleWork
try {
    & tar -czf "$RepoRoot\$BundleName.tar.gz" *
    if ($LASTEXITCODE -ne 0) { throw "tar failed" }
} finally {
    Pop-Location
}

$size = (Get-Item "$RepoRoot\$BundleName.tar.gz").Length
Write-Host "=== done: $BundleName.tar.gz ($([math]::Round($size/1MB,1)) MB) ==="
Write-Host "  install: tar -xzf $BundleName.tar.gz && ./scripts/install.sh"
Write-Host "  verify:  ./scripts/verify-bundle.sh"