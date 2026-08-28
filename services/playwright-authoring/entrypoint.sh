#!/usr/bin/env bash
set -euo pipefail

echo "[pw-authoring] Starting Xvfb on :99 (1920x1080x24)"
# Убрать stale lock от предыдущего рестарта контейнера
rm -f /tmp/.X99-lock 2>/dev/null || true
Xvfb :99 -screen 0 1920x1080x24 -ac -nolisten tcp +extension RANDR &
XVFB_PID=$!
sleep 1

echo "[pw-authoring] Starting x11vnc (no password, forever)"
x11vnc -display :99 -forever -nopw -quiet -shared &
VNC_PID=$!
sleep 1

echo "[pw-authoring] Starting noVNC websockify on :7902"
websockify --web /usr/share/novnc 0.0.0.0:7902 localhost:5900 &
WS_PID=$!

# VP-L2: Chromium слушает CDP только на loopback (Chrome 128 игнорирует
# --remote-debugging-address). socat пробрасывает 0.0.0.0:9223 → 127.0.0.1:9222.
# Внешний browser_service подключается через connect_over_cdp(http://localhost:9223).
CHROME_BIN=/ms-playwright/chromium-1129/chrome-linux/chrome
PROFILE_DIR=/tmp/pk-authoring-profile

echo "[pw-authoring] Launching headed Chromium (CDP 127.0.0.1:9222)"
"$CHROME_BIN" \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --window-size=1920,1080 \
  about:blank &
CHROME_PID=$!

# Дождаться поднятия CDP на loopback
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
    echo "[pw-authoring] CDP ready on 127.0.0.1:9222"
    break
  fi
  sleep 1
done

echo "[pw-authoring] socat: 0.0.0.0:9223 → 127.0.0.1:9222"
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &
SOCAT_PID=$!

# Держим контейнер живым, пока жив Chrome
wait "$CHROME_PID"
