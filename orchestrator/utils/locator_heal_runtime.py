# -*- coding: utf-8 -*-
"""
HEAL-B runtime: context gate + DOM candidates + Live clue.

Uses locator_heal score (no LLM). Wire: WebDriverAdapter._find_element / click / send_keys.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from utils.locator_heal import (
    DEFAULT_SCORE_CAP,
    ElementFingerprint,
    HealCandidate,
    fingerprint_from_attrs,
    heal_allowed,
    pick_best_heal,
    pick_by_label_hint,
    suggest_locator,
)
from utils.locator_heal_policy import HealStrategy, choose_heal_strategy

logger = logging.getLogger("orchestrator")

_heal_gate: ContextVar[bool] = ContextVar("kdt_locator_heal_gate", default=False)
_heal_label: ContextVar[str] = ContextVar("kdt_locator_heal_label", default="")
_fp_store: Dict[Tuple[str, str], ElementFingerprint] = {}
_fp_loaded = False


def fingerprints_path() -> Path:
    override = (pk_env("LOCATOR_FP_PATH") or "").strip()
    if override:
        return Path(override)
    try:
        from utils.diary_bus import LIVE_DIR

        return Path(LIVE_DIR) / "locator_fingerprints.json"
    except Exception:
        return Path("reports/live/locator_fingerprints.json")


def _load_fingerprints_disk() -> None:
    global _fp_loaded
    if _fp_loaded:
        return
    _fp_loaded = True
    path = fingerprints_path()
    if not path.is_file():
        return
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(raw, dict):
        return
    for key, val in raw.items():
        if not isinstance(val, dict):
            continue
        try:
            fp = ElementFingerprint.from_dict(val)
        except Exception:
            continue
        _fp_store[(fp.locator_type, fp.locator_value)] = fp


def _save_fingerprints_disk() -> None:
    path = fingerprints_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            f"{k[0]}|{k[1]}": v.to_dict() for k, v in _fp_store.items()
        }
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as e:
        logger.debug("locator fp persist skip: %s", e)

_DOM_CANDIDATES_JS = r"""
return Array.prototype.slice.call(
  document.querySelectorAll(
    'a,button,input,select,textarea,[role="button"],[role="link"],[onclick]'
  ),
  0, 100
).map(function (el, i) {
  var cls = el.className;
  if (cls && typeof cls !== 'string') { cls = ''; }
  var text = (el.innerText || el.value || el.getAttribute('placeholder') || '')
    .toString().trim().slice(0, 120);
  return {
    key: String(i),
    tag: (el.tagName || '').toLowerCase(),
    id: el.id || '',
    name: el.getAttribute('name') || '',
    text: text,
    role: el.getAttribute('role') || '',
    aria_label: el.getAttribute('aria-label') || '',
    classes: cls || '',
    parent_tag: el.parentElement
      ? (el.parentElement.tagName || '').toLowerCase()
      : ''
  };
});
"""


def env_heal_flag() -> bool:
    raw = (pk_env("LOCATOR_HEAL") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def env_label_hint() -> str:
    return (pk_env("LOCATOR_HEAL_LABEL") or "").strip()


def heal_gate_active() -> bool:
    return bool(_heal_gate.get()) or env_heal_flag()


def label_hint_active() -> str:
    return (_heal_label.get() or "").strip() or env_label_hint()


@contextmanager
def heal_scope(*, allowed: bool) -> Iterator[None]:
    """Controller wraps failsafe/discovery/debug leaves."""
    token = _heal_gate.set(bool(allowed) or env_heal_flag())
    try:
        yield
    finally:
        _heal_gate.reset(token)


@contextmanager
def heal_label_scope(hint: str) -> Iterator[None]:
    """Optional label hint for HEAL-E (DISC-2 later binds PrettyK `> Label`)."""
    token = _heal_label.set((hint or "").strip())
    try:
        yield
    finally:
        _heal_label.reset(token)


def clear_fingerprint_store() -> None:
    global _fp_loaded
    _fp_store.clear()
    _fp_loaded = False


def remember_fingerprint(fp: ElementFingerprint) -> None:
    _load_fingerprints_disk()
    key = (fp.locator_type, fp.locator_value)
    _fp_store[key] = fp
    _save_fingerprints_disk()


def get_fingerprint(locator_type: str, locator_value: str) -> Optional[ElementFingerprint]:
    _load_fingerprints_disk()
    return _fp_store.get((locator_type, locator_value))


def _attr_safe(element: Any, name: str) -> str:
    try:
        return element.get_attribute(name) or ""
    except Exception:
        return ""


def _element_text_safe(element: Any) -> str:
    try:
        text = (element.text or "").strip()
    except Exception:
        text = ""
    if text:
        return text
    return _attr_safe(element, "value")


def fingerprint_from_web_element(
    element: Any,
    *,
    locator_type: str,
    locator_value: str,
) -> ElementFingerprint:
    try:
        tag = (element.tag_name or "").lower()
    except Exception:
        tag = ""
    el_id = _attr_safe(element, "id")
    name = _attr_safe(element, "name")
    role = _attr_safe(element, "role")
    aria = _attr_safe(element, "aria-label")
    classes = _attr_safe(element, "class")
    text = _element_text_safe(element)
    parent_tag = ""
    try:
        parent = element.find_element("xpath", "..")
        parent_tag = (parent.tag_name or "").lower()
    except Exception:
        parent_tag = ""
    return fingerprint_from_attrs(
        locator_type=locator_type,
        locator_value=locator_value,
        tag=tag,
        id=el_id,
        name=name,
        text=text,
        role=role,
        aria_label=aria,
        classes=classes,
        parent_tag=parent_tag,
    )


def candidates_from_driver(driver: Any) -> List[HealCandidate]:
    if driver is None:
        return []
    try:
        raw = driver.execute_script(_DOM_CANDIDATES_JS)
    except Exception as e:
        logger.debug("locator heal DOM scrape failed: %s", e)
        return []
    out: List[HealCandidate] = []
    if not isinstance(raw, list):
        return out
    for row in raw:
        if not isinstance(row, dict):
            continue
        cand = HealCandidate(
            key=str(row.get("key") or len(out)),
            tag=str(row.get("tag") or ""),
            id=str(row.get("id") or ""),
            name=str(row.get("name") or ""),
            text=str(row.get("text") or ""),
            role=str(row.get("role") or ""),
            aria_label=str(row.get("aria_label") or ""),
            classes=tuple(
                c
                for c in str(row.get("classes") or "").split()
                if c
            ),
            parent_tag=str(row.get("parent_tag") or ""),
        )
        lt, lv = suggest_locator(cand)
        out.append(
            HealCandidate(
                key=cand.key,
                tag=cand.tag,
                id=cand.id,
                name=cand.name,
                text=cand.text,
                role=cand.role,
                aria_label=cand.aria_label,
                classes=cand.classes,
                parent_tag=cand.parent_tag,
                suggested_locator_type=lt,
                suggested_locator_value=lv,
            )
        )
    return out


def _publish_heal(kind: str, msg: str) -> None:
    try:
        from utils.diary_bus import publish

        publish(kind, msg, channel="diary")
    except Exception:
        pass


def _set_last_heal_proposal(payload: Dict[str, Any]) -> None:
    """Studio HEAL-D reads live meta.locator_heal_last."""
    try:
        from utils.diary_bus import set_meta

        set_meta(locator_heal_last=payload)
    except Exception:
        pass


def emit_heal_ok(
    *,
    old_type: str,
    old_value: str,
    new_type: str,
    new_value: str,
    score: float,
) -> None:
    msg = (
        f"locator heal OK | {old_type} {old_value} → {new_type} {new_value} "
        f"(score={score:.2f})"
    )
    logger.info(msg)
    _publish_heal("HEAL", msg)
    _set_last_heal_proposal(
        {
            "status": "ok",
            "old_type": old_type,
            "old_value": old_value,
            "new_type": new_type,
            "new_value": new_value,
            "score": round(float(score), 4),
        }
    )


def emit_heal_miss(
    *,
    old_type: str,
    old_value: str,
    reason: str,
) -> None:
    """Gate was on, heal tried, no recovery → escalate to failsafe (not ERROR yet)."""
    msg = (
        f"locator heal MISS | {old_type} {old_value} | {reason} → failsafe/raise"
    )
    logger.warning(msg)
    _publish_heal("HEAL_MISS", msg)
    _set_last_heal_proposal(
        {
            "status": "miss",
            "old_type": old_type,
            "old_value": old_value,
            "reason": reason,
        }
    )


# Back-compat alias (tests / callers)
def emit_heal_clue(
    *,
    old_type: str,
    old_value: str,
    new_type: str,
    new_value: str,
    score: float,
) -> None:
    emit_heal_ok(
        old_type=old_type,
        old_value=old_value,
        new_type=new_type,
        new_value=new_value,
        score=score,
    )


def try_resolve_healed_locator(
    driver: Any,
    locator_type: str,
    locator_value: str,
    *,
    score_cap: float = DEFAULT_SCORE_CAP,
) -> Optional[Tuple[str, str, float]]:
    """
    If heal gate on and fingerprint known → score DOM → (type, value, score).
    Without prior fingerprint, build weak fp from broken locator attrs only.
    HEAL_OK / HEAL_MISS diary; ERROR только снаружи, если soft не спас.
    """
    if not heal_allowed(
        step_failsafe=heal_gate_active(),
        env_flag=env_heal_flag(),
    ):
        return None
    fp = get_fingerprint(locator_type, locator_value)
    cold = fp is None
    hint = label_hint_active()
    strategy = choose_heal_strategy(
        heal_gate=True,
        has_fingerprint=not cold,
        has_label_hint=bool(hint),
        label_mode_enabled=bool(hint),
    )
    logger.debug("locator heal strategy=%s hint=%r", strategy.value, hint)

    cands = candidates_from_driver(driver)
    if not cands:
        emit_heal_miss(
            old_type=locator_type,
            old_value=locator_value,
            reason="no_dom_candidates",
        )
        return None

    pick = None
    if strategy in (HealStrategy.LABEL_FIRST, HealStrategy.LABEL_THEN_FINGERPRINT):
        pick = pick_by_label_hint(
            hint,
            cands,
            locator_type=locator_type,
            locator_value=locator_value,
        )
        if pick is None and strategy == HealStrategy.LABEL_FIRST and cold:
            emit_heal_miss(
                old_type=locator_type,
                old_value=locator_value,
                reason="label_no_match",
            )
            return None

    if pick is None:
        if fp is None:
            weak_id = ""
            if locator_type == "id":
                weak_id = locator_value
            elif locator_type == "css" and locator_value.startswith("#"):
                weak_id = locator_value[1:].split(":")[0].split("[")[0]
            weak_name = locator_value if locator_type == "name" else ""
            if not weak_id and not weak_name:
                emit_heal_miss(
                    old_type=locator_type,
                    old_value=locator_value,
                    reason="cold_no_signal",
                )
                return None
            fp = fingerprint_from_attrs(
                locator_type=locator_type,
                locator_value=locator_value,
                id=weak_id,
                name=weak_name,
                text="",
            )
        pick = pick_best_heal(fp, cands, score_cap=score_cap)
        if pick is None:
            emit_heal_miss(
                old_type=locator_type,
                old_value=locator_value,
                reason="below_score_cap" + ("|cold_start" if cold else ""),
            )
            return None
    nt, nv = suggest_locator(pick.candidate)
    emit_heal_ok(
        old_type=locator_type,
        old_value=locator_value,
        new_type=nt,
        new_value=nv,
        score=pick.score,
    )
    # Keep fingerprint under the *broken* key so next miss still matches.
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type=locator_type,
            locator_value=locator_value,
            tag=pick.candidate.tag,
            id=pick.candidate.id,
            name=pick.candidate.name,
            text=pick.candidate.text,
            role=pick.candidate.role,
            aria_label=pick.candidate.aria_label,
            classes=pick.candidate.classes,
            parent_tag=pick.candidate.parent_tag,
        )
    )
    if not cold:
        remember_fingerprint(
            fingerprint_from_attrs(
                locator_type=nt,
                locator_value=nv,
                tag=pick.candidate.tag,
                id=pick.candidate.id,
                name=pick.candidate.name,
                text=pick.candidate.text,
                role=pick.candidate.role,
                aria_label=pick.candidate.aria_label,
                classes=pick.candidate.classes,
                parent_tag=pick.candidate.parent_tag,
            )
        )
    return nt, nv, pick.score
