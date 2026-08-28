"""
COS-L11: Evidence Chain — иммутабельный криптографический лог.

EvidenceLedger — append-only лог с SHA-256 хешированием каждой записи
и возможностью проверки целостности всей цепочки.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class EvidenceEntry:
    """Одна запись в Evidence Ledger — иммутабельна."""
    index: int
    timestamp: float
    type: str
    content: dict[str, Any]
    provenance: str  # источник (run_id, batch_id, module)
    prev_hash: str
    hash: str


class EvidenceLedger:
    """Иммутабельный append-only лог с SHA-256."""

    def __init__(self) -> None:
        self._entries: list[EvidenceEntry] = []
        self._last_hash = "0" * 64  # genesis hash

    @property
    def entries(self) -> tuple[EvidenceEntry, ...]:
        """Все записи (read-only)."""
        return tuple(self._entries)

    @property
    def length(self) -> int:
        """Количество записей."""
        return len(self._entries)

    def add_entry(
        self, type: str, content: dict[str, Any], provenance: str,
    ) -> EvidenceEntry:
        """Добавляет запись в лог с хешированием."""
        ts = time.time()
        entry_data = {
            "index": len(self._entries),
            "timestamp": ts,
            "type": type,
            "content": content,
            "provenance": provenance,
            "prev_hash": self._last_hash,
        }
        entry_hash = self._hash_entry(entry_data)

        entry = EvidenceEntry(
            index=entry_data["index"],
            timestamp=ts,
            type=type,
            content=content,
            provenance=provenance,
            prev_hash=self._last_hash,
            hash=entry_hash,
        )
        self._entries.append(entry)
        self._last_hash = entry_hash
        return entry

    def verify_chain(self) -> bool:
        """Проверяет целостность всей цепочки."""
        expected_prev = "0" * 64
        for i, entry in enumerate(self._entries):
            if entry.index != i:
                return False
            if entry.prev_hash != expected_prev:
                return False
            recalc_data = {
                "index": entry.index,
                "timestamp": entry.timestamp,
                "type": entry.type,
                "content": entry.content,
                "provenance": entry.provenance,
                "prev_hash": entry.prev_hash,
            }
            recalc_hash = self._hash_entry(recalc_data)
            if recalc_hash != entry.hash:
                return False
            expected_prev = entry.hash
        return True

    def tamper(self, index: int, field: str, value: Any) -> None:
        """Только для тестирования: портит запись для проверки verify_chain."""
        if 0 <= index < len(self._entries):
            entry = self._entries[index]
            # Хак: заменяем frozen dataclass через vars
            modified = dict(vars(entry))
            modified[field] = value
            self._entries[index] = EvidenceEntry(**modified)

    @staticmethod
    def _hash_entry(data: dict) -> str:
        """SHA-256 хеш записи."""
        canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        """Сериализация в dict (для экспорта/API)."""
        return {
            "entries": [
                {
                    "index": e.index,
                    "timestamp": e.timestamp,
                    "type": e.type,
                    "content": e.content,
                    "provenance": e.provenance,
                    "prev_hash": e.prev_hash,
                    "hash": e.hash,
                }
                for e in self._entries
            ],
            "length": len(self._entries),
            "verified": self.verify_chain(),
            "last_hash": self._last_hash,
        }

    def __len__(self) -> int:
        return len(self._entries)

    def __getitem__(self, index: int) -> EvidenceEntry:
        return self._entries[index]