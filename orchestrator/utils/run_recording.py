# -*- coding: utf-8 -*-
"""
MON-5: запись видео прогона (Selenium Grid chrome-video -> MP4).

Grid уже пишет MP4 в reports/video/ через sidecar chrome-video (ffmpeg).
Playwright пишет webm через record_video_dir.

Этот модуль находит файл по run_id, отдаёт его в Monitor с поддержкой
Range (HTTP 206) и конвертирует Playright webm -> MP4 (PW-B2).
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional, Tuple, Union

from utils.paths import VIDEO_DIR

_VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mkv"})
DEFAULT_CHUNK = 65536  # 64 KiB


def find_video_for_run(run_id: str) -> Optional[Path]:
    """
    Найти видео-файл для run_id (MON-5 + PW-E3).

    Два согласованных паттерна имени:
      - Grid:   `{run_id}_<...>.mp4` (chrome-video sidecar)
      - PW-E3:  `{run_id}.mp4`     (convert_webm_to_mp4 конверт)

    Возвращает путь к файлу или None. Без fallback — чужой прогон не подменяем.
    """
    if not run_id:
        return None
    vdir = Path(VIDEO_DIR)
    if not vdir.is_dir():
        return None
    # Точное имя ({run_id}.mp4) — приоритетнее (PW-E3 конверт),
    # иначе префикс ({run_id}_*) — Grid sidecar.
    exact = [
        p for p in vdir.iterdir()
        if p.is_file()
        and p.suffix.lower() in _VIDEO_EXTENSIONS
        and p.name == f"{run_id}{p.suffix.lower()}"
    ]
    if exact:
        exact.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return exact[0]
    prefix = [
        p for p in vdir.iterdir()
        if p.is_file()
        and p.suffix.lower() in _VIDEO_EXTENSIONS
        and p.name.startswith(f"{run_id}_")
    ]
    if not prefix:
        return None
    # Новейший при нескольких (re-run)
    prefix.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return prefix[0]


def video_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
    }.get(suffix, "application/octet-stream")


def _parse_range_header(range_header: str, file_size: int) -> Optional[Tuple[int, int]]:
    """bytes=start-end → (start, end_inclusive). None = malformed."""
    val = (range_header or "").strip()
    if not val.startswith("bytes="):
        return None
    spec = val[6:].strip()
    if "-" not in spec:
        return None
    s, _, e = spec.partition("-")
    # bytes=- (оба пустые) и bytes=-N (suffix) не поддерживаем — браузеры не шлют
    if s == "" and e == "":
        return None
    try:
        if s == "":
            # suffix-byte-range bytes=-N: последние N байт
            n = int(e)
            if n <= 0:
                return None
            start = max(0, file_size - n)
            end = file_size - 1
        else:
            start = int(s)
            end = int(e) if e else file_size - 1
    except ValueError:
        return None
    if start < 0 or start >= file_size or end < start:
        return None
    return max(0, start), min(end, file_size - 1)


def serve_video_range_body(
    path: Path,
    range_header: str = "",
) -> Tuple[bytes, int, dict]:
    """
    Вернуть (body, status, headers) для видео с поддержкой Range.
    200 без Range, 206 с Range — нативные seek-запросы браузера.
    """
    try:
        file_size = path.stat().st_size
    except OSError:
        return b"{}", 500, {}
    range_tuple = _parse_range_header(range_header, file_size) if range_header else None

    content_type = video_content_type(path)
    headers = {
        "Content-Type": content_type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
    }

    if range_tuple is None:
        # Без Range: отдаём весь файл
        try:
            body = path.read_bytes()
        except OSError:
            return b"{}", 500, {}
        headers["Content-Length"] = str(file_size)
        return body, 200, headers

    # 206 Partial Content
    start, end = range_tuple
    chunk_size = end - start + 1
    try:
        with open(path, "rb") as fh:
            fh.seek(start)
            body = fh.read(chunk_size)
    except OSError:
        return b"{}", 500, {}
    headers.update({
        "Content-Length": str(len(body)),
        "Content-Range": f"bytes {start}-{end}/{file_size}",
    })
    return body, 206, headers


# ── PW-B2: Playwright webm -> MP4 conversion ────────────────────────────────


def convert_webm_to_mp4(target_dir: str, run_id: str) -> Optional[Path]:
    """
    Find Playwright webm files in target_dir and convert to MP4
    with run_id naming for Monitor compatibility.

    Returns path to the converted MP4 file, or None if no webm found.
    """
    import logging
    logger = logging.getLogger(__name__)

    vdir = Path(target_dir)
    webm_files = sorted(vdir.glob("*.webm"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not webm_files:
        logger.debug("No webm files found in %s", target_dir)
        return None

    src = webm_files[0]
    dest = Path(VIDEO_DIR) / f"{run_id}.mp4"

    try:
        # ffmpeg -i input.webm -c copy output.mp4 (fast, no re-encode)
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(src), "-c", "copy", str(dest)],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            logger.warning("ffmpeg conversion failed: %s", result.stderr[:200])
            return None

        logger.info("Converted %s -> %s", src.name, dest.name)
        return dest
    except FileNotFoundError:
        logger.warning("ffmpeg not installed — skipping webm->mp4 conversion")
        return None
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg conversion timed out")
        return None
    except Exception as e:
        logger.warning("ffmpeg conversion error: %s", e)
        return None
