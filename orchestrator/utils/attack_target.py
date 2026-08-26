# -*- coding: utf-8 -*-
"""URL атаки манифеста: join relative + allowlist (канон Открыть / ОткрытьПоURL)."""
from __future__ import annotations

from typing import Any, Tuple
from urllib.parse import urljoin, urlparse

from core.errors import WiredError
from utils.allowed_urls import ALLOWED_URL_DENY_MSG, url_allowed


def attack_base_url(wired: Any) -> str:
    base = ""
    scan = getattr(wired, "scan_base_url", None)
    if callable(scan):
        base = (scan() or "").strip()
    if not base:
        infra = getattr(wired, "infrastructure", None)
        base = (getattr(infra, "base_url_override", None) or "").strip() if infra else ""
    if not base:
        sec = getattr(wired, "security_configuration", None)
        base = (getattr(sec, "base_url_override", None) or "").strip() if sec else ""
    if not base:
        raise WiredError("нужен infrastructure.base_url_override (URL атаки)")
    return base if "://" in base else f"http://{base}"


def attack_host_tls(wired: Any) -> Tuple[str, bool, str]:
    """host:port, tls, absolute base URL with trailing semantics for join."""
    base = attack_base_url(wired)
    parsed = urlparse(base)
    host = parsed.netloc or parsed.path
    if not host:
        raise WiredError(f"не разобрать URL атаки {base!r}")
    tls = (parsed.scheme or "").lower() == "https"
    root = f"{parsed.scheme or 'http'}://{host}/"
    return host, tls, root


def allowlist_csv(wired: Any) -> str:
    scan = getattr(wired, "scan_allowed_extra_domains", None)
    if callable(scan):
        return (scan() or "").strip()
    infra = getattr(wired, "infrastructure", None)
    extra = (getattr(infra, "allowed_extra_domains", None) or "").strip() if infra else ""
    if extra:
        return extra
    sec = getattr(wired, "security_configuration", None)
    return (getattr(sec, "allowed_extra_domains", None) or "").strip() if sec else ""


def assert_url_in_attack_scope(wired: Any, abs_url: str) -> None:
    allow = allowlist_csv(wired)
    base = attack_base_url(wired)
    probe = (abs_url or "").strip()
    if not probe:
        raise WiredError(ALLOWED_URL_DENY_MSG)
    if probe.rstrip("/") == base.rstrip("/") or probe.startswith(base.rstrip("/") + "/"):
        return
    if allow and url_allowed(probe, allow):
        return
    if allow and url_allowed(probe, base):
        return
    try:
        bh = urlparse(base).netloc.lower()
        ah = urlparse(probe).netloc.lower()
        if bh and ah and bh == ah:
            return
    except Exception:  # noqa: BLE001
        pass
    raise WiredError(ALLOWED_URL_DENY_MSG)


def resolve_attack_relative_or_allowlisted(
    wired: Any,
    path_or_url: str,
    *,
    label: str = "URL",
) -> str:
    """
    Relative → join к URL атаки.
    Absolute http(s) → только allowlist (как ОткрытьПоURL).
    """
    raw = (path_or_url or "").strip()
    if not raw:
        raise WiredError(f"{label}: пустой путь")
    if raw.startswith(("http://", "https://")):
        assert_url_in_attack_scope(wired, raw)
        return raw
    base = attack_base_url(wired)
    joined = urljoin(base if base.endswith("/") else base + "/", raw.lstrip("/"))
    assert_url_in_attack_scope(wired, joined)
    return joined
