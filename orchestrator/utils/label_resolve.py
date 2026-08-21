# -*- coding: utf-8 -*-
"""
DISC-2: resolve UI control by visible label (SecOps discovery).

Not Playwright product; classical DOM heuristics + soft ambiguous rank.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, List, Optional, Sequence

logger = logging.getLogger("orchestrator")

_DOM_LABEL_JS = r"""
var want = (arguments[0] || '').toString().trim().toLowerCase();
function norm(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
}
function visible(el) {
  if (!el) return false;
  var st = window.getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden') return false;
  var r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
function enabled(el) {
  if (!el) return false;
  if (el.disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}
var out = [];
var labels = document.querySelectorAll('label');
for (var i = 0; i < labels.length && out.length < 40; i++) {
  var lab = labels[i];
  var t = norm(lab.innerText || lab.textContent);
  if (!t || (t !== want && t.indexOf(want) < 0 && want.indexOf(t) < 0)) continue;
  var ctrl = null;
  var fr = lab.getAttribute('for');
  if (fr) ctrl = document.getElementById(fr);
  if (!ctrl) ctrl = lab.querySelector('input,textarea,select,button');
  if (!ctrl) {
    var n = lab.nextElementSibling;
    if (n && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(n.tagName)) ctrl = n;
  }
  if (!ctrl) continue;
  out.push({
    key: 'lab-' + i,
    kind: 'label_for',
    tag: (ctrl.tagName || '').toLowerCase(),
    id: ctrl.id || '',
    name: ctrl.getAttribute('name') || '',
    text: t,
    aria: ctrl.getAttribute('aria-label') || '',
    in_form: !!ctrl.closest('form'),
    near_password: !!(ctrl.closest('form') && ctrl.closest('form').querySelector('input[type=password]')),
    visible: visible(ctrl),
    enabled: enabled(ctrl),
    suggested_type: ctrl.id ? 'id' : (ctrl.getAttribute('name') ? 'name' : 'css'),
    suggested_value: ctrl.id || ctrl.getAttribute('name') || (ctrl.tagName || '').toLowerCase()
  });
}
var nodes = document.querySelectorAll(
  'a,button,input,select,textarea,[role="button"],[role="link"]'
);
for (var j = 0; j < nodes.length && out.length < 80; j++) {
  var el = nodes[j];
  var blob = norm(
    (el.getAttribute('aria-label') || '') + ' ' +
    (el.innerText || el.value || el.getAttribute('placeholder') || '')
  );
  if (!blob) continue;
  if (blob !== want && blob.indexOf(want) < 0) continue;
  out.push({
    key: 'node-' + j,
    kind: 'text_or_aria',
    tag: (el.tagName || '').toLowerCase(),
    id: el.id || '',
    name: el.getAttribute('name') || '',
    text: blob,
    aria: el.getAttribute('aria-label') || '',
    in_form: !!el.closest('form'),
    near_password: !!(el.closest('form') && el.closest('form').querySelector('input[type=password]')),
    visible: visible(el),
    enabled: enabled(el),
    suggested_type: el.id ? 'id' : (el.getAttribute('name') ? 'name' : 'css'),
    suggested_value: el.id || el.getAttribute('name') || (el.tagName || '').toLowerCase()
  });
}
return out;
"""


@dataclass(frozen=True)
class LabelHit:
    key: str
    kind: str
    tag: str
    id: str
    name: str
    text: str
    visible: bool
    enabled: bool
    in_form: bool
    near_password: bool
    suggested_type: str
    suggested_value: str
    score: float = 0.0


class LabelResolveError(Exception):
    """0 matches, disabled, or ambiguous without soft."""


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def score_label_hit(hit: LabelHit, want: str) -> float:
    w = _norm(want)
    sc = 0.0
    blob = _norm(hit.text)
    if blob == w:
        sc += 1.0
    elif w and (blob.startswith(w) or w.startswith(blob)) and min(len(w), len(blob)) >= 3:
        # prefix only — не синонимы Логин↔Email
        sc += 0.7
    elif w and w in blob:
        sc += 0.55
    else:
        sc += 0.25
    if hit.visible:
        sc += 0.35
    if hit.enabled:
        sc += 0.25
    if hit.in_form:
        sc += 0.15
    if hit.near_password:
        sc += 0.1
    if hit.kind == "label_for":
        sc += 0.1
    return sc


def hits_from_raw(rows: Sequence[Any], want: str) -> List[LabelHit]:
    out: List[LabelHit] = []
    if not isinstance(rows, list):
        return out
    w = _norm(want)
    for row in rows:
        if not isinstance(row, dict):
            continue
        text = _norm(str(row.get("text") or row.get("aria") or ""))
        # Exact-first: оператор пишет текст как на экране (без автосинонимов).
        if w and text != w and w not in text and text not in w:
            continue
        base = LabelHit(
            key=str(row.get("key") or len(out)),
            kind=str(row.get("kind") or ""),
            tag=str(row.get("tag") or ""),
            id=str(row.get("id") or ""),
            name=str(row.get("name") or ""),
            text=text,
            visible=bool(row.get("visible")),
            enabled=bool(row.get("enabled")),
            in_form=bool(row.get("in_form")),
            near_password=bool(row.get("near_password")),
            suggested_type=str(row.get("suggested_type") or "css"),
            suggested_value=str(row.get("suggested_value") or ""),
            score=0.0,
        )
        out.append(
            LabelHit(
                key=base.key,
                kind=base.kind,
                tag=base.tag,
                id=base.id,
                name=base.name,
                text=base.text,
                visible=base.visible,
                enabled=base.enabled,
                in_form=base.in_form,
                near_password=base.near_password,
                suggested_type=base.suggested_type,
                suggested_value=base.suggested_value,
                score=score_label_hit(base, want),
            )
        )
    exact = [h for h in out if h.text == w]
    ranked = exact if exact else out
    ranked.sort(key=lambda h: h.score, reverse=True)
    return ranked


def collect_label_hits(driver: Any, label: str) -> List[LabelHit]:
    if driver is None:
        return []
    want = (label or "").strip()
    if not want:
        return []
    try:
        raw = driver.execute_script(_DOM_LABEL_JS, want)
    except Exception as e:
        logger.debug("label_resolve scrape failed: %s", e)
        return []
    return hits_from_raw(raw, want)


def _publish(kind: str, msg: str) -> None:
    try:
        from utils.diary_bus import publish

        publish(kind, msg, channel="diary")
    except Exception:
        pass


def _set_meta_label(payload: dict) -> None:
    try:
        from utils.diary_bus import set_meta

        set_meta(locator_label_last=payload)
    except Exception:
        pass


def pick_label_hit(
    hits: Sequence[LabelHit],
    *,
    label: str,
    soft: bool,
    require_enabled: bool = True,
) -> LabelHit:
    if not hits:
        msg = f"label resolve MISS | {label!r} | no_matches"
        logger.warning(msg)
        _publish("LABEL_MISS", msg)
        _set_meta_label({"status": "miss", "label": label, "reason": "no_matches"})
        raise LabelResolveError(msg)

    best = hits[0]

    if len(hits) > 1 and not soft:
        msg = f"label resolve AMBIGUOUS | {label!r} | n={len(hits)} (hard — no guess)"
        logger.error(msg)
        _publish("LABEL_AMBIGUOUS", msg)
        _set_meta_label(
            {
                "status": "ambiguous",
                "label": label,
                "n": len(hits),
                "soft": False,
            }
        )
        raise LabelResolveError(msg)

    if len(hits) > 1 and soft:
        msg = (
            f"label resolve AMBIGUOUS | {label!r} | n={len(hits)} → pick "
            f"{best.suggested_type} {best.suggested_value} (score={best.score:.2f})"
        )
        logger.warning(msg)
        _publish("LABEL_AMBIGUOUS", msg)

    if require_enabled and best.visible and not best.enabled:
        msg = f"label resolve DISABLED | {label!r} | {best.suggested_type} {best.suggested_value}"
        logger.warning(msg)
        _publish("LABEL", msg)
        _set_meta_label(
            {
                "status": "disabled",
                "label": label,
                "new_type": best.suggested_type,
                "new_value": best.suggested_value,
            }
        )
        raise LabelResolveError(msg)

    if require_enabled and not best.visible:
        msg = f"label resolve HIDDEN | {label!r}"
        logger.warning(msg)
        _publish("LABEL", msg)
        raise LabelResolveError(msg)

    ok = (
        f"label resolve OK | {label!r} → {best.suggested_type} {best.suggested_value} "
        f"(score={best.score:.2f}, n={len(hits)})"
    )
    logger.info(ok)
    _publish("LABEL", ok)
    _set_meta_label(
        {
            "status": "ok",
            "label": label,
            "new_type": best.suggested_type,
            "new_value": best.suggested_value,
            "score": round(best.score, 4),
            "n": len(hits),
        }
    )
    return best


def resolve_label_locator(
    driver: Any,
    label: str,
    *,
    soft: bool,
) -> tuple[str, str]:
    """Return (strategy, selector) for subsequent Selene locate / click."""
    hits = collect_label_hits(driver, label)
    hit = pick_label_hit(hits, label=label, soft=soft)
    return hit.suggested_type, hit.suggested_value


def _assert_fillable(hit: LabelHit, label: str) -> None:
    tag = (hit.tag or "").lower()
    if tag in ("input", "textarea", "select"):
        return
    msg = f"label resolve NOT_EDITABLE | {label!r} | tag={tag or '?'}"
    logger.warning(msg)
    _publish("LABEL", msg)
    _set_meta_label(
        {
            "status": "not_editable",
            "label": label,
            "new_type": hit.suggested_type,
            "new_value": hit.suggested_value,
        }
    )
    raise LabelResolveError(msg)


def perform_label_action(
    adapter: Any,
    *,
    action: str,
    label: str,
    text: str = "",
    soft: bool,
    timeout=None,
) -> None:
    """
    Resolve label → locator → click/send_keys.
    One soft retry if first act fails and n>1 was available.
    """
    driver = getattr(adapter, "driver", None)
    hits = collect_label_hits(driver, label)
    hit = pick_label_hit(hits, label=label, soft=soft)
    if action == "send_keys":
        _assert_fillable(hit, label)
    st, sv = hit.suggested_type, hit.suggested_value
    try:
        if action == "click":
            adapter.click(st, sv, timeout=timeout)
        elif action == "send_keys":
            adapter.send_keys(st, sv, text, timeout=timeout)
        else:
            raise LabelResolveError(f"unsupported label action {action}")
    except LabelResolveError:
        raise
    except Exception:
        if not soft or len(hits) < 2:
            raise
        alt = hits[1]
        if action == "send_keys":
            _assert_fillable(alt, label)
        msg = (
            f"label resolve RETRY | {label!r} | after fail → "
            f"{alt.suggested_type} {alt.suggested_value}"
        )
        logger.warning(msg)
        _publish("LABEL_AMBIGUOUS", msg)
        _set_meta_label(
            {
                "status": "ok",
                "label": label,
                "new_type": alt.suggested_type,
                "new_value": alt.suggested_value,
                "n": len(hits),
                "retry": True,
            }
        )
        if action == "click":
            adapter.click(alt.suggested_type, alt.suggested_value, timeout=timeout)
        else:
            adapter.send_keys(
                alt.suggested_type, alt.suggested_value, text, timeout=timeout
            )
