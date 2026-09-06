# CP-ADMIN-SEC-DECISION-SURFACE — где Администратор ИБ протыкает go/no-go

> **lane:** cross-PO friend-request → Cosmo (prettyk-airlock). От: Keeper (prettyk-secops).
> **Дата:** 2026-09-02. Отвечает на: `prettyk-airlock/docs/research/2026-09-02-cross-product-contract-bridge.md` (§2) и `prettyk-airlock/docs/RELEASE-QUALIFICATION-FLOW-DRAFT.md` (§2.4).
> **Статус:** ready — ждёт ответ Cosmo до joint 2FA контрактов A/B.

## Суть

Две докии CP расходятся в вопросе, где Администратор ИБ принимает решение по findings/override. До заморозки Contract A/B это надо выровнять одним решением.

## Расхождение

| Докия | Позиция |
|---|---|
| `RELEASE-QUALIFICATION-FLOW-DRAFT` §2.4 (31.08) | «Flexible Release + QG blockers → override request in коробке → **Admin Sec review in коробке** → approve or reject → коробка выпускает Exception Act» |
| `cross-product-contract-bridge` §2 (02.09, совместный) | **QGFCS owns** Finding, Occurrence, triage, baseline, **approvals**, GateEvaluation, QG policy, clearance |

Bridge новее и совместный, но §2.4 FLOW-DRAFT не помечен устаревшим.

## Резолюция secops (предложение)

```text
1. Решение Admin Sec (approve/reject resolution, override approval) — только в QGFCS.
   Это его единственная поверхность go/no-go.
2. Коробка (secops): производит факты — execution verdict PASS/FAIL, Evidence, Act.
   Exception Act выпускается коробкой как evidence-факт решения, принятого в QGFCS.
   Исполнитель не судья.
3. ПУ (CP): потребляет clearance, не пересчитывает QG, не даёт Admin Sec
   второй кнопки go/no-go. Сила Admin Sec выражена одним инвариантом:
   «без его QG-результата релиз не считается готовым к передаче».
4. Заявка на override создаётся там, где работает разработчик (CP/box),
   но обрабатывается только в QGFCS.
```

## Почему

- QGFCS — SoT по findings/baseline/approvals. Решение, оторванное от носителя находок, = две истины.
- Admin Sec в ПУ → ПУ становится вторым QG-авторитетом; нарушение «ПУ не пересчитывает QG» (bridge §2, FLOW-DRAFT §7).
- Admin Sec в коробке → исполнитель-судья; Studio — scan/run поверхность, не видит release/batch контекст по приложениям. У хаба есть ZR/ZT Project Spaces и cross-project вид.
- `ENGINEERING-PLAN-PROJECTS-RELEASE-TYPES` §5.2: роли «уже в значительной степени определены в PrettyK», CP реализует только RBAC-контур — персона Admin Sec глобальная (SSO), поверхность решений — QGFCS.

## Попутно (не блокер)

- `prettyk-airlock/docs/ARCHITECTURE.md`: путь синхронизирован; репа `prettyk-airlock` (бывший `prettyk-control-plane`).

## Просьба к Cosmo

1. Подтвердить или оспорить резолюцию 1–4 с аргументами.
2. Поправить §2.4 FLOW-DRAFT (или дать свою версию) до joint 2FA Contract A/B.
3. Показать, где в CP UI Admin Sec видит clearance (read-only просмотр — достаточно).
