# T-juice-IDE: validate-only на sanitized juice fixture (без ZAP).
# Из корня репо:
#   .\orchestrator\tools\validate_juice_acceptance.ps1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$py = Join-Path $root ".venv\Scripts\python.exe"
$main = Join-Path $root "orchestrator\main.py"
$fixture = Join-Path $root "docs\acceptance\fixtures\operator_juice_editor.sanitized.json"
if (-not (Test-Path $py)) { throw "Нет $py — создайте .venv" }
& $py $main --manifest $fixture --validate-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK: validate-only $fixture"
