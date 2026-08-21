# FRIEND-REQUEST: RETENTION-AND-CLEANUP (Управление хранилищем и очистка артефактов)

> **Статус:** `lane: ready` (к вечерней инвентаризации 2FA)  
> **Дата:** 17 августа 2026  
> **Авторы:** Boss (Bro 40% + Flash 60%)  
> **Профиль:** `secops-lab-pure` (Default Коробка) & `cosmo-custom`

---

## 1. Проблема и Ценность

Прогоны тестов, генерация видеозаписей (MP4), дампов SSE и отчётов Allure со временем засоряют дисковое пространство стенда.
Требовалось:
1. Иметь наглядный дашборд использования диска по категориям артефактов.
2. Возможность безопасной очистки устаревших данных (старше 3 / 7 / 30 дней) или только временных дампов.
3. Гарантировать сохранность критических мета-данных (`runs_index.ndjson`, политики, активные/закреплённые прогоны с `legal_hold`).

---

## 2. Реализованный скоуп (As-Built)

### Backend (Bro):
- **`orchestrator/utils/retention_manager.py`**:
  * `scan_storage_status()`: агрегация размера (bytes/MB) и количества элементов по 4 категориям (`recordings`, `journal_exports`, `allure_results`, `runs_data`) + общее число прогонов из `runs_index.ndjson`.
  * `cleanup_artifacts(days_older_than, keep_pinned=True, dry_run=False)`: удаление файлов старше N дней с защитой закреплённых записей и логированием аудита в `artifact_cleanup_audit.ndjson`.
  * `cleanup_temp_dumps(dry_run=False)`: быстрая очистка временных дампов.
  * `PROTECTED_META_FILES`: строгий список файлов-исключений.
- **`orchestrator/utils/live_server.py`**:
  * `GET /api/admin/retention/status`
  * `POST /api/admin/retention/clean`
  * `POST /api/admin/retention/clean_temp`
- **Тесты**:
  * `orchestrator/tests/test_retention.py` (3/3 passed).
  * `orchestrator/tests/test_diary_live.py` (38/38 passed).

### Frontend (Flash):
- **`cosmo/src/admin/adminApi.ts`**:
  * `fetchRetentionStatus()`, `postRetentionClean()`.
- **`cosmo/src/admin/sections/RetentionPanel.tsx`**:
  * KPI-карточки (общий объём, число прогонов, защищённые записи).
  * Таблица категорий артефактов со статусами и бейджем `LockOutlined` «Защищено» для `runs_index.ndjson`.
  * Действия с `Popconfirm` (очистка по дням, очистка временных дампов).
- **`cosmo/src/admin/AdminLayout.tsx`**:
  * Вкладка «Хранилище» (`DeleteOutlined`) в навигации Админки.
- **Тесты**:
  * `cosmo/src/admin/sections/RetentionPanel.test.tsx` (3/3 passed).

---

## 3. Стены и ограничения

- `runs_index.ndjson` никогда не удаляется (история и реестр инстансов бессрочны).
- Никаких внешних тяжелых библиотек не добавлялось.
- Цвета, скругления (5–6px) и стили строго соответствуют SecOps Lab Dark.
