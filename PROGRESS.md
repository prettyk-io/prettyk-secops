# PROGRESS — текущее состояние репозитория

> **Зачем:** worker начинает КАЖДУЮ сессию с чтения этого файла + git log --oneline -10.
> Без этого worker тратит контекст на угадывание состояния.
> **Формат:** факты, не проза. Последние действия вверху.
> **Пишет:** Keeper или worker по факту завершения сессии.
> **Правило:** worker читает это ПЕРВЫМ действием после pwd.

## Последнее действие
2026-09-20 | Boss (worker, БЕЗ приёмки) | BBA-2..6 реализованы до зелени. BBA-2 letterbox/DPR координатный маппинг (`computeFittedContentRect`+`computeCanvasClickToViewport`, 11 тестов) + worker-bound observe binding (фикс потери клика per-session). BBA-3 input-расширение: keyboard/wheel/drag handlers + `/api/browser/{viewport,keyboard,wheel,drag}` роуты, input/change binding → type-события, value-classification fix (password→secret, email). BBA-4 детерминизм accept/reject (+5 тестов: accept=1 step/уникальный id, reject=0, no dupes, no plaintext). BBA-5 negative/reconnect: `_cmd_observe_event` liveness отдельно от очереди (закрыл PK-DEBT-RED 2 red), +5 negative-тестов. BBA-6 live integration `test_browser_authoring_live.py` (context_ensure→observe→click→event, реальный CDP Chrome/128 в playwright-authoring, skip при недоступном стенде). Срез: browser-контур без env 141 passed/1 skipped; live 1 passed; frontend 39 passed. tsc — только pre-existing EvidencePanel (admin/results, чужой WIP). | orchestrator/browser/browser_service.py

2026-09-20 | Flash | PRD-1..4 закрыты. (1) PRD-1 HMAC outbound: `IntakeSigner`+`verify_envelope` (конверт `{contract_version,scan_id,event_type,signature,ts,payload}`, hmac-sha256, canonical sorted-keys, constant-time), airgap `intake_envelope.json`; +12 тестов (test_intake_transport 19/19). (2) PRD-2 Contract A: `make_fuzz_correlation` (G1, parent_run_id=run_id+валидатор 12hex), persistent `act_ref` attach/verify (G2), `canonical_artifact_ref` (G3), `idempotency_key`=sha256(scan_id:1.0)[:32] (G5), `scope_tuple`/`is_comparable_with` (G6); DTO+JSON-schema+contract-doc обновлены (test_contract_a+intake 32/32). (3) PRD-3 live smoke: playwright-authoring healthy, CDP :9223 Chrome/128, viewport :9224 JPEG 1919×887 (ffd8), Editor :5173 HTTP 200 + isBundleMode=false. (4) PRD-4 живая миграция: Keycloak realm `prettyk` (client prettyk-editor, 4 роли/4 юзера, discovery 200), Sonar UP — `prettyk-backend` (ncloc 55200/255 файлов), `prettyk-frontend` (94461/730), scanner-токен valid. | orchestrator/contracts/studio_run_output.py

## Текущее состояние
Contract A расширен (HMAC PRD-1 + G1/G2/G3/G5/G6 PRD-2); лаб поднят: Keycloak :8082 (realm prettyk), SonarQube :9000 (prettyk-backend/frontend), playwright-authoring :7902/:9223, relay :9224, Editor :5173. **Boss (BBA):** BBA-1..6 реализованы (browser-контур 141 passed/1 skipped без env, live BBA-6 1 passed, frontend 39 passed). BBA-2/3/4/5/6 ждут приёмки Максима (worker БЕЗ «Принято»). tsc-остаток — pre-existing `EvidencePanel.tsx` (admin/results, MUI Typography-пропсы + опечатки `tic`/`applicaton_name`/`lnegth`/`critcal`), чужой WIP, не BBA-скоп. Commit pending.

## Следующее действие
Приёмка Arbiter (HUB-001 intake); Hub кладёт `PRETTYK_INTAKE_HMAC_SECRET` и верифицирует конверт (verify_envelope). Максим принимает BBA-2..6 (worker-отчёт без приёмки). При живом стенде — BBA-2/6 eyes-on верификация (BrowserStage клик → proposal) через Editor :5173 + relay :9224. G7 (pull vs push) — отдельная сшибка после приёмки.

---

## История (последние 5)
2026-09-20 | Boss (worker, БЕЗ приёмки) | BBA-2..6 до зелени: letterbox/DPR маппинг, worker-bound binding, keyboard/wheel/drag + роуты, input binding→type + value-classify fix, BBA-4 accept/reject детерминизм, BBA-5 negative/reconnect (закрыт PK-DEBT-RED 2 red), BBA-6 live integration. Срез: backend 141/1 skip, live 1, frontend 39. | orchestrator/browser/browser_service.py
2026-09-19 | Boss (worker, БЕЗ приёмки) | BBA-1 backend: `_cmd_observe_click` → каноничный pointer (primary `page.mouse.click` CDP Input.dispatchMouseEvent + elementFromPoint fallback), `_POINTER_CLICK_WAIT_TIMEOUT=2.0`; test_browser_service обновлён, 72 passed 1 skipped. | orchestrator/browser/browser_service.py
2026-09-18 | Keeper | PK-C-009 финализирован: G4 outbound `orchestrator/infra/intake_transport.py` (HubIntakeClient :8200 + retry, AirgapBundler zip), 7/7 тестов; hand-off в Hub (инбокс Arbiter: HUB-001 разблокирован); PK-ALIAS-3 Sonar/Keycloak (4 файла). | orchestrator/infra/intake_transport.py
2026-09-04 | Keeper / Boss | PK-C-009 (Contract A finalize): DTO StudioRunOutput (Pydantic v2) + JSON Schema в orchestrator/contracts/, 6/6 тестов, канонический документ docs/contracts/studio-to-hub-intake.md | docs/contracts/studio-to-hub-intake.md
2026-09-04 | Keeper | Применена директива Airlock: пути D:\prettyk-control-plane -> D:\prettyk-airlock, references в opencode.json и AGENTS.md, в docs/MAP.md зафиксирован сквозной handoff (Коробка -> Hub -> Airlock). PK-DIR-001 compaction rev 2026-09-04 подтверждён. | docs/MAP.md
2026-09-03 | Flash / Keeper | PK-ALIAS-1/2 закрыты: bundle/Helm prettyk-allure3, док-вычистка prettyk-dev, :5051 void | docs/backlog.md
