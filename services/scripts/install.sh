#!/usr/bin/env bash
# PrettyK Pure — airgap installer (Linux).
#
# На чистой airgap-машине (без интернета):
#   1. tar -xzf prettyk-pure-vX.Y.Z-airgap.tar.gz
#   2. ./scripts/install.sh
#
# Инвариант: 0 внешних сетевых запросов.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="${1:-$BUNDLE_ROOT/prettyk-data}"

echo "=== PrettyK Pure Airgap Install ==="

# 1. Проверить Docker
if ! docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
    echo "ERROR: Docker Engine not available. Install Docker first."
    exit 1
fi
echo "Docker $(docker version --format '{{.Server.Version}}') OK"

# 2. Загрузить образы
echo "[install] load images"
for img in "$BUNDLE_ROOT"/images/*.tar; do
    echo "  $(basename "$img")"
    docker load -i "$img"
done

# 3. Создать data-директории
echo "[install] init data dirs"
mkdir -p "$DATA_DIR/reports/allure-results"
mkdir -p "$DATA_DIR/reports/allure3-report"
mkdir -p "$DATA_DIR/reports/live"
mkdir -p "$DATA_DIR/reports/runs"
mkdir -p "$DATA_DIR/zap/plugins"

# 4. Создать сеть
echo "[install] create network pk-net"
docker network create pk-net 2>/dev/null || echo "  network may already exist (ok)"

# 5. Стартовать системный контур
echo "[install] start system services (base)"
docker compose -f "$BUNDLE_ROOT/compose/docker-compose.base.yml" up -d --no-build

echo "=== install OK ==="
echo "  Allure:    http://127.0.0.1:5050/"
echo "  Session:   docker compose -f compose/session-template.yml -p pk-session-dev up -d"