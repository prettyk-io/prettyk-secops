#Requires -Version 5.1
<#
.SYNOPSIS
  Run sonar-scanner for backend and/or frontend (separate projectKey).

.DESCRIPTION
  Server: docker compose -f services/docker-compose.sonarqube.yml (:9000).
  Scanner: sonarsource/sonar-scanner-cli on prettyk-net.
  Token: $env:SONAR_TOKEN required. See docs/sonar-lab.md and sonar-access.md.

.EXAMPLE
  $env:SONAR_TOKEN = 'squ_...'
  .\orchestrator\tools\sonar_scan.ps1 -Target backend

.EXAMPLE
  .\orchestrator\tools\sonar_scan.ps1 -Target frontend

.EXAMPLE
  .\orchestrator\tools\sonar_scan.ps1 -Target both
#>
param(
    [ValidateSet('backend', 'frontend', 'both', 'all')]
    [string]$Target = 'both',
    [string]$SonarHostUrl = 'http://sonarqube:9000',
    # MC-2: before scan ensure coverage XML/LCOV (zero default; -CoverageLive = pytest-cov sample)
    [switch]$CoverageLive
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

if (-not $env:SONAR_TOKEN -or -not $env:SONAR_TOKEN.Trim()) {
    throw @"
SONAR_TOKEN is empty.
1) Open http://127.0.0.1:9000/ (admin credentials in sonar-access.md)
2) My Account -> Security -> Generate Tokens
3) `$env:SONAR_TOKEN = 'squ_...'
"@
}

function Test-SonarUp {
    $r = curl.exe -fsS --max-time 5 'http://127.0.0.1:9000/api/system/status' 2>$null
    return ($LASTEXITCODE -eq 0 -and $r -match '"status":"UP"')
}

if (-not (Test-SonarUp)) {
    throw 'SonarQube is not UP at http://127.0.0.1:9000/ - run: docker compose -f services/docker-compose.sonarqube.yml up -d'
}

$targets = @()
switch ($Target) {
    'backend' { $targets = @('backend') }
    'frontend' { $targets = @('frontend') }
    default { $targets = @('backend', 'frontend') }
}

Push-Location $RepoRoot
try {
    $prepArgs = @()
    if ($CoverageLive) { $prepArgs += '--live' }
    Write-Host "MC-2 sonar_coverage_prep $($prepArgs -join ' ')"
    & py -3 (Join-Path $PSScriptRoot 'sonar_coverage_prep.py') @prepArgs
    if ($LASTEXITCODE -ne 0) {
        throw "sonar_coverage_prep failed (exit $LASTEXITCODE)"
    }

    foreach ($t in $targets) {
        $props = if ($t -eq 'backend') {
            'sonar-project.backend.properties'
        } else {
            'sonar-project.frontend.properties'
        }
        if (-not (Test-Path $props)) {
            throw "Missing properties file: $props"
        }
        Write-Host "START sonar-scan $t ($props) -> $SonarHostUrl"
        # Quote -D* so PowerShell does not eat -Dproject as a switch.
        $scannerArgs = @(
            "-Dproject.settings=$props",
            "-Dsonar.host.url=$SonarHostUrl",
            "-Dsonar.token=$env:SONAR_TOKEN"
        )
        docker run --rm `
            --network prettyk-net `
            -e "SONAR_TOKEN=$env:SONAR_TOKEN" `
            -v "${RepoRoot}:/usr/src" `
            -w /usr/src `
            sonarsource/sonar-scanner-cli:latest `
            @scannerArgs
        if ($LASTEXITCODE -ne 0) {
            throw "sonar-scanner failed for $t (exit $LASTEXITCODE)"
        }
        Write-Host "OK sonar-scan $t"
    }
} finally {
    Pop-Location
}

Write-Host 'sonar_scan OK'
Write-Host 'backend UI:  http://127.0.0.1:9000/dashboard?id=prettyk-backend'
Write-Host 'frontend UI: http://127.0.0.1:9000/dashboard?id=prettyk-frontend'
