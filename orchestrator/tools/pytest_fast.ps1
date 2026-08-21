# QA-1: быстрый контур orchestrator (без heavy/lab).
# Usage (repo root):
#   .\orchestrator\tools\pytest_fast.ps1
#   .\orchestrator\tools\pytest_fast.ps1 orchestrator\tests\test_fuzz_df10.py
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $PytestArgs -or $PytestArgs.Count -eq 0) {
    $PytestArgs = @("orchestrator/tests")
}
Set-Location $root
py -3 -m pytest -m "not heavy" @PytestArgs --tb=short
exit $LASTEXITCODE
