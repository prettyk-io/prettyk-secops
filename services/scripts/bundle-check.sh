#!/usr/bin/env bash
# BUNDLE-CHECK: проверить самодостаточность образа Playwright для airgap.
set -euo pipefail

echo "--- браузеры в образе (/ms-playwright) ---"
docker run --rm --entrypoint sh pk-playwright-authoring:local -c 'ls /ms-playwright/'

echo "--- chromium binary ---"
docker run --rm --entrypoint sh pk-playwright-authoring:local -c 'test -f /ms-playwright/chromium-1129/chrome-linux/chrome && echo "chromium OK"'

echo "--- firefox binary ---"
docker run --rm --entrypoint sh pk-playwright-authoring:local -c 'test -f /ms-playwright/firefox-1458/firefox/firefox && echo "firefox OK"'

echo "--- ffmpeg ---"
docker run --rm --entrypoint sh pk-playwright-authoring:local -c 'which ffmpeg || ls /ms-playwright/ffmpeg-*'

echo "--- playwright python lib ---"
docker run --rm --entrypoint sh pk-playwright-authoring:local -c 'python -c "import playwright; print(\"playwright installed\")"'

echo "--- socat (CDP relay) ---"
docker run --rm --entrypoint sh pk-playwright-authoring:local -c 'which socat || echo "socat MISSING"'

echo "--- ALL CHECKS DONE ---"
