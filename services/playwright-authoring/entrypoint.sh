#!/usr/bin/env bash
set -euo pipefail

echo "[pw-authoring] Starting Xvfb on :99 (1920x1080x24)"
Xvfb :99 -screen 0 1920x1080x24 -ac -nolisten tcp +extension RANDR &
XVFB_PID=$!

# Give Xvfb a moment
sleep 1

echo "[pw-authoring] Starting x11vnc (no password, forever)"
x11vnc -display :99 -forever -nopw -quiet -shared &
VNC_PID=$!
sleep 1

echo "[pw-authoring] Starting noVNC websockify on :7902"
websockify --web /usr/share/novnc 0.0.0.0:7902 localhost:5900 &
WS_PID=$!

echo "[pw-authoring] Launching Playwright headed Chromium (CDP :9222)"
exec python3 -c "
import time, sys
from playwright.sync_api import sync_playwright

pw = sync_playwright().start()
browser = pw.chromium.launch(
    headless=False,
    args=[
        '--no-sandbox',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--remote-debugging-address=0.0.0.0',
        '--window-size=1920,1080',
    ]
)
print('[pw-authoring] Chromium running (headed under Xvfb), CDP on :9222', flush=True)

# Keep the process alive as long as the browser is connected
try:
    while browser.is_connected():
        time.sleep(10)
except KeyboardInterrupt:
    pass
finally:
    print('[pw-authoring] Shutting down', flush=True)
    browser.close()
    pw.stop()
"