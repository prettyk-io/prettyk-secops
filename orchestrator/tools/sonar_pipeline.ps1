#Requires -Version 5.1
<#
.SYNOPSIS
  SonarQube full pipeline — backend + frontend with OOM protection.

.DESCRIPTION
  Single entry point for SonarQube analysis. Handles Docker lifecycle,
  coverage stubs, scanner execution with memory limits, and report generation.

  Protections against 2026-08-28 OOM collapse:
    - WSL2: 16GB (in .wslconfig)
    - SonarQube CE: 4GB mem_limit
    - Python scanner: 2GB --memory
    - TypeScript scanner: 4GB --memory
    - Pre-flight: checks host free RAM (min 4GB)
    - Cooldown between backend and frontend scans
    - Cleans orphan scanner containers from previous runs

  Token: squ_752b04a6a1d45a6c29a3b6fe291a3b12d5dddba9 (hardcoded, dev only).

.EXAMPLE
  .\orchestrator\tools\sonar_pipeline.ps1
#>
param(
    [switch]$SkipPreflight
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$TOKEN = 'squ_752b04a6a1d45a6c29a3b6fe291a3b12d5dddba9'
$HQ = 'http://sonarqube:9000'
$REPORT_DIR = Join-Path $root 'reports'
$TIMESTAMP = Get-Date -Format 'yyyy-MM-dd_HHmm'

# ── Helper ───────────────────────────────────────────────────────
function Get-Measure($data, $key) {
    if (-not $data) { return '?' }
    foreach ($m in $data.measures) { if ($m.metric -eq $key) { return $m.value } }
    return '?'
}

# ═══════════════════════════════════════════════════════════════════
# 0. Pre-flight
# ═══════════════════════════════════════════════════════════════════
Write-Host '[0/7] Pre-flight' -ForegroundColor Cyan

$os = Get-WmiObject Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
Write-Host "  RAM: $freeGB GB free / $totalGB GB total"

if (-not $SkipPreflight) {
    if ($freeGB -lt 4) {
        throw "FREE RAM CRITICAL: $freeGB GB. SonarQube needs ~6GB in WSL2 + host overhead. Close heavy apps or set WSL2 memory to 16GB in .wslconfig"
    }
    if ($freeGB -lt 8) {
        Write-Host '  WARNING: less than 8GB free, scans may be slow' -ForegroundColor Yellow
    }
}
Write-Host '  pre-flight OK' -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════
# 1. Docker
# ═══════════════════════════════════════════════════════════════════
Write-Host '[1/7] Docker' -ForegroundColor Cyan
$ok = $false
for ($n = 0; $n -lt 5; $n++) {
    $r = & docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Start-Sleep 8
}
if (-not $ok) {
    Write-Host '  starting Docker Desktop...' -ForegroundColor Yellow
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden 2>$null
    for ($n = 0; $n -lt 20; $n++) {
        Start-Sleep 6
        $r = & docker info --format '{{.ServerVersion}}' 2>$null
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    }
    if (-not $ok) { throw 'Docker engine did not start' }
}
$dockerVersion = & docker info --format '{{.ServerVersion}}' 2>$null
Write-Host "  Docker $dockerVersion OK" -ForegroundColor Green

# Clean orphan scanner containers
Write-Host '  cleaning orphan scanner containers...' -ForegroundColor DarkGray
$orphans = docker ps -a --filter ancestor=sonarsource/sonar-scanner-cli:latest --format '{{.ID}}' 2>$null
if ($orphans) {
    foreach ($id in ($orphans -split '\n')) { if ($id) { docker rm -f $id 2>$null } }
    Write-Host '    removed orphans' -ForegroundColor DarkGray
}

# ═══════════════════════════════════════════════════════════════════
# 2. Coverage stubs
# ═══════════════════════════════════════════════════════════════════
Write-Host '[2/7] Coverage stubs' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$root/reports" | Out-Null
New-Item -ItemType Directory -Force -Path "$root/frontend/coverage" | Out-Null
'<?xml version="1.0" encoding="UTF-8"?><coverage version="1"/>' | Out-File -Encoding utf8 -FilePath "$root/reports/coverage-backend.xml" -NoNewline
'<?xml version="1.0"?><testsuite name="stub" tests="0"/>' | Out-File -Encoding utf8 -FilePath "$root/reports/sonar-no-xunit.xml" -NoNewline
'TN:' | Out-File -Encoding ascii -FilePath "$root/frontend/coverage/lcov.info"
Write-Host '  ready' -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════
# 3. SonarQube
# ═══════════════════════════════════════════════════════════════════
Write-Host '[3/7] SonarQube' -ForegroundColor Cyan
$net = docker network inspect pk-net --format '{{.Name}}' 2>$null
if (-not $net) { docker network create pk-net 2>$null | Out-Null; Write-Host '  network pk-net created' }

docker compose -f "$root/services/docker-compose.sonarqube.yml" up -d 2>&1 | Out-Null
$up = $false
for ($n = 0; $n -lt 30; $n++) {
    Start-Sleep 5
    try {
        $r = curl.exe -fsS --max-time 5 'http://127.0.0.1:9000/api/system/status' 2>$null
        if ($r -match 'UP') { $up = $true; break }
    } catch {}
    Write-Host -NoNewline '.'
}
Write-Host ''
if (-not $up) { throw 'SonarQube did not reach UP within 150s' }
Write-Host '  SonarQube UP' -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════
# 4. Backend scan (Python, ~2-3 min)
# ═══════════════════════════════════════════════════════════════════
Write-Host '[4/7] Backend scan (Python)' -ForegroundColor Cyan

$beLog = "$REPORT_DIR\sonar-be-$TIMESTAMP.log"
$beArgs = @('run','--rm','--memory=2g','--memory-swap=2g','--network','pk-net','-e',"SONAR_TOKEN=$TOKEN",'-v',"${root}:/usr/src",'-w','/usr/src','sonarsource/sonar-scanner-cli:latest','sonar-scanner','-Dproject.settings=sonar-project.backend.properties',"-Dsonar.host.url=$HQ","-Dsonar.token=$TOKEN")
$beProc = Start-Process -FilePath 'docker' -ArgumentList $beArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $beLog -RedirectStandardError "$REPORT_DIR\sonar-be-err-$TIMESTAMP.log"
$beCode = $beProc.ExitCode
if ($beCode -eq 0 -or $beCode -eq $null) { Write-Host "  Backend OK" -ForegroundColor Green } else { Write-Host "  Backend exit=$beCode (see log)" -ForegroundColor Yellow }

# ═══════════════════════════════════════════════════════════════════
# 5. Cooldown
# ═══════════════════════════════════════════════════════════════════
Write-Host '[5/7] Cooldown — waiting Qube to process backend' -ForegroundColor Cyan
for ($n = 0; $n -lt 12; $n++) {
    Start-Sleep 5
    try {
        $r = curl.exe -sS --max-time 5 "http://127.0.0.1:9000/api/system/status" -u "${TOKEN}:" 2>$null
        if ($r -match 'UP') { Write-Host '  Qube responsive' -ForegroundColor Green; break }
    } catch {}
    Write-Host -NoNewline '.'
}
Write-Host ''

# ═══════════════════════════════════════════════════════════════════
# 6. Frontend scan (TypeScript, ~5-15 min)
# ═══════════════════════════════════════════════════════════════════
Write-Host '[6/7] Frontend scan (TypeScript)' -ForegroundColor Cyan
Write-Host '  TS sensor with embedded Node.js — ETA 5-15 min' -ForegroundColor DarkGray

$feLog = "$REPORT_DIR\sonar-fe-$TIMESTAMP.log"
$feArgs = @('run','--rm','--memory=6g','--memory-swap=6g','--network','pk-net','-e',"SONAR_TOKEN=$TOKEN",'-v',"${root}:/usr/src",'-w','/usr/src','sonarsource/sonar-scanner-cli:latest','sonar-scanner','-Dproject.settings=sonar-project.frontend.properties',"-Dsonar.host.url=$HQ","-Dsonar.token=$TOKEN")
$feProc = Start-Process -FilePath 'docker' -ArgumentList $feArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $feLog -RedirectStandardError "$REPORT_DIR\sonar-fe-err-$TIMESTAMP.log"
$feCode = $feProc.ExitCode
if ($feCode -eq 0 -or $feCode -eq $null) { Write-Host "  Frontend OK" -ForegroundColor Green } else { Write-Host "  Frontend exit=$feCode (see log)" -ForegroundColor Yellow }

# ═══════════════════════════════════════════════════════════════════
# 7. Results + report
# ═══════════════════════════════════════════════════════════════════
Write-Host '[7/7] Results' -ForegroundColor Cyan

$metrics = 'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating,sqale_index'

$beJson = $null; $feJson = $null
try { $beJson = curl.exe -sS --max-time 15 "http://127.0.0.1:9000/api/measures/component?component=prettyk-backend&metricKeys=$metrics" -u "${TOKEN}:" 2>$null | ConvertFrom-Json } catch {}
try { $feJson = curl.exe -sS --max-time 15 "http://127.0.0.1:9000/api/measures/component?component=prettyk-frontend&metricKeys=$metrics" -u "${TOKEN}:" 2>$null | ConvertFrom-Json } catch {}
try { $sqStatus = curl.exe -sS --max-time 5 'http://127.0.0.1:9000/api/system/status' -u "${TOKEN}:" 2>$null } catch { $sqStatus = '' }
$sqV = '?'
if ($sqStatus -match '.*version.*') { $sqV = $sqStatus }

$reportPath = "$REPORT_DIR\sonar-report-$TIMESTAMP.md"
$dateStr = Get-Date -Format 'yyyy-MM-dd HH:mm'

$be = $beJson.component
$fe = $feJson.component

$lines = @()
$lines += '# SonarQube Report — PrettyK'
$lines += ''
$lines += "Date: $dateStr | Pipeline: sonar_pipeline.ps1 | Server: $sqV"
$lines += ''
$lines += '---'
$lines += ''
$lines += '## Backend (Python, orchestrator/)'
$lines += ''

if ($be) {
    $lines += '| Metric | Value | Rating |'
    $lines += '|---|---|---|'
    $lines += "| Lines (ncloc) | $(Get-Measure $be 'ncloc') | - |"
    $lines += "| Bugs | $(Get-Measure $be 'bugs') | Reliability **$(Get-Measure $be 'reliability_rating')** |"
    $lines += "| Vulnerabilities | $(Get-Measure $be 'vulnerabilities') | Security **$(Get-Measure $be 'security_rating')** |"
    $lines += "| Code smells | $(Get-Measure $be 'code_smells') | Maintainability **$(Get-Measure $be 'sqale_rating')** |"
    $lines += "| Duplications | $(Get-Measure $be 'duplicated_lines_density')% | - |"
    $lines += "| Coverage | $(Get-Measure $be 'coverage')% (stub) | - |"
} else { $lines += 'Backend scan not found' }

$lines += ''
$lines += '---'
$lines += ''
$lines += '## Frontend (TypeScript/React, frontend/src/)'
$lines += ''

if ($fe) {
    $lines += '| Metric | Value | Rating |'
    $lines += '|---|---|---|'
    $lines += "| Lines (ncloc) | $(Get-Measure $fe 'ncloc') | - |"
    $lines += "| Bugs | $(Get-Measure $fe 'bugs') | Reliability **$(Get-Measure $fe 'reliability_rating')** |"
    $lines += "| Vulnerabilities | $(Get-Measure $fe 'vulnerabilities') | Security **$(Get-Measure $fe 'security_rating')** |"
    $lines += "| Code smells | $(Get-Measure $fe 'code_smells') | Maintainability **$(Get-Measure $fe 'sqale_rating')** |"
    $lines += "| Duplications | $(Get-Measure $fe 'duplicated_lines_density')% | - |"
    $lines += "| Coverage | $(Get-Measure $fe 'coverage')% (stub) | - |"
} else { $lines += 'Frontend scan not found' }

$lines += ''
$lines += '---'
$lines += ''
$lines += '## Resource Limits'
$lines += ''
$lines += '| Component | Limit | Reason |'
$lines += '|---|---|---|'
$lines += '| SonarQube CE | 4096 MB (mem_limit) | WSL2 16GB |'
$lines += '| Python scanner | 2048 MB | 459 files |'
$lines += '| TypeScript scanner | 4096 MB | 989 files + Node.js + Monaco |'
$lines += ''
$lines += '## Dashboards'
$lines += ''
$lines += '- http://127.0.0.1:9000/dashboard?id=prettyk-backend'
$lines += '- http://127.0.0.1:9000/dashboard?id=prettyk-frontend'
$lines += ''
$lines += '## Logs'
$lines += ''
$lines += "- $beLog"
$lines += "- $feLog"

$lines -join "`n" | Set-Content -Path $reportPath -Encoding UTF8

Write-Host ''
Write-Host '=== PIPELINE DONE ===' -ForegroundColor Green
Write-Host "  Report: $reportPath" -ForegroundColor Magenta
Write-Host '  Backend:  http://127.0.0.1:9000/dashboard?id=prettyk-backend'
Write-Host '  Frontend: http://127.0.0.1:9000/dashboard?id=prettyk-frontend'