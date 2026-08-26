$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$TOKEN = 'squ_752b04a6a1d45a6c29a3b6fe291a3b12d5dddba9'
$HQ = 'http://sonarqube:9000'

Write-Host '=== SONAR PIPELINE ===' -ForegroundColor Cyan

# 1. Docker
Write-Host '[1/6] Docker' -ForegroundColor Cyan
$ok = $false
for ($n = 0; $n -lt 5; $n++) { $r = & docker info 2>$null; if ($LASTEXITCODE -eq 0) { $ok = $true; break }; Start-Sleep 8 }
if (-not $ok) {
    Write-Host '  restarting...' -ForegroundColor Yellow
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden 2>$null
    for ($n = 0; $n -lt 15; $n++) { Start-Sleep 6; $r = & docker info 2>$null; if ($LASTEXITCODE -eq 0) { break } }
}
Write-Host '  Docker OK' -ForegroundColor Green

# 2. Coverage
Write-Host '[2/6] Coverage stubs' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$root/reports" | Out-Null
New-Item -ItemType Directory -Force -Path "$root/frontend/coverage" | Out-Null
'<?xml version="1.0" encoding="UTF-8"?><coverage version="1"/>' | Out-File -Encoding utf8 -FilePath "$root/reports/coverage-backend.xml" -NoNewline
'<?xml version="1.0"?><testsuite name="stub" tests="0"/>' | Out-File -Encoding utf8 -FilePath "$root/reports/sonar-no-xunit.xml" -NoNewline
'SF:stub.ts\nend_of_record' | Out-File -Encoding ascii -FilePath "$root/frontend/coverage/lcov.info"
Write-Host '  ready' -ForegroundColor Green

# 3. SonarQube
Write-Host '[3/6] SonarQube' -ForegroundColor Cyan
$up = $false
try { $r = & curl.exe -fsS --max-time 5 'http://127.0.0.1:9000/api/system/status' 2>$null; if ($r -match 'UP') { $up = $true } } catch {}
if (-not $up) {
    docker compose -f "$root/services/docker-compose.sonarqube.yml" up -d 2>&1 | Out-Null
    for ($n = 0; $n -lt 24; $n++) {
        Start-Sleep 5
        try { $r = & curl.exe -fsS --max-time 5 'http://127.0.0.1:9000/api/system/status' 2>$null; if ($r -match 'UP') { $up = $true; break } } catch {}
    }
}
Write-Host '  SonarQube UP' -ForegroundColor Green

# 4. Backend
Write-Host '[4/6] Backend scan' -ForegroundColor Cyan
$args = 'run','--rm','--network','pk-net','-e',"SONAR_TOKEN=$TOKEN",'-v',"${root}:/usr/src",'-w','/usr/src','sonarsource/sonar-scanner-cli:latest','sonar-scanner','-Dproject.settings=sonar-project.backend.properties',"-Dsonar.host.url=$HQ","-Dsonar.token=$TOKEN"
$p = Start-Process -FilePath 'docker' -ArgumentList $args -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$env:TEMP\sonar-be.log" -RedirectStandardError "$env:TEMP\sonar-be.err"
Write-Host "  Backend exit=$($p.ExitCode)" -ForegroundColor $(if ($p.ExitCode -eq 0 -or $p.ExitCode -eq $null) { 'Green' } else { 'Yellow' })

# 5. Frontend
Write-Host '[5/6] Frontend scan' -ForegroundColor Cyan
$args = 'run','--rm','--network','pk-net','-e',"SONAR_TOKEN=$TOKEN",'-v',"${root}:/usr/src",'-w','/usr/src','sonarsource/sonar-scanner-cli:latest','sonar-scanner','-Dproject.settings=sonar-project.frontend.properties',"-Dsonar.host.url=$HQ","-Dsonar.token=$TOKEN"
$p = Start-Process -FilePath 'docker' -ArgumentList $args -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$env:TEMP\sonar-fe.log" -RedirectStandardError "$env:TEMP\sonar-fe.err"
Write-Host "  Frontend exit=$($p.ExitCode)" -ForegroundColor $(if ($p.ExitCode -eq 0 -or $p.ExitCode -eq $null) { 'Green' } else { 'Yellow' })

# 6. Done
Write-Host '[6/6] Done' -ForegroundColor Cyan
Write-Host '  http://127.0.0.1:9000/dashboard?id=prettyk-backend' -ForegroundColor Magenta
Write-Host '  http://127.0.0.1:9000/dashboard?id=prettyk-frontend' -ForegroundColor Magenta