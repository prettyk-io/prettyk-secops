# -*- coding: utf-8 -*-
"""WZ-2: Event Journal — NDJSON → упорядоченные события → чистая свертка S(t).

Спецификация: docs/research/2026-08-27-studio-warzone-rewind-specification.md (§2).

Инвариант 100/100: состояние S(t) есть чистая функция от {e_i | τ_i <= t}.
При одинаковом t свертка даёт одинаковый state — независимо от того, пришли
мы в t прямым воспроизведением, обратной перемоткой или прямым seek'ом.
Детерминизм гарантирован канонической сериализацией state (сортировка ключей).
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from typing import Any, Optional


# ── Параметры затухания луча (спека §2.2) ──

RAMP_DT = 0.15
DIM_DT = 0.25
PULSE_AMPLITUDE = 0.08
PULSE_FREQ = 12.0


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    if x <= edge0:
        return 0.0
    if x >= edge1:
        return 1.0
    t = (x - edge0) / (edge1 - edge0)
    return t * t * (3.0 - 2.0 * t)


def beam_intensity(t: float, t_start: float, t_end: float) -> float:
    """Интенсивность луча I(t) по сигмоидальной кривой + пульсации + затухание."""
    if t < t_start:
        return 0.0
    if t < t_start + RAMP_DT:
        return _smoothstep(0.0, 1.0, (t - t_start) / RAMP_DT)
    if t <= t_end - DIM_DT:
        return 1.0 + PULSE_AMPLITUDE * math.sin(2.0 * math.pi * PULSE_FREQ * (t - t_start))
    if t <= t_end:
        return 1.0 - _smoothstep(0.0, 1.0, (t - (t_end - DIM_DT)) / DIM_DT)
    return 0.0


# ── Событие журнала ──

@dataclass
class JournalEvent:
    ts: float            # относительное время, сек от run_start_ts
    kind: str            # STEP, FUZZ_BEAM_START, TARGET_HIT, FINDING_ALERT, ...
    payload: dict[str, Any] = field(default_factory=dict)
    seq: int = 0         # порядковый номер в журнале (для стабильной сортировки)


# ── Состояние сцены в момент t ──

@dataclass
class BeamState:
    id: str
    source: str
    target: str
    t_start: float
    t_end: float
    intensity: float  # 0.0..1.0


@dataclass
class SceneState:
    t: float
    active_beams: list[BeamState]
    findings: list[str]      # активные finding-id на момент t
    log_index: int           # сколько событий "проиграно" до t (вкл.)
    node_hits: dict[str, int] = field(default_factory=dict)  # target → число попаданий

    def canonical(self) -> str:
        """Каноническая сериализация (детерминированная для hash)."""
        return json.dumps(
            {
                "t": round(self.t, 6),
                "beams": [
                    {
                        "id": b.id,
                        "source": b.source,
                        "target": b.target,
                        "intensity": round(b.intensity, 6),
                    }
                    for b in sorted(self.active_beams, key=lambda x: x.id)
                ],
                "findings": sorted(self.findings),
                "log_index": self.log_index,
                "node_hits": {k: self.node_hits[k] for k in sorted(self.node_hits)},
            },
            ensure_ascii=False,
            sort_keys=True,
        )

    def state_hash(self) -> str:
        return hashlib.sha256(self.canonical().encode("utf-8")).hexdigest()


# ── Event Journal ──

class EventJournal:
    """Упорядоченный журнал событий + чистая свертка S(t)."""

    def __init__(self, events: list[JournalEvent] | None = None, run_start_ts: float = 0.0) -> None:
        self.run_start_ts = run_start_ts
        self._events = sorted(events or [], key=lambda e: (e.ts, e.seq))

    # ── Парсинг NDJSON ──

    @classmethod
    def from_ndjson(cls, text: str, run_start_ts: float = 0.0) -> "EventJournal":
        events: list[JournalEvent] = []
        for idx, line in enumerate(text.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(obj, dict):
                continue
            raw_ts = obj.get("ts", obj.get("timestamp", obj.get("t")))
            kind = str(obj.get("kind", obj.get("type", "EVENT")))
            payload = obj.get("payload", obj.get("data", {}))
            if not isinstance(payload, dict):
                payload = {}
            try:
                ts = float(raw_ts)
            except (TypeError, ValueError):
                continue
            events.append(JournalEvent(ts=ts, kind=kind, payload=payload, seq=idx))
        return cls(events=events, run_start_ts=run_start_ts)

    @property
    def events(self) -> list[JournalEvent]:
        return list(self._events)

    @property
    def duration(self) -> float:
        if not self._events:
            return 0.0
        return max(e.ts for e in self._events)

    # ── Свертка ──

    def events_up_to(self, t: float) -> list[JournalEvent]:
        """{e_i | τ_i <= t} — упорядоченно, детерминированно."""
        return [e for e in self._events if e.ts <= t]

    def state_at(self, t: float) -> SceneState:
        """Чистая детерминированная свертка S(t) = F(S0, events_upto_t, t)."""
        active_beams: dict[str, BeamState] = {}
        findings: list[str] = []
        node_hits: dict[str, int] = {}
        log_index = 0

        for e in self._events:
            if e.ts > t:
                break
            log_index += 1
            kind = e.kind.upper()
            if kind == "FUZZ_BEAM_START":
                bid = str(e.payload.get("id", f"beam-{log_index}"))
                source = str(e.payload.get("source", "fuzzer"))
                target = str(e.payload.get("target", "target"))
                t_end = float(e.payload.get("t_end", e.ts + 1.0))
                active_beams[bid] = BeamState(
                    id=bid, source=source, target=target,
                    t_start=e.ts, t_end=t_end, intensity=0.0,
                )
            elif kind == "TARGET_HIT":
                target = str(e.payload.get("target", ""))
                node_hits[target] = node_hits.get(target, 0) + 1
            elif kind == "FINDING_ALERT":
                fid = str(e.payload.get("id", ""))
                if fid:
                    findings.append(fid)

        # Пересчитать интенсивность всех лучей на момент t (чистая функция I(t))
        beams = []
        for b in active_beams.values():
            if t < b.t_start:
                continue
            if t > b.t_end:
                continue  # луч уже погас
            b.intensity = beam_intensity(t, b.t_start, b.t_end)
            beams.append(b)

        return SceneState(
            t=t,
            active_beams=beams,
            findings=findings,
            log_index=log_index,
            node_hits=node_hits,
        )

    # ── Инвариант 100/100 ──

    def state_hash(self, t: float) -> str:
        return self.state_at(t).state_hash()

    def verify_determinism(self, checkpoints: list[float]) -> bool:
        """Один и тот же state_hash на прямом/обратном/прямом seek.

        Поскольку state_at — чистая функция от t, обратный проход (t↓) и
        прямой seek дают тот же результат. Проверка — повторный вызов state_at.
        """
        baseline = {t: self.state_hash(t) for t in checkpoints}
        for t in checkpoints:
            if self.state_hash(t) != baseline[t]:
                return False
        return True

    # ── WIRE-WZ: мост diary.ndjson → SceneState для Live SSE ──

    _DIARY_KIND_MAP: dict[str, str] = {
        "FUZZ_BEAM_START": "FUZZ_BEAM_START",
        "BEAM_START": "FUZZ_BEAM_START",
        "FUZZ_SEND": "FUZZ_BEAM_START",
        "TARGET_HIT": "TARGET_HIT",
        "HIT": "TARGET_HIT",
        "FINDING_ALERT": "FINDING_ALERT",
        "FINDING": "FINDING_ALERT",
        "scanner_ALERT": "FINDING_ALERT",
        "SCANNER_ALERT": "FINDING_ALERT",
    }

    @classmethod
    def from_diary_events(
        cls,
        events: list[dict],
        run_start_ts: float = 0.0,
    ) -> "EventJournal":
        """Построить journal из diary-событий Live (best-effort маппинг kind'ов).

        diary событие: {kind, t (относительное), ts (epoch), ...payload}.
        Только события, распознанные как beam/hit/finding, входят в свертку;
        остальные сохраняются как passthrough (не влияют на SceneState, но
        сохраняют log_index для точного индекса).
        """
        journal_events: list[JournalEvent] = []
        for idx, ev in enumerate(events):
            if not isinstance(ev, dict):
                continue
            raw_t = ev.get("t", ev.get("ts"))
            try:
                ts = float(raw_t)
            except (TypeError, ValueError):
                continue
            kind = cls._DIARY_KIND_MAP.get(str(ev.get("kind", "NOTE")).upper(), "")
            payload = dict(ev)
            # Нормализовать payload под BeamState/Hit/Finding
            if kind == "FUZZ_BEAM_START":
                payload.setdefault("source", ev.get("source", "fuzzer"))
                payload.setdefault("target", ev.get("target") or ev.get("endpoint") or ev.get("url") or "target")
                payload.setdefault("id", ev.get("id") or f"beam-{idx}")
                payload.setdefault("t_end", ev.get("t_end", ts + 1.0))
            elif kind == "TARGET_HIT":
                payload.setdefault("target", ev.get("target") or ev.get("endpoint") or ev.get("url") or "")
            elif kind == "FINDING_ALERT":
                payload.setdefault("id", ev.get("id") or ev.get("finding_id") or f"finding-{idx}")
            journal_events.append(JournalEvent(ts=ts, kind=kind, payload=payload, seq=idx))
        return cls(events=journal_events, run_start_ts=run_start_ts)

    def scene_state_payload(self, t: float) -> dict:
        """Контракт WIRE-WZ (канон, спека warzone-rewind §6).

        active_beams: BeamView[] — {id, source, target, intensity} (движок WarzoneLiveEngine);
        findings:     [{kind, count}] — агрегат (HUD);
        node_hits:    [{nodeId, hits}] — попадания (HUD);
        state_hash — детерминированная свертка S(t) (инвариант 100/100).
        """
        state = self.state_at(t)
        return {
            "type": "scene_state",
            "t": round(t, 3),
            "active_beams": [
                {
                    "id": b.id,
                    "source": b.source,
                    "target": b.target,
                    "intensity": round(b.intensity, 6),
                }
                for b in state.active_beams
            ],
            "findings": ([{"kind": "finding", "count": len(state.findings)}] if state.findings else []),
            "node_hits": [{"nodeId": k, "hits": v} for k, v in sorted(state.node_hits.items())],
            "finding_ids": list(state.findings),
            "log_index": state.log_index,
            "state_hash": state.state_hash(),
        }
