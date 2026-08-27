# PW-A1: Airgap Playwright container — headed Chromium under Xvfb + noVNC stream
# Base: official Playwright Python (chromium + firefox + webkit + ffmpeg pre-installed)
FROM mcr.microsoft.com/playwright/python:latest

# System deps for headed browser in container
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DISPLAY=:99

EXPOSE 7902 9222

ENTRYPOINT ["/entrypoint.sh"]