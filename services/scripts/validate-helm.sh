#!/usr/bin/env bash
# PrettyK Helm — валидация чарта перед установкой.
#
# Запускать из корня репозитория или из services/:
#   ./services/scripts/validate-helm.sh
#
# Проверяет:
#   - helm lint (синтаксис, зависимости)
#   - helm template (рендер без ошибок)
#   - session-deployment template с явными values
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHART_ROOT="$(cd "$SCRIPT_DIR/../helm/prettyk" && pwd)"

echo "=== PrettyK Helm Chart Validation ==="

# 1. Lint
echo "[validate] helm lint"
helm lint "$CHART_ROOT"

# 2. Template — системный контур (default values)
echo "[validate] helm template test-system"
helm template test-system "$CHART_ROOT" \
  --set systemNamespace=prettyk-test \
  > /dev/null
echo "  system contour OK"

# 3. Template — сессия scanner
echo "[validate] helm template session-scanner"
helm template session-scanner "$CHART_ROOT" \
  --set sessionId=test-session \
  --set component=scanner \
  --set image.repository=zaproxy/zap-stable \
  --set image.tag=2.17.0 \
  --set containerPort=8080 \
  --set generation=1 \
  > /dev/null
echo "  session scanner OK"

# 4. Template — сессия browser
echo "[validate] helm template session-browser"
helm template session-browser "$CHART_ROOT" \
  --set sessionId=test-session \
  --set component=browser \
  --set image.repository=pk-playwright-authoring \
  --set image.tag=local \
  --set containerPort=9223 \
  --set generation=1 \
  > /dev/null
echo "  session browser OK"

# 5. Template — сессия target
echo "[validate] helm template session-target"
helm template session-target "$CHART_ROOT" \
  --set sessionId=test-session \
  --set component=target \
  --set image.repository=bkimminich/juice-shop \
  --set image.tag=v20.1.1 \
  --set containerPort=3000 \
  --set generation=1 \
  > /dev/null
echo "  session target OK"

# 6. Upgrade simulation (не рвёт живые сессии — проверка dry-run)
echo "[validate] helm upgrade dry-run"
helm upgrade --install test-system "$CHART_ROOT" \
  --dry-run \
  --set systemNamespace=prettyk-test \
  --create-namespace \
  > /dev/null
echo "  upgrade dry-run OK"

echo "=== validation OK ==="