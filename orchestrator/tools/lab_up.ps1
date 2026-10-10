#Requires -Version 5.1
<#
.SYNOPSIS
  Поднимает полный локальный lab-контур без очистки данных.

.DESCRIPTION
  Обязательный контур: allure3-secops (:5050, канон), scanner,
  Juice Shop, pk-api-lab (REST/GraphQL/gRPC), Editor, playground и idle PrettyK Live.
  RUNTIME-UN-CUTOVER-GRID-WEBM: Selenium Grid (hub :4444, chrome noVNC :7900,
  firefox noVNC :7901, chrome-video) — боевой рантайм прогонов.
  Webswing намеренно не запускается (см. global skill `prettyk-lab`).
  DefectDojo — по умолчанию (обязательная зависимость, restart: unless-stopped).
  SonarQube — только -IncludeSonarQube.
  Чистку не делает: перед чистым прогоном lab_clean.ps1 -Target allure,live.

.EXAMPLE
  .\orchestrator\tools\lab_up.ps1

.EXAMPLE
  .\orchestrator\tools\lab_up.ps1 -IncludeSonarQube
#>
param(
    [switch]$IncludeSonarQube
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$VenvPython = Join-Path $RepoRoot '.venv\Scripts\python.exe'

function Test-PortListen {
    param([Parameter(Mandatory = $true)][int]$Port)
    return [bool](netstat -ano | findstr /C:":$Port" | findstr /C:"LISTENING")
}

function Test-DockerEngine {
    # LIVE-MONITOR-REVIVE: без капкана EAP=Stop на native stderr - иначе
    # недоступный engine роняет lab_up до Ensure-DockerEngine вместо честного
    # автоподъёма Docker Desktop.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & docker.exe info --format '{{.ServerVersion}}' 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Ensure-DockerEngine {
    if (Test-DockerEngine) {
        Write-Host 'OK Docker engine'
        return
    }

    $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $dockerDesktop)) {
        throw "Docker engine is unavailable and Docker Desktop was not found: $dockerDesktop"
    }

    Write-Host 'START Docker Desktop'
    Start-Process -FilePath $dockerDesktop
    $deadline = (Get-Date).AddMinutes(2)
    do {
        Start-Sleep -Seconds 2
        if (Test-DockerEngine) {
            Write-Host 'OK Docker engine'
            return
        }
    } while ((Get-Date) -lt $deadline)

    throw 'Docker Desktop did not start its engine within 2 minutes'
}

function Start-Compose {
    param([Parameter(Mandatory = $true)][string]$File)
    Write-Host "START compose: $File"
    Push-Location $RepoRoot
    try {
        $ErrorActionPreference = 'Continue'
        docker compose -f $File up -d 2>$null | Out-Null
        $ErrorActionPreference = 'Stop'
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose failed: $File (exit $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
}

function Test-Http {
    param([Parameter(Mandatory = $true)][string]$Url)
    $ErrorActionPreference = 'Continue'
    & curl.exe -fsS --max-time 8 $Url 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'
    return $LASTEXITCODE -eq 0
}

function Wait-Http {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 60
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-Http $Url) {
            Write-Host "OK $Name $Url"
            return
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "$Name did not respond within $TimeoutSeconds seconds: $Url"
}

function Ensure-LiveIdle {
    $liveUrl = 'http://127.0.0.1:8767/api/meta'
    if (-not (Test-PortListen 8767)) {
        if (-not (Test-Path $VenvPython)) {
            throw "Python venv was not found: $VenvPython"
        }
        Write-Host 'START PrettyK Live idle :8767'
        Start-Process -FilePath $VenvPython `
            -ArgumentList @((Join-Path $RepoRoot 'orchestrator\tools\run_live_idle.py')) `
            -WorkingDirectory (Join-Path $RepoRoot 'orchestrator') `
            -WindowStyle Hidden
    }
    Wait-Http -Name 'PrettyK Live' -Url $liveUrl
}

Ensure-DockerEngine
Start-Compose 'services\docker-compose.base.yml'
Start-Compose 'services\docker-compose.zap.yml'
Start-Compose 'services\docker-compose.target.yml'
Start-Compose 'services\docker-compose.grid.yml'
$hasApiLab = Test-Path (Join-Path $RepoRoot 'services\pk-api-lab\Dockerfile')
if ($hasApiLab) {
    Start-Compose 'services\docker-compose.api-lab.yml'
}
Start-Compose 'services\docker-compose.defectdojo.yml'
if ($IncludeSonarQube) {
    Start-Compose 'services\docker-compose.sonarqube.yml'
}

& (Join-Path $RepoRoot 'orchestrator\tools\lab_ensure_ui.ps1') -StartIfDown
if ($LASTEXITCODE -ne 0) {
    throw "Editor/playground readiness failed (exit $LASTEXITCODE)"
}

Ensure-LiveIdle
Wait-Http -Name 'Allure' -Url 'http://127.0.0.1:5050/health'
Wait-Http -Name 'scanner daemon' -Url 'http://127.0.0.1:8080/JSON/core/view/version/' -TimeoutSeconds 240
Wait-Http -Name 'Juice Shop' -Url 'http://127.0.0.1:3000/'
# RUNTIME-UN-CUTOVER-GRID-WEBM: боевой рантайм — Selenium Grid (hub + noVNC).
Wait-Http -Name 'Selenium Grid hub' -Url 'http://127.0.0.1:4444/status' -TimeoutSeconds 120
Wait-Http -Name 'Selenium chrome noVNC' -Url 'http://127.0.0.1:7900/' -TimeoutSeconds 120
Wait-Http -Name 'Selenium firefox noVNC' -Url 'http://127.0.0.1:7901/' -TimeoutSeconds 120
if ($hasApiLab) {
    Wait-Http -Name 'pk-api-lab' -Url 'http://127.0.0.1:8090/health' -TimeoutSeconds 120
}
Wait-Http -Name 'DefectDojo' -Url 'http://127.0.0.1:8081/' -TimeoutSeconds 120
if ($IncludeSonarQube) {
    Wait-Http -Name 'SonarQube' -Url 'http://127.0.0.1:9000/api/system/status' -TimeoutSeconds 300
}

Write-Host 'lab_up OK (no cleanup, no Webswing)'
