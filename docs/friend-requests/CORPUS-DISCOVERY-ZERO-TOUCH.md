# Friend Request: CORPUS-DISCOVERY — Zero-Touch Корпус & Собственный Фаззинг

> **Статус:** `ready` (к вечернему 2FA)  
> **Гриф:** *«Фантазии обезьяны, которые мы сделали, не проверив на бред»*  
> **Авторы:** Boss, Flash (DeepSeek), Bro  
> **Дата:** 17 августа 2026  
> **Контекст:** Реализация концепции «zero-touch коробки одной кнопкой»: от сбора DOM/Network-трафика браузера до эвристического пробуждения форм, инъекции в scanner Sites Tree и собственного движка мутационного фаззинга без сторонних тулов.

---

## 1. Суть и Замысел (Маняфантазия)

Превратить коробку SecOps Lab в инструмент, который **без единого ручного действия/локатора со стороны пользователя**:
1. Садится на хвост браузеру / сетевому трафику обхода (DOM + Network history).
2. Разбирает весь «фарш» запросов и DOM-форм на структурированные поля и шаблоны.
3. Эвристически «пробуждает» не затронутые обходом формы и кнопки (подставляя правдоподобные синтетические типы данных).
4. Проливает эти эндпоинты в Sites Tree / Context scanner для глубокого досканирования.
5. Запускает собственный независимый движок мутаций (чистый Python, 50+ векторов, sniper/cluster-bomb) с классификацией аномалий (5xx, reflection, latency spike, content diff).
6. Прогоняет находки через Admission Gate и строит агрегированный отчет в Allure3 / DefectDojo.

---

## 2. Реализованный Скоуп (As-Built: CD-1…CD-8)

| ID | Компонент | Файлы реализации | Что сделано по факту |
|---|---|---|---|
| **CD-1** | Grab DOM + Network | `orchestrator/corpus/discovery_capture.py` | Сбор снимков DOM и сетевого трафика scanner History в единый `DiscoveryCorpus` (NDJSON-сериализуемый). Санитизация секретных заголовков. |
| **CD-2** | Корпус-парсер | `orchestrator/corpus/corpus_parser.py` | Извлечение `FormField` (input/select/textarea) из DOM через `BeautifulSoup` и `RequestTemplate` (query/body/json) из NetworkEntry. |
| **CD-3** | Карта сервисов | `orchestrator/corpus/service_map.py` | Построение графа `страница → действие → эндпоинт` (связывание по `form_action`, именам параметров и same-origin). |
| **CD-4** | Эвристическое пробуждение | `orchestrator/corpus/awaken.py` | Детект «сиротских» форм без зафиксированного трафика, генерация синтетических запросов с типизированными fallback-значениями. |
| **CD-5** | Внедрение в scanner | `orchestrator/corpus/scanner_context.py` | Форматирование HTTP/1.1 wire-запросов, авто-включение в Context include regex и проливка через `scanner.core.send_request` для наполнения Sites Tree. |
| **CD-6** | Zero-touch Pipeline | `orchestrator/corpus/pipeline.py` | Единый конвейер `capture → parse → map → inject → scan`, зарегистрированный в `ActionFactory` (`core.discovery_pipeline`). |
| **CD-7** | Собственный фаззер | `orchestrator/corpus/fuzzer.py` | `CorpusFuzzer` — чистый Python без scanner: мультипозиционный (`§payload§` / `{MASK}`) и sniper-режим, smoke-векторы (boundary, traversal, SQLi/XSS/SSTI/XXE сигналы). |
| **CD-8** | Admission & Allure Gate | `orchestrator/corpus/fuzz_reporter.py` + `core/admission_filter.py` | Классификация `FuzzAnomaly` → `Finding`, фильтрация через `admit_fuzz_findings()`, экспорт в Allure3 categories и `run_summary.json`. |

---

## 3. Верификация и Тесты

- **Всего unit/integration тестов по эпику:** **56 passed**
  - `test_discovery_capture.py` — 12 passed
  - `test_corpus_parser.py` — 10 passed
  - `test_service_map.py` — 7 passed
  - `test_awaken.py` — 6 passed
  - `test_scanner_context.py` — 3 passed
  - `test_pipeline.py` — 1 passed
  - `test_fuzzer.py` — 12 passed
  - `test_fuzz_reporter.py` — 17 passed
  - Регресс admission (`test_admission_filter.py`, `test_fuzz_df13_14.py`) — без сломов.

---

## 4. Границы и Ограничения

- `docs/wired.json` SoT не затронут.
- Генератор мутаций работает на чистом Python (urllib + stdlib), не создавая внешних сетевых зависимостей в фазе генерации.
- Не ломает штатный поток scanner/Webdriver — подключается как декларативное ключевое слово оркестратора.
