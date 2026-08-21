# -*- coding: utf-8 -*-
"""
Скрипт сборки автономного релизного бандла для VPS (в папку deploy_vps).

Канон VPS (единственные пути):
  Статика:  /var/www/www/prettyk
  Бэкенд:   /var/www/orchestrator
  Apache:   DocumentRoot /var/www/www/prettyk
  Nginx:    не используется, не устанавливается
"""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY_DIR = ROOT / "deploy_vps"

def package() -> None:
    if DEPLOY_DIR.exists():
        shutil.rmtree(DEPLOY_DIR)

    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Cosmo dist -> deploy_vps/www/prettyk
    fe_dist = ROOT / "cosmo" / "dist"
    if not fe_dist.exists():
        raise RuntimeError("cosmo/dist не найден! Выполните npm run build в cosmo")

    www_dir = DEPLOY_DIR / "www" / "prettyk"
    shutil.copytree(fe_dist, www_dir)
    print(f"[+] Фронтенд скопирован в {www_dir}")

    # 2. Orchestrator core/adapters/models/tools -> deploy_vps/orchestrator
    orch_target = DEPLOY_DIR / "orchestrator"
    orch_target.mkdir(parents=True, exist_ok=True)

    src_orch = ROOT / "orchestrator"
    dirs_to_copy = ["adapters", "core", "models", "data", "tools", "utils"]
    for d in dirs_to_copy:
        src_d = src_orch / d
        if src_d.exists():
            shutil.copytree(
                src_d, orch_target / d,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache"),
            )

    print(f"[+] Python-бэкенд скопирован в {orch_target}")

    # 3. Скрипт запуска start.sh (канон: /var/www/orchestrator)
    start_sh = DEPLOY_DIR / "start.sh"
    with open(start_sh, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            "#!/usr/bin/env bash\n"
            "set -e\n\n"
            'CDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"\n'
            'cd "$CDIR/orchestrator"\n\n'
            "PYTHON_BIN=\"python3\"\n"
            'if [ -f "/var/www/.venv/bin/python" ]; then\n'
            '    PYTHON_BIN="/var/www/.venv/bin/python"\n'
            "fi\n\n"
            "echo \"Запуск бэкенда песочницы на порту 8765...\"\n"
            'PYTHONPATH="/var/www/orchestrator" $PYTHON_BIN tools/data_playground.py --port 8765\n'
        )

    # 4. Nginx не используется. Конфиг не генерируется.
    #    Канон: Apache DocumentRoot /var/www/www/prettyk (apache-prettyk.conf).

    requirements = DEPLOY_DIR / "requirements-playground.txt"
    requirements.write_text("pydantic>=2.10,<3\n", encoding="utf-8", newline="\n")

    # 5. systemd unit (канон: /var/www/orchestrator)
    systemd_unit = DEPLOY_DIR / "prettyk-editor-api.service"
    systemd_unit.write_text(
        "[Unit]\n"
        "Description=PrettyK editor validation API\n"
        "After=network.target\n\n"
        "[Service]\n"
        "Type=simple\n"
        "WorkingDirectory=/var/www/orchestrator\n"
        "ExecStart=/var/www/.venv/bin/python "
        "/var/www/orchestrator/tools/data_playground.py --port 8765\n"
        "Restart=on-failure\n"
        "RestartSec=3\n\n"
        "[Install]\n"
        "WantedBy=multi-user.target\n",
        encoding="utf-8",
        newline="\n",
    )

    # 6. README (канон: Apache, без nginx)
    readme = DEPLOY_DIR / "README.md"
    readme.write_text(
        "# PrettyK Editor: VPS release\n\n"
        "This directory is a self-contained release.\n\n"
        "## Канон путей (единственные)\n\n"
        "| Что | Путь |\n"
        "|---|---|\n"
        "| Статика (Apache DocumentRoot) | `/var/www/www/prettyk` |\n"
        "| Бэкенд | `/var/www/orchestrator` |\n"
        "| venv | `/var/www/.venv` |\n"
        "| API unit | `systemctl prettyk-editor-api` |\n"
        "| Prod URL | `https://prettyk.io/` |\n\n"
        "## Upload\n\n"
        "```bash\n"
        "rsync -az --delete deploy_vps/www/prettyk/ root@VPS:/var/www/www/prettyk/\n"
        "rsync -az --delete deploy_vps/orchestrator/ root@VPS:/var/www/orchestrator/\n"
        "```\n\n"
        "## One-time server setup\n\n"
        "```bash\n"
        "apt update && apt install -y apache2 python3-venv\n"
        "python3 -m venv /var/www/.venv\n"
        "/var/www/.venv/bin/pip install -r deploy_vps/requirements-playground.txt\n"
        "cp deploy_vps/apache-prettyk.conf /etc/apache2/conf-available/kdt-prettyk-root.conf\n"
        "a2enconf kdt-prettyk-root\n"
        "cp deploy_vps/prettyk-editor-api.service /etc/systemd/system/\n"
        "systemctl daemon-reload\n"
        "systemctl enable --now prettyk-editor-api\n"
        "systemctl reload apache2\n"
        "curl -fsS http://127.0.0.1:8765/api/health\n"
        "```\n\n"
        "Open `https://prettyk.io/` (root is canon; `/editor/` and `/prettyk/` → `/`). "
        "API listens only on `127.0.0.1:8765`; Apache reverse-proxies `/api/`. "
        "Add TLS with `certbot --apache -d prettyk.io`.\n",
        encoding="utf-8",
        newline="\n",
    )

    print(f"[+] Deploy instructions written to {readme}")

    # 7. Apache live snippet (DocumentRoot = /var/www/www/prettyk)
    apache_src = ROOT / "deploy_vps_templates" / "apache-prettyk.conf"
    apache_dst = DEPLOY_DIR / "apache-prettyk.conf"
    if apache_src.is_file():
        shutil.copy2(apache_src, apache_dst)
    else:
        apache_dst.write_text(
            "# VPS PrettyK — DocumentRoot canon\n"
            "DocumentRoot /var/www/www/prettyk\n\n"
            "<Directory /var/www/www/prettyk>\n"
            "    Options -Indexes +FollowSymLinks\n"
            "    AllowOverride None\n"
            "    Require all granted\n"
            "    FallbackResource /index.html\n"
            "</Directory>\n\n"
            "RedirectMatch 308 ^/editor/?$ /\n"
            "RedirectMatch 308 ^/editor/(.*)$ /$1\n"
            "RedirectMatch 308 ^/prettyk/?$ /\n"
            "RedirectMatch 308 ^/prettyk/(.*)$ /$1\n",
            encoding="utf-8",
            newline="\n",
        )
    print(f"[+] Apache snippet written to {apache_dst}")

    print(f"\n[SUCCESS] Успешно собран готовый релизный бандл в: {DEPLOY_DIR}")


if __name__ == "__main__":
    package()