# -*- coding: utf-8 -*-
"""
PageResolver: page.element → constructor; page.action; payload→slot bind.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from core.errors import WiredError
from core.page_layout import materialize_page


def _as_dict(obj: Any) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return dict(obj)


class PageResolver:
    def __init__(self, pages):
        # pages: Dict[str, Page|dict] — макет constructor материализуется в elements/actions
        raw = pages or {}
        self.pages = {key: materialize_page(page) for key, page in raw.items()}

    def _page(self, page_key: str) -> dict:
        page = self.pages.get(page_key)
        if page is None:
            raise WiredError(f"Страница {page_key!r} не найдена")
        return _as_dict(page)

    def get_element(self, page_key: str, element_id: str) -> dict:
        page = self._page(page_key)
        for elem in page.get("elements") or []:
            ed = _as_dict(elem)
            if ed.get("id") == element_id:
                return ed
        raise WiredError(f"Элемент {page_key}.{element_id} не найден")

    def resolve_constructor(self, ref: str) -> Optional[str]:
        """
        page.element → element.constructor.
        Несуществующая страница/элемент → None (не трогаем обычные ${var.path}).
        """
        if not ref or "." not in ref:
            return None
        page_key, element_key = ref.split(".", 1)
        if page_key not in self.pages:
            return None
        try:
            elem = self.get_element(page_key, element_key)
        except WiredError:
            return None
        ctor = elem.get("constructor")
        return ctor if isinstance(ctor, str) else None

    # backward-compatible alias
    def resolve(self, ref: str) -> Optional[dict]:
        ctor = self.resolve_constructor(ref)
        if ctor is None:
            return None
        return {"constructor": ctor}

    def get_action(self, page_key: str, action_id: str) -> dict:
        page = self._page(page_key)
        for act in page.get("actions") or []:
            ad = _as_dict(act)
            if ad.get("id") == action_id:
                return ad
        raise WiredError(f"Действие {page_key}.{action_id} не найдено")

    def slotted_elements(self, page_key: str) -> List[dict]:
        page = self._page(page_key)
        out = []
        for elem in page.get("elements") or []:
            ed = _as_dict(elem)
            if ed.get("slot") is not None and ed.get("slot") != "":
                out.append(ed)
        return out

    def bind_payload(self, page_key: str, payload: Any) -> Dict[str, Any]:
        """
        Payload → локальные переменные по slot.
        Имя переменной = id элемента (action пишет ${username} / ${email}).
        """
        slotted = self.slotted_elements(page_key)
        if not slotted:
            raise WiredError(
                f"page_call {page_key}: payload передан, но на странице нет элементов со slot"
            )

        binds: Dict[str, Any] = {}
        used_keys: set = set()

        if isinstance(payload, (list, tuple)):
            # плотный: slot 1→[0], 2→[1], …
            numbered = []
            for ed in slotted:
                slot = ed["slot"]
                try:
                    n = int(slot)
                except (TypeError, ValueError):
                    raise WiredError(
                        f"Список-payload требует числовые slot, получено {slot!r} "
                        f"у {page_key}.{ed.get('id')}"
                    )
                numbered.append((n, ed))
            numbered.sort(key=lambda x: x[0])
            expected = list(range(1, len(numbered) + 1))
            got = [n for n, _ in numbered]
            if got != expected:
                raise WiredError(
                    f"page_call {page_key}: дырка/сдвиг в slot {got}, ожидалось {expected}"
                )
            if len(payload) != len(numbered):
                raise WiredError(
                    f"page_call {page_key}: длина payload {len(payload)} ≠ слотов {len(numbered)}"
                )
            for (n, ed), value in zip(numbered, payload):
                binds[str(ed["id"])] = value
            return binds

        if isinstance(payload, dict):
            slot_index: Dict[str, dict] = {}
            for ed in slotted:
                slot = ed["slot"]
                slot_index[str(slot)] = ed
                slot_index[str(ed["id"])] = ed  # имя = id тоже ок
            for key, value in payload.items():
                sk = str(key)
                ed = slot_index.get(sk)
                if ed is None:
                    raise WiredError(
                        f"page_call {page_key}: лишний ключ payload {key!r}"
                    )
                eid = str(ed["id"])
                if eid in used_keys:
                    raise WiredError(
                        f"page_call {page_key}: слот {key!r} задан дважды"
                    )
                used_keys.add(eid)
                binds[eid] = value
            missing = [str(ed["id"]) for ed in slotted if str(ed["id"]) not in used_keys]
            if missing:
                raise WiredError(
                    f"page_call {page_key}: не заполнены slot-поля {missing}"
                )
            return binds

        raise WiredError(
            f"page_call {page_key}: payload должен быть list или dict, получено {type(payload)}"
        )
