# PW-A1: Airgap Playwright container — headed Chromium under Xvfb + noVNC stream
# Base: official Playwright (browsers pre-installed: chromium+firefox+webkit+ffmpeg)
FROM mcr.microsoft.com/playwright/python:latest

# Install playwright Python package (base image has browsers only, not the pip package).
# Version pinned to match base image v1.46.0-jammy — иначе runtime warning о несовпадении.
RUN pip install playwright==1.46.0

# System deps for headed browser in container.
# DEBIAN_FRONTEND=noninteractive + TZ — иначе tzdata зависает на интерактивном prompt.
ENV DEBIAN_FRONTEND=noninteractive TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    socat \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DISPLAY=:99

EXPOSE 7902 9222

ENTRYPOINT ["/entrypoint.sh"]