#!/bin/bash
# =====================================================
# Скрипт развертывания KDT фреймворка в airgap
# Запускать из корневой папки с файлами развертывания
# =====================================================

set -e  # прерывать при любой ошибке

echo "=== KDT Airgap Deployment Script ==="

# Пути на раннере (целевые)
BASE_DIR="/home/cbr-sec-ops-hub"
ZAP_DIR="$BASE_DIR/zap"
FRONTEND_DIR="$BASE_DIR/form-builder/react-rjfb-monaco-editor-template/versions/1.0.0-initial"
NGINX_DIR="$BASE_DIR/nginx"
VIDEO_DIR="$BASE_DIR/video"
REPORTS_DIR="$ZAP_DIR/reports"

# Создаём все необходимые папки
echo "Creating directories..."
mkdir -p "$ZAP_DIR/plugins"
mkdir -p "$ZAP_DIR/reports"
mkdir -p "$FRONTEND_DIR/build"
mkdir -p "$NGINX_DIR"
mkdir -p "$VIDEO_DIR"

# Копируем файлы (предполагаем, что они лежат в текущей папке)
echo "Copying files..."
cp -f docker-compose.yml "$ZAP_DIR/"
cp -f nginx.conf "$NGINX_DIR/"
cp -rf ./plugins/* "$ZAP_DIR/plugins/" 2>/dev/null || echo "No plugins to copy"
cp -rf ./build/* "$FRONTEND_DIR/build/" 2>/dev/null || echo "No frontend build to copy"

# Если есть файлы reports (для примера), можно скопировать их
# cp -rf ./reports/* "$REPORTS_DIR/" 2>/dev/null || true

# Загрузка Docker-образов из tar
echo "Loading Docker images..."
if [ -f images.tar ]; then
    docker load -i images.tar
else
    echo "ERROR: images.tar not found!"
    exit 1
fi

# Проверяем, что образы загружены
echo "Loaded images:"
docker images | grep -E "selenium|allure|zap|nginx" || echo "Warning: some images not found"

# Переходим в папку ZAP и запускаем docker-compose
cd "$ZAP_DIR"
echo "Starting services with docker-compose..."
docker-compose down 2>/dev/null || true
docker-compose up -d

# Ждём немного, чтобы сервисы поднялись
sleep 5

# Проверяем статус
echo "Services status:"
docker-compose ps

echo "=== Deployment complete ==="
echo "Selenium Grid UI: http://$(hostname -I | awk '{print $1}'):4444/ui/"
echo "Allure: http://$(hostname -I | awk '{print $1}'):5050"
echo "ZAP API: http://$(hostname -I | awk '{print $1}'):8080"
echo "Frontend: http://$(hostname -I | awk '{print $1}'):8081"
