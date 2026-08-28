# Artifact Exchange Contract — экспорт результатов внешним системам.
#
# Cosmoport2 / CI-системы забирают артефакты по фиксированному контракту,
# не копаясь во внутренних директориях и не импортируя Python-модули PrettyK.
#
# Форматы:
#   - SBOM (CycloneDX 1.5 / SPDX 2.3) — состав проверенной цели.
#   - SARIF 2.1 — результаты сканирования (scanner findings → SARIF).
#   - OCI bundle — образы + compose/helm для воспроизведения контура.
#   - run_summary.json — итог прогона (gate, severity, duration).
#   - run_package.tar.gz — полный архив прогона (логи, HAR, скриншоты).
#
# Инвариант: секреты (токены, пароли, приватные ключи) не попадают в артефакты.
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ArtifactFormat(str, Enum):
    SBOM_CYCLONEDX = "sbom-cyclonedx"    # CycloneDX 1.5 JSON
    SBOM_SPDX = "sbom-spdx"              # SPDX 2.3 JSON
    SARIF = "sarif"                      # SARIF 2.1.0 JSON
    OCI_BUNDLE = "oci-bundle"            # OCI image tarball
    RUN_SUMMARY = "run-summary"          # run_summary.json
    RUN_PACKAGE = "run-package"          # run_package.tar.gz


@dataclass
class ArtifactDescriptor:
    """Метаданные одного артефакта обмена."""
    run_id: str
    session_id: str
    format: ArtifactFormat
    path: str                  # путь к файлу артефакта
    size_bytes: int = 0
    sha256: str = ""
    created_at: float = field(default_factory=time.time)
    labels: Dict[str, str] = field(default_factory=dict)


@dataclass
class RunArtifactManifest:
    """Манифест всех артефактов одного прогона."""
    run_id: str
    session_id: str
    artifacts: List[ArtifactDescriptor] = field(default_factory=list)
    generated_at: float = field(default_factory=time.time)


class ArtifactExporter:
    """Экспортёр артефактов прогона для внешних систем.

    Принимает внутренние результаты оркестратора и упаковывает их
    в стандартные форматы без утечки секретов.
    """

    def __init__(self, output_dir: Path):
        self._output = Path(output_dir)
        self._output.mkdir(parents=True, exist_ok=True)

    # ── SBOM ──────────────────────────────────────────────────────

    def export_sbom_cyclonedx(
        self,
        run_id: str,
        session_id: str,
        target_url: str,
        components: Optional[List[Dict[str, str]]] = None,
    ) -> ArtifactDescriptor:
        """Сгенерировать CycloneDX 1.5 SBOM для проверенной цели."""
        bom = {
            "bomFormat": "CycloneDX",
            "specVersion": "1.5",
            "serialNumber": f"urn:uuid:{run_id}",
            "version": 1,
            "metadata": {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "tools": [
                    {
                        "vendor": "PrettyK",
                        "name": "prettyk-dast",
                    },
                ],
                "component": {
                    "type": "application",
                    "name": target_url,
                },
            },
            "components": [
                {
                    "type": c.get("type", "application"),
                    "name": c["name"],
                    "version": c.get("version", "unknown"),
                }
                for c in (components or [])
            ],
        }

        path = self._write(f"{run_id}.sbom.cdx.json", bom)
        return ArtifactDescriptor(
            run_id=run_id,
            session_id=session_id,
            format=ArtifactFormat.SBOM_CYCLONEDX,
            path=str(path),
            size_bytes=path.stat().st_size,
            sha256=self._sha256(path),
        )

    # ── SARIF ─────────────────────────────────────────────────────

    def export_sarif(
        self,
        run_id: str,
        session_id: str,
        findings: List[Dict[str, Any]],
        target_url: str = "",
    ) -> ArtifactDescriptor:
        """Сгенерировать SARIF 2.1.0 из находок scanner."""

        rules: Dict[str, int] = {}
        results: List[Dict[str, Any]] = []

        for i, f in enumerate(findings):
            rule_id = f.get("alert", f"PK-{i}")
            if rule_id not in rules:
                rules[rule_id] = len(rules)
                rules[rule_id] = len(rules)

            results.append({
                "ruleId": rule_id,
                "ruleIndex": rules.setdefault(rule_id, len(rules)),
                "level": _sarif_level(f.get("risk", "Info")),
                "message": {
                    "text": f.get("name", rule_id),
                },
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {
                                "uri": f.get("url", target_url),
                            },
                        },
                    },
                ],
            })

        sarif = {
            "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
            "version": "2.1.0",
            "runs": [
                {
                    "tool": {
                        "driver": {
                            "name": "PrettyK DAST",
                            "informationUri": "https://prettyk.io",
                            "rules": [
                                {"id": rid, "name": rid}
                                for rid in rules
                            ],
                        },
                    },
                    "results": results,
                },
            ],
        }

        path = self._write(f"{run_id}.sarif.json", sarif)
        return ArtifactDescriptor(
            run_id=run_id,
            session_id=session_id,
            format=ArtifactFormat.SARIF,
            path=str(path),
            size_bytes=path.stat().st_size,
            sha256=self._sha256(path),
        )

    # ── OCI Bundle ────────────────────────────────────────────────

    def export_oci_bundle(
        self,
        run_id: str,
        session_id: str,
        image_paths: Optional[List[str]] = None,
    ) -> Optional[ArtifactDescriptor]:
        """Создать OCI-пакет для воспроизведения контура проверки.

        Принимает список путей к .tar-образам или использует образы из бандла.
        Возвращает дескриптор архивированного OCI-пакета.
        """
        import tarfile

        images = image_paths or []
        if not images:
            return None

        archive_path = self._output / f"{run_id}-oci-bundle.tar.gz"
        with tarfile.open(archive_path, "w:gz") as tf:
            for img in images:
                img_path = Path(img)
                if img_path.exists():
                    tf.add(img_path, arcname=f"images/{img_path.name}")

        return ArtifactDescriptor(
            run_id=run_id,
            session_id=session_id,
            format=ArtifactFormat.OCI_BUNDLE,
            path=str(archive_path),
            size_bytes=archive_path.stat().st_size,
            sha256=self._sha256(archive_path),
        )

    # ══ License compliance ═══════════════════════════════════════

    @staticmethod
    def collect_licenses(
        image_list: List[Dict[str, str]],
    ) -> dict:
        """Собрать информацию о лицензиях образов поставки.

        image_list: список {name, version, license_url, license_spdx}.
        В production — парсинг docker manifest / syft; здесь контракт.
        """
        licenses_collected: Dict[str, dict] = {}
        for img in image_list:
            name = img.get("name", "unknown")
            spdx = img.get("license_spdx", "UNKNOWN")
            licenses_collected[name] = {
                "version": img.get("version", ""),
                "license": spdx,
                "url": img.get("license_url", ""),
            }
        return licenses_collected

    def export_license_report(
        self,
        run_id: str,
        image_list: List[Dict[str, str]],
    ) -> ArtifactDescriptor:
        """Сформировать отчёт о лицензиях компонентов поставки."""
        data = {
            "run_id": run_id,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "images": self.collect_licenses(image_list),
        }
        path = self._write(f"{run_id}-licenses.json", data)
        return ArtifactDescriptor(
            run_id=run_id,
            session_id="",
            format=ArtifactFormat.RUN_SUMMARY,
            path=str(path),
            size_bytes=path.stat().st_size,
            sha256=self._sha256(path),
        )

    def build_manifest(
        self, run_id: str, session_id: str, artifacts: List[ArtifactDescriptor],
    ) -> RunArtifactManifest:
        return RunArtifactManifest(
            run_id=run_id,
            session_id=session_id,
            artifacts=artifacts,
        )

    def write_manifest(self, manifest: RunArtifactManifest) -> Path:
        """Записать manifest.json рядом с артефактами."""
        data = {
            "run_id": manifest.run_id,
            "session_id": manifest.session_id,
            "generated_at": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(manifest.generated_at),
            ),
            "artifacts": [
                {
                    "format": a.format.value,
                    "path": Path(a.path).name,
                    "size_bytes": a.size_bytes,
                    "sha256": a.sha256,
                }
                for a in manifest.artifacts
            ],
        }
        return self._write(f"{manifest.run_id}-manifest.json", data)

    # ── Redaction ─────────────────────────────────────────────────

    @staticmethod
    def redact_secrets(data: dict, known_secret_paths: Optional[set[str]] = None) -> dict:
        """Удалить секреты из словаря перед экспортом.

        known_secret_paths: пути вроде 'credentials.password', 'auth.token'.
        """
        sensitive = known_secret_paths or {
            "password", "token", "secret", "api_key", "private_key",
            "authorization", "cookie",
        }

        def _walk(obj: Any) -> Any:
            if isinstance(obj, dict):
                return {
                    k: "[REDACTED]" if k.lower() in sensitive else _walk(v)
                    for k, v in obj.items()
                }
            if isinstance(obj, list):
                return [_walk(v) for v in obj]
            return obj

        return _walk(data)

    # ── Internal ──────────────────────────────────────────────────

    def _write(self, filename: str, data: dict) -> Path:
        path = self._output / filename
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return path

    @staticmethod
    def _sha256(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()


def _sarif_level(risk: str) -> str:
    _map = {
        "High": "error",
        "Medium": "warning",
        "Low": "note",
        "Info": "note",
    }
    return _map.get(risk, "none")