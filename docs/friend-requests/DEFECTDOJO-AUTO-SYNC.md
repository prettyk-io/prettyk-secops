# FRIEND-REQUEST: DEFECTDOJO-AUTO-SYNC — Автоматическая синхронизация находок и дедупликация

**Статус:** `lane: ready`  
**Дата:** 17 августа 2026  
**Авторы:** Максим, Keeper, Flash, Boss  
**Область:** `orchestrator/utils/dojo_client.py`, `cosmo/src/admin/DojoFindingsTable.tsx`, `cosmo/src/admin/adminApi.ts`

---

## 1. Зачем заказчику (Customer Value)

В процессах DevSecOps и непрерывного аудита безопасности критически важно, чтобы результаты автоматизированных проверок (DAST, Fuzzing) напрямую поступали в корпоративный трекер уязвимостей (DefectDojo).
- Автоматическое создание Engagement и push находок без ручной загрузки отчётов.
- Дедупликация: исключение повторного заведения уже существующих багов по совпадающим CWE и endpoint.
- Прозрачный просмотр актуальных уязвимостей прямо в интерфейсе Админки SecOps Lab.

---

## 2. Скоуп архитектуры

1. **`orchestrator/utils/dojo_client.py`**:
   - `DefectDojoClient(base_url, api_key, user, password)`: клиент DefectDojo API v2.
   - Управление Engagement и создание Findings (`title`, `cwe`, `severity`, `description`, `mitigation`).
   - `find_existing_finding()`: дедупликация перед сохранением.
2. **`cosmo/src/admin/DojoFindingsTable.tsx` & `adminApi.ts`**:
   - Реальное отображение списка уязвимостей из DefectDojo API.
   - Стилизация SecOps Lab Dark, бейджи критичности (Critical / High / Medium / Low).
3. **Безопасность**:
   - Проксирование запросов к Dojo API через `live_server.py`, предотвращающее утечку учетных данных Dojo в браузер.
