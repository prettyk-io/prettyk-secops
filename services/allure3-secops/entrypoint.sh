#!/bin/sh
set -eu
RESULTS="${ALLURE_RESULTS_DIR:-/app/allure-results}"
REPORT="${ALLURE_REPORT_DIR:-/app/default-reports}"
mkdir -p "$RESULTS" "$REPORT"
chown -R allure:allure "$RESULTS" "$REPORT" || true
# /app/brand is compose :ro mount — do not chown
exec gosu allure "$@"
