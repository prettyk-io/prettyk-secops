# -*- coding: utf-8 -*-
"""
MON-5: запись видео прогона (Selenium Grid chrome-video -> MP4).

Grid уже пишет MP4 в reports/video/ через sidecar chrome-video (ffmpeg).
Playwright пишет webm через record_video_dir.

Этот модуль находит файл по run_id, отдаёт его в Monitor с поддержкой
Range (HTTP 206) и конвертирует Playright webm -> MP4 (PW-B2).
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
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

    def _pick(candidates: list) -> Optional[Path]:
        if not candidates:
            return None
        # RUNTIME-UN-CUTOVER-GRID-WEBM: webm — целевой формат rewind, приоритетнее
        # mp4/mkv при равном имени; внутри формата — самый свежий.
        ext_rank = {".webm": 0, ".mp4": 1, ".mkv": 2}
        candidates.sort(
            key=lambda p: (ext_rank.get(p.suffix.lower(), 9), -p.stat().st_mtime)
        )
        return candidates[0]

    # Точное имя ({run_id}.<ext>) — приоритетнее (PW-E3 конверт / webm-финал),
    # затем префикс ({run_id}_*) — Grid sidecar.
    exact = [
        p for p in vdir.iterdir()
        if p.is_file()
        and p.suffix.lower() in _VIDEO_EXTENSIONS
        and p.name == f"{run_id}{p.suffix.lower()}"
    ]
    picked = _pick(exact)
    if picked is not None:
        return picked
    prefix = [
        p for p in vdir.iterdir()
        if p.is_file()
        and p.suffix.lower() in _VIDEO_EXTENSIONS
        and p.name.startswith(f"{run_id}_")
    ]
    return _pick(prefix)


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


# ── MONITOR-LIVE-DEEPLINK: контейнерный producer записи прогона ─────────────


logger = logging.getLogger(__name__)

# Контейнер, у которого Xvfb с авторинг-браузером (compose: playwright-authoring).
RECORDING_CONTAINER = os.environ.get("PK_RECORDING_CONTAINER", "playwright-authoring")
# Xvfb display контейнера (см. Dockerfile/entrypoint playwright-authoring).
RECORDING_DISPLAY = os.environ.get("PK_RECORDING_DISPLAY", ":99")
RECORDING_SIZE = os.environ.get("PK_RECORDING_SIZE", "1920x1080")
RECORDING_FPS = os.environ.get("PK_RECORDING_FPS", "12")
# Путь ВНУТРИ контейнера (host: reports/video — тот же том).
CONTAINER_VIDEO_DIR = "/reports/video"


def recording_enabled() -> bool:
    """Kill-switch per-run x11grab producer'а.

    RUNTIME-UN-CUTOVER-GRID-WEBM: producer припаркован (боевой рантайм — Selenium
    Grid, запись делает chrome-video sidecar); включается ТОЛЬКО явным
    ``PK_RUN_RECORDING=1``.
    """
    raw = (os.environ.get("PK_RUN_RECORDING", "0") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def recording_marker(run_id: str) -> Path:
    """Маркер «запись идёт» — честная готовность в /api/recording/status."""
    return Path(VIDEO_DIR) / f"{run_id}.recording"


def _capture_cmd(run_id: str) -> list:
    """docker exec -d ... ffmpeg x11grab → /reports/video/<run_id>.mp4."""
    out = f"{CONTAINER_VIDEO_DIR}/{run_id}.mp4"
    return [
        "exec",
        "-d",
        RECORDING_CONTAINER,
        "ffmpeg",
        "-nostdin",
        "-y",
        "-f",
        "x11grab",
        "-draw_mouse",
        "1",
        "-video_size",
        RECORDING_SIZE,
        "-framerate",
        str(RECORDING_FPS),
        "-i",
        RECORDING_DISPLAY,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out,
    ]


def _docker(args: list, *, timeout: float = 15.0):
    """Best-effort docker-вызов (никогда не бросает). None = docker недоступен."""
    try:
        return subprocess.run(
            ["docker", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except Exception as exc:
        logger.debug("docker invocation failed: %s", exc)
        return None


def start_run_capture(run_id: str) -> dict:
    """Старт видео-записи прогона (Xvfb-экран контейнера → MP4 по run_id).

    Возвращает {ok, run_id, skipped?, error?}; исключений не бросает.
    """
    rid = (run_id or "").strip()
    result: dict = {"ok": False, "run_id": rid, "skipped": False}
    if not rid:
        result["error"] = "run_id required"
        return result
    if not recording_enabled():
        result["skipped"] = True
        result["reason"] = "PK_RUN_RECORDING!=1 (producer припаркован)"
        return result
    try:
        Path(VIDEO_DIR).mkdir(parents=True, exist_ok=True)
        recording_marker(rid).write_text("1", encoding="utf-8")
    except OSError as exc:
        result["error"] = f"marker write failed: {exc}"
        return result
    proc = _docker(_capture_cmd(rid))
    if proc is None or proc.returncode != 0:
        try:
            recording_marker(rid).unlink(missing_ok=True)
        except OSError:
            pass
        detail = ""
        if proc is not None:
            detail = (proc.stderr or proc.stdout or "").strip()[:300]
        result["error"] = detail or "docker exec failed"
        return result
    result["ok"] = True
    return result


def stop_run_capture(run_id: str, *, wait_sec: float = 25.0) -> dict:
    """Финализация записи: SIGINT ffmpeg → дождаться валидного MP4 → снять маркер."""
    rid = (run_id or "").strip()
    result: dict = {"ok": False, "run_id": rid}
    if not rid:
        result["error"] = "run_id required"
        return result
    target = Path(VIDEO_DIR) / f"{rid}.mp4"
    try:
        # SIGINT заставляет ffmpeg корректно закрыть файл (moov atom).
        _docker(["exec", RECORDING_CONTAINER, "pkill", "-INT", "-f", f"{rid}.mp4"], timeout=10)
        deadline = time.time() + wait_sec
        last = -1
        stable = 0
        while time.time() < deadline:
            size = target.stat().st_size if target.is_file() else 0
            if size and size == last:
                stable += 1
                if stable >= 2:
                    break
            else:
                stable = 0
            last = size
            time.sleep(0.5)
    finally:
        try:
            recording_marker(rid).unlink(missing_ok=True)
        except OSError:
            pass
    if target.is_file() and target.stat().st_size > 0:
        result.update(ok=True, path=str(target), size=target.stat().st_size)
    else:
        result["error"] = "recording artifact missing/empty"
    return result


def capture_status(run_id: str) -> dict:
    """Готовность записи: recording(идёт)/ready(есть файл)/reason — без fallback."""
    rid = (run_id or "").strip()
    path = find_video_for_run(rid) if rid else None
    status: dict = {
        "run_id": rid,
        "recording": bool(rid) and recording_marker(rid).is_file(),
        "ready": path is not None,
        "path": str(path) if path is not None else None,
        "size": 0,
    }
    if path is not None:
        try:
            status["size"] = path.stat().st_size
        except OSError:
            status["size"] = 0
    if status["ready"]:
        status["reason"] = ""
    elif status["recording"]:
        status["reason"] = "запись идёт (видео появится после финализации прогона)"
    else:
        status["reason"] = (
            "записи нет: прогон без записи или артефакт вычищен retention-политикой"
        )
    return status


# ── RUNTIME-UN-CUTOVER-GRID-WEBM: Grid MP4 → WEBM финализация ───────────────


def _find_grid_source_for_run(run_id: str) -> Optional[Path]:
    """Исходник Grid-записи: `{run_id}.mp4` или новейший `{run_id}_*.mp4`."""
    rid = (run_id or "").strip()
    if not rid:
        return None
    vdir = Path(VIDEO_DIR)
    if not vdir.is_dir():
        return None
    exact = vdir / f"{rid}.mp4"
    if exact.is_file():
        return exact
    prefix = [
        p for p in vdir.iterdir()
        if p.is_file()
        and p.suffix.lower() == ".mp4"
        and p.name.startswith(f"{rid}_")
    ]
    if not prefix:
        return None
    prefix.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return prefix[0]


def _ffmpeg_mp4_to_webm(src: Path, dest: Path) -> bool:
    """MP4 (Grid sidecar) → WEBM (VP8, целевой формат rewind).

    LIVE-MONITOR-REVIVE: на недописанном mp4 (sidecar ещё запечатывает файл)
    ffmpeg падает AVERROR_INVALIDDATA — частичный dest подчищаем, решение о
    ретрае принимает finalize_grid_video_webm.
    """
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(src),
                "-c:v",
                "libvpx",
                "-deadline",
                "realtime",
                "-cpu-used",
                "5",
                "-crf",
                "32",
                "-b:v",
                "2M",
                "-an",
                str(dest),
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except Exception as exc:
        logger.warning("mp4->webm ffmpeg failed: %s", exc)
        _unlink_partial(dest)
        return False
    if proc.returncode != 0:
        logger.warning(
            "mp4->webm ffmpeg rc=%s: %s", proc.returncode, (proc.stderr or "")[:200]
        )
        _unlink_partial(dest)
        return False
    return dest.is_file() and dest.stat().st_size > 0


def _unlink_partial(dest: Path) -> None:
    """Убрать недоделанный артефакт, чтобы он не считался готовым webm."""
    try:
        if dest.is_file():
            dest.unlink()
    except OSError:
        pass


def finalize_grid_video_webm(
    run_id: str,
    *,
    wait_sec: float = 25.0,
    convert_timeout_sec: float = 180.0,
    retry_pause_sec: float = 5.0,
) -> dict:
    """Дождаться Grid-MP4 (sidecar финализирует его после сессии) и сделать WEBM.

    Delivered-артефакт монитора — `{run_id}.webm`; исходный mp4 остаётся
    (find_video_for_run предпочитает webm). Исключений не бросает.

    LIVE-MONITOR-REVIVE: headed-запись запечатывается ПОЗЖЕ teardown, поэтому
    одна конверсия может упасть на неполном файле. Делаем bounded-ретраи
    (пауза + свежий поиск источника) до ``convert_timeout_sec``; честный
    результат несёт число попыток.
    """
    rid = (run_id or "").strip()
    result: dict = {"ok": False, "run_id": rid}
    if not rid:
        result["error"] = "run_id required"
        return result
    dest = Path(VIDEO_DIR) / f"{rid}.webm"
    if dest.is_file() and dest.stat().st_size > 0:
        result.update(ok=True, skipped=True, path=str(dest), reason="webm already exists")
        return result
    deadline = time.time() + max(0.0, wait_sec)
    src: Optional[Path] = None
    last = -1
    stable = 0
    while time.time() < deadline:
        src = _find_grid_source_for_run(rid)
        if src is not None:
            size = src.stat().st_size
            if size and size == last:
                stable += 1
                if stable >= 2:
                    break
            else:
                stable = 0
            last = size
        time.sleep(0.5)
    src = _find_grid_source_for_run(rid)
    if src is None:
        result["error"] = "grid video source not found (video disabled or not produced)"
        return result

    convert_deadline = time.time() + max(0.0, convert_timeout_sec)
    attempts = 0
    while True:
        attempts += 1
        if _ffmpeg_mp4_to_webm(src, dest):
            result.update(
                ok=True,
                path=str(dest),
                source=str(src),
                size=dest.stat().st_size,
                attempts=attempts,
            )
            return result
        if time.time() >= convert_deadline:
            break
        time.sleep(max(0.1, retry_pause_sec))
        src = _find_grid_source_for_run(rid) or src
    result["error"] = "mp4->webm conversion failed"
    result["source"] = str(src)
    result["attempts"] = attempts
    return result
