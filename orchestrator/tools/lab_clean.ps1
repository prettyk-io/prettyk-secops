#Requires -Version 5.1
<#
.SYNOPSIS
  Локальная чистка артефактов и Juice Shop стенда (lab only, не prod).

.DESCRIPTION
  allure-light-secops: HTTP /clean-results (+ опц. пустой generate) и wipe
  reports/allure-results + reports/allure-report.
  Токены Target: allure | allure-light-secops (синонимы).
  Live: diary.ndjson + meta.json + results_hooks.json + run_ui_summary/trend (idle не гасим).
  Dojo: только подсказка; ядерный сброс томов — отдельно.
  Juice: recreate контейнера без volume (только по явной просьбе).

.EXAMPLE
  .\orchestrator\tools\lab_clean.ps1 -Target allure
  .\orchestrator\tools\lab_clean.ps1 -Target allure-light-secops,live
  .\orchestrator\tools\lab_clean.ps1 -Target allure,live
  .\orchestrator\tools\lab_clean.ps1 -Target juice
  .\orchestrator\tools\lab_clean.ps1 -Target all
#>
param(
    [string[]]$Target = @('allure'),
    [string]$AllureBase = 'http://127.0.0.1:5050',
    [string]$ProjectId = 'default',
    [switch]$RegenerateEmpty
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $RepoRoot

# -Target allure,live или -Target "allure,live" — оба ок
# allure-light-secops = alias токена allure (имя сервиса)
$rawTargets = foreach ($t in $Target) {
    foreach ($part in ($t -split ',')) {
        $norm = $part.Trim().ToLowerInvariant()
        if ($norm -eq 'allure-light-secops' -or $norm -eq 'allure_light_secops') {
            'allure'
        }
        else {
            $norm
        }
    }
}
$allowed = @('allure', 'live', 'dojo', 'juice', 'all')
foreach ($t in $rawTargets) {
    if ($t -and $t -notin $allowed) {
        throw "Unknown Target '$t'. Use: allure|allure-light-secops, live, dojo, juice, all"
    }
}
$want = [System.Collections.Generic.HashSet[string]]::new([string[]]$rawTargets)
if ($want.Contains('all')) {
    $want.Clear()
    [void]$want.Add('allure')
    [void]$want.Add('live')
    [void]$want.Add('dojo')
}

function Invoke-AllureClean {
    $cleanUrl = "$AllureBase/clean-results?project_id=$ProjectId"
    Write-Host "allure-light-secops clean-results → $cleanUrl"
    $body = curl.exe -fsS $cleanUrl
    Write-Host $body

    $resultsHost = Join-Path $RepoRoot 'reports\allure-results'
    if (Test-Path $resultsHost) {
        Get-ChildItem -Force $resultsHost | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "host wipe: $resultsHost"
    }

    $reportHost = Join-Path $RepoRoot 'reports\allure-report'
    if (Test-Path $reportHost) {
        Get-ChildItem -Force $reportHost | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "report/history wipe: $reportHost"
    }

    if ($RegenerateEmpty) {
        $genUrl = "$AllureBase/generate-report?project_id=$ProjectId"
        Write-Host "allure-light-secops generate (empty) → $genUrl"
        curl.exe -fsS $genUrl | Write-Host
    }
}

function Set-LiveFileContent {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
    )
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            Set-Content -Path $Path -Value $Value -Encoding utf8 -ErrorAction Stop
            return
        }
        catch [System.IO.IOException] {
            if ($attempt -eq 10) { throw }
            Start-Sleep -Milliseconds 150
        }
    }
}

function Invoke-LiveClean {
    $liveDir = Join-Path $RepoRoot 'reports\live'
    New-Item -ItemType Directory -Force -Path $liveDir | Out-Null
    $diary = Join-Path $liveDir 'diary.ndjson'
    $meta = Join-Path $liveDir 'meta.json'
    $hooks = Join-Path $liveDir 'results_hooks.json'
    $uiSummary = Join-Path $liveDir 'run_ui_summary.json'
    $trend = Join-Path $liveDir 'severity_trend.ndjson'
    $evidence = Join-Path $liveDir 'check_evidence_refs.json'
    $runSummary = Join-Path $liveDir 'run_summary.json'
    Set-LiveFileContent -Path $diary -Value ''
    $idleMeta = @{
        session_name = 'idle'
        novnc_url    = 'http://127.0.0.1:7900/?autoconnect=1&resize=scale'
        status       = 'waiting'
        live_url     = 'http://127.0.0.1:8767/'
    } | ConvertTo-Json -Compress
    Set-LiveFileContent -Path $meta -Value $idleMeta
    Set-LiveFileContent -Path $hooks -Value '{"allure":null,"dojo":null,"zap":null}'
    if (Test-Path $uiSummary) { Remove-Item -Force $uiSummary -ErrorAction SilentlyContinue }
    if (Test-Path $trend) { Remove-Item -Force $trend -ErrorAction SilentlyContinue }
    if (Test-Path $evidence) { Remove-Item -Force $evidence -ErrorAction SilentlyContinue }
    if (Test-Path $runSummary) { Remove-Item -Force $runSummary -ErrorAction SilentlyContinue }
    Write-Host "Live diary/meta/hooks/summary/evidence wiped: $liveDir (idle process not killed)"
}

function Invoke-JuiceClean {
    Write-Host @"
Juice Shop (lab): контейнер будет пересоздан.
Achievements и локальное состояние цели сбросятся. Не запускайте во время активного прогона.
"@
    docker compose -f services\docker-compose.target.yml up -d --force-recreate juice-shop
    if ($LASTEXITCODE -ne 0) {
        throw "Juice Shop recreate failed (exit $LASTEXITCODE)"
    }
    Write-Host "Juice Shop recreated: achievements/state reset (lab target without volumes)."
}

function Show-DojoCleanHint {
    Write-Host @"
DefectDojo (lab): HTTP bulk-clean в репо нет — только локальный ручной сброс.
  UI: http://127.0.0.1:8081/  admin/admin — удалить Findings/Engagements в продукте.
  Ядерно (сотрёт БД Dojo): docker compose -f services\docker-compose.defectdojo.yml down -v
  ZAP XML на диске (reports/scanner-results/) — отдельно, не трогаем здесь.
"@
}

if ($want.Contains('allure')) { Invoke-AllureClean }
if ($want.Contains('live')) { Invoke-LiveClean }
if ($want.Contains('dojo')) { Show-DojoCleanHint }
if ($want.Contains('juice')) { Invoke-JuiceClean }

Write-Host 'lab_clean done.'
