#!/usr/bin/env bash
# PW-C2: Airgap bundle — один образ Playwright (браузеры + либы + ffmpeg).
#
# Собирает самодостаточный архив для чистого офлайн-хоста:
#   docker save pk-playwright-authoring:local | gzip > pk-pw-airgap.tar.gz
#
# На чистом хосте (без интернета):
#   docker load < pk-pw-airgap.tar.gz
#   docker compose -f services/docker-compose.yml up -d playwright-authoring
#
# Инвариант: playwright install / pip install / npx playwright НЕ вызывается
# ни на рантайме, ни при load — браузеры и либы уже в образе.
set -euo pipefail

cd "$(dirname "$0")/.."   # → services/

IMAGE="pk-playwright-authoring:local"
OUT="${1:-pk-pw-airgap.tar.gz}"

echo "[airgap-bundle] build image ${IMAGE}"
docker compose -f docker-compose.yml build playwright-authoring

echo "[airgap-bundle] verify: browsers baked into image (no runtime install)"
docker run --rm --entrypoint sh "${IMAGE}" -c \
  'test -d /ms-playwright/chromium-1129 && test -d /ms-playwright/firefox-1458 && echo "browsers OK"'

echo "[airgap-bundle] docker save → ${OUT}"
docker save "${IMAGE}" | gzip > "${OUT}"

echo "[airgap-bundle] done: ${OUT} ($(du -h "${OUT}" | cut -f1))"
echo "  load: docker load < ${OUT}"
echo "  up:   docker compose -f services/docker-compose.yml up -d playwright-authoring"
