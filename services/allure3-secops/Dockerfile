# prettyk-allure3:local — Allure 3 Awesome (dark+ru, SecOps) HTTP-сервис :5050.
#
# AL3-FRESH-REPAIR: Dockerfile восстановлен из `docker history prettyk-allure3:local`
# (до этого образ существовал без build-контекста в репе). Порядок слоёв повторяет
# as-built образ; добавлен package-lock.json для воспроизводимого npm install.
FROM node:22.23.2-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    ALLURE_BIN=allure \
    ALLURE_RESULTS_DIR=/app/allure-results \
    ALLURE_REPORT_DIR=/app/default-reports \
    KEEP_HISTORY=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv curl ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin allure \
    && mkdir -p /app/allure-results /app/default-reports /app/brand /app/allure3-secops \
    && chown -R allure:allure /app /opt/venv

# kdt-plugin-awesome: форк @allurereport/plugin-awesome (брендированный Overview
# index.html + full.html, без телеметрии). В as-built образе форк копировался
# ПОВЕРХ уже установленного npm-пакета (слой-оверлей) — иначе `npm install`
# затирает его registry-версией и пропадает full.html/secops-брендинг.
COPY package.json package-lock.json ./
RUN npm install --omit=dev \
    && ln -sf /app/node_modules/.bin/allure /usr/local/bin/allure
COPY packages/kdt-plugin-awesome/package.json ./node_modules/@allurereport/plugin-awesome/package.json
COPY packages/kdt-plugin-awesome/dist ./node_modules/@allurereport/plugin-awesome/dist
RUN allure --version

COPY allurerc.mjs ./
COPY requirements.txt ./allure3-secops/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /app/allure3-secops/requirements.txt

COPY app ./allure3-secops/app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R allure:allure /app

WORKDIR /app/allure3-secops
USER root
EXPOSE 5050
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5050"]
