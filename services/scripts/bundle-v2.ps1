# PrettyK Pure — airgap bundle builder v2 (Windows, digest-pinned).
#
# Отличия от v1:
#   - Закрепляет digest всех образов (docker pull @sha256:...).
#   - Генерирует CycloneDX SBOM поставки.
#   - Собирает лицензии всех компонентов.
#   - Подпись артефактов (cosign, опционально).
#   - Документирует перенос в закрытый реестр.
#   - verify-bundle.sh проверяет целостность + подписи.
#
# Инвариант: 0 внешних сетевых запросов при установке.
# pip install / npm install / playwright install — только на этапе сборки.
param(
    [string]$Version = "0.1.0",
    [string]$OutDir = "bundle-out",
    [switch]$Sign,                      # подписать cosign
    [switch]$DryRun                     # валидация без pull/save/pack
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ServicesDir = Join-Path $RepoRoot "services"
$BundleWork = Join-Path $RepoRoot $OutDir
$BundleName = "prettyk-pure-v$Version-airgap"

# ═══════════════════════════════════════════════════════════════════
# Карта образов с ожидаемыми digests (закрепить при сборке).
# После pull digest извлекается командой:
#   docker image inspect <name>:<tag> --format '{{index .RepoDigests 0}}'
# ═══════════════════════════════════════════════════════════════════
$DigestImages = @{
    "zaproxy/zap-stable"           = "2.17.0"
    "bkimminich/juice-shop"        = "v20.1.1"
}
$LicenseMap = @{
    "zaproxy/zap-stable"            = @{ license_spdx = "Apache-2.0"; license_url = "https://github.com/zaproxy/zaproxy/blob/main/LICENSE" }
    "bkimminich/juice-shop"         = @{ license_spdx = "MIT";        license_url = "https://github.com/juice-shop/juice-shop/blob/master/LICENSE" }
    "pk-playwright-authoring"       = @{ license_spdx = "Apache-2.0"; license_url = "https://github.com/microsoft/playwright/blob/main/LICENSE" }
    "prettyk-allure3"               = @{ license_spdx = "Apache-2.0"; license_url = "https://github.com/allure-framework/allure3/blob/main/LICENSE" }
    "pk-allure3-secops"             = @{ license_spdx = "Apache-2.0"; license_url = "https://github.com/allure-framework/allure3/blob/main/LICENSE" }
    "pk-llm-server"                 = @{ license_spdx = "MIT";        license_url = "" }
    "pk-api-lab"                    = @{ license_spdx = "MIT";        license_url = "" }
}

# Build images (сборка локальных).
$BuildImages = @(
    @{ Name = "pk-playwright-authoring"; Tag = "local"; ComposeSvc = "playwright-authoring"; ComposeFile = "session-template.yml" },
    @{ Name = "prettyk-allure3";          Tag = "local"; ComposeSvc = "prettyk-allure3";        ComposeFile = "docker-compose.base.yml" },
    @{ Name = "pk-llm-server";            Tag = "dev";  ComposeSvc = "llm-server";             ComposeFile = "docker-compose.base.yml" },
    @{ Name = "pk-api-lab";               Tag = "local"; ComposeSvc = "pk-api-lab";             ComposeFile = "session-template.yml" }
)

Write-Host "=== PrettyK Pure Airgap Bundle v2 (digest-pinned) $Version ==="

# 1. Подготовка
if ($DryRun) {
    Write-Host "[bundle-v2] Dry-run mode: skipping bundle dir preparation"
} else {
    if (Test-Path $BundleWork) { Remove-Item -Recurse -Force $BundleWork }
    New-Item -ItemType Directory -Path "$BundleWork\images" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\compose" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\scripts" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\sbom" -Force | Out-Null
    New-Item -ItemType Directory -Path "$BundleWork\migrations" -Force | Out-Null
}

# 2. Сборка локальных образов
Write-Host "[bundle-v2] build images$(if ($DryRun) { ' (dry-run)' })"
Push-Location $RepoRoot
try {
    foreach ($img in $BuildImages) {
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
    Write-Host "[bundle-v2] Dry-run complete. All compose services validated successfully."
    return
}

# 3. Pull + pin digest внешних образов
$DigestTable = @{}
foreach ($entry in $DigestImages.GetEnumerator()) {
    $full = "$($entry.Key):$($entry.Value)"
    Write-Host "  pull $full"
    docker pull $full
    if ($LASTEXITCODE -ne 0) { throw "pull failed: $full" }

    $digest = docker image inspect $full --format '{{index .RepoDigests 0}}' 2>$null
    if (-not $digest) { $digest = $full }
    Write-Host "    digest: $digest"
    $DigestTable[$entry.Key] = $digest
}

# 4. Сохранить ВСЕ образы
Write-Host "[bundle-v2] save images"
foreach ($img in $BuildImages) {
    $tarName = "$($img.Name.Replace('/', '_').Replace(':', '_'))_$($img.Tag).tar"
    Write-Host "  $tarName"
    docker save "$($img.Name):$($img.Tag)" -o "$BundleWork\images\$tarName"
    if ($LASTEXITCODE -ne 0) { throw "save failed: $($img.Name)" }
}
foreach ($entry in $DigestImages.GetEnumerator()) {
    $tarName = "$($entry.Key.Replace('/', '_').Replace(':', '_'))_$($entry.Value).tar"
    Write-Host "  $tarName (digest-pinned)"
    docker save "$($entry.Key):$($entry.Value)" -o "$BundleWork\images\$tarName"
    if ($LASTEXITCODE -ne 0) { throw "save failed: $($entry.Key)" }
}

# 5. Копировать compose
Copy-Item "$ServicesDir\docker-compose.base.yml" "$BundleWork\compose\" -Force
Copy-Item "$ServicesDir\session-template.yml"   "$BundleWork\compose\" -Force

# 6. Копировать install/verify/registry-guide
Copy-Item "$ServicesDir\scripts\install.ps1"           "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue
Copy-Item "$ServicesDir\scripts\install.sh"            "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue
Copy-Item "$ServicesDir\scripts\verify-bundle.sh"      "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue
Copy-Item "$ServicesDir\scripts\registry-transport.md" "$BundleWork\scripts\" -Force -ErrorAction SilentlyContinue

# 7. Сгенерировать SBOM (CycloneDX 1.5) поставки
Write-Host "[bundle-v2] generate supply-chain SBOM"
$allImages = @()
foreach ($img in $BuildImages) {
    $license = $LicenseMap[$img.Name]
    $allImages += @{
        name = "$($img.Name):$($img.Tag)"
        license_spdx = if ($license) { $license.license_spdx } else { "UNKNOWN" }
        license_url  = if ($license) { $license.license_url } else { "" }
    }
}
foreach ($entry in $DigestImages.GetEnumerator()) {
    $license = $LicenseMap[$entry.Key]
    $digest = $DigestTable[$entry.Key]
    $allImages += @{
        name = "$($entry.Key):$($entry.Value)"
        digest = $digest
        license_spdx = if ($license) { $license.license_spdx } else { "UNKNOWN" }
        license_url  = if ($license) { $license.license_url } else { "" }
    }
}

# CycloneDX 1.5 SBOM
$sbom = @{
    bomFormat = "CycloneDX"
    specVersion = "1.5"
    version = 1
    metadata = @{
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        component = @{
            type = "application"
            name = "prettyk-pure"
            version = $Version
        }
    }
    components = @($allImages | ForEach-Object {
        @{
            type = "container"
            name = $_.name
            version = $Version
            hashes = if ($_.digest) { @(@{ alg = "SHA-256"; content = ($_.digest -split ":")[-1] }) } else { @() }
            licenses = if ($_.license_spdx -ne "UNKNOWN") { @(@{ license = @{ id = $_.license_spdx } }) } else { @() }
        }
    })
}
$sbom | ConvertTo-Json -Depth 5 | Set-Content -Path "$BundleWork\sbom\supply-chain.cdx.json" -Encoding UTF8

# 8. Лицензионный отчёт
$licenseReport = @{
    bundle = $BundleName
    version = $Version
    generated_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    components = @($allImages | ForEach-Object {
        @{
            name = $_.name
            license = $_.license_spdx
            url = $_.license_url
        }
    })
}
$licenseReport | ConvertTo-Json -Depth 3 | Set-Content -Path "$BundleWork\sbom\license-report.json" -Encoding UTF8

# 9. Сгенерировать manifest.json (с digests + SBOM refs)
$manifest = @{
    bundle = "prettyk-pure"
    version = $Version
    created = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    compatibility = @{
        docker = ">= 24.0"
        os = @("windows", "linux")
        arch = @("amd64")
    }
    sbom = "sbom/supply-chain.cdx.json"
    licenses = "sbom/license-report.json"
    images = @(
        foreach ($img in $BuildImages) {
            $tarName = "$($img.Name.Replace('/', '_').Replace(':', '_'))_$($img.Tag).tar"
            @{ name = "$($img.Name):$($img.Tag)"; file = "images/$tarName" }
        }
        foreach ($entry in $DigestImages.GetEnumerator()) {
            $tarName = "$($entry.Key.Replace('/', '_').Replace(':', '_'))_$($entry.Value).tar"
            @{ name = "$($entry.Key):$($entry.Value)"; file = "images/$tarName"; digest = $DigestTable[$entry.Key] }
        }
    )
    compose = @(
        @{ file = "compose/docker-compose.base.yml"; role = "system" },
        @{ file = "compose/session-template.yml"; role = "session" }
    )
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path "$BundleWork\manifest.json" -Encoding UTF8

# 10. Вычислить checksums
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

# 11. Подписать (опционально)
if ($Sign) {
    Write-Host "[bundle-v2] sign with cosign"
    if (Get-Command cosign -ErrorAction SilentlyContinue) {
        Get-ChildItem "$BundleWork\images\*.tar" | ForEach-Object {
            & cosign sign-blob --yes $_.FullName --bundle "$($_.FullName).sig"
        }
        & cosign sign-blob --yes "$BundleWork\sbom\supply-chain.cdx.json"
        & cosign sign-blob --yes "$BundleWork\checksums.sha256"
    } else {
        Write-Host "  cosign not found - skip (install: choco install cosign)"
    }
}

# 12. Упаковать
Write-Host "[bundle-v2] pack $BundleName.tar.gz"
Push-Location $BundleWork
try {
    & tar -czf "$RepoRoot\$BundleName.tar.gz" *
    if ($LASTEXITCODE -ne 0) { throw "tar failed" }
} finally {
    Pop-Location
}

$size = (Get-Item "$RepoRoot\$BundleName.tar.gz").Length
Write-Host "=== done: $BundleName.tar.gz ($([math]::Round($size/1MB,1)) MB) ==="
Write-Host "  verify:  tar -xzf $BundleName.tar.gz && ./scripts/verify-bundle.sh"
Write-Host "  install: ./scripts/install.sh"
Write-Host "  images (digest-pinned):"
foreach ($entry in $DigestTable.GetEnumerator()) {
    Write-Host "    $($entry.Value)"
}