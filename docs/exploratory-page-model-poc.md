# PoC: Exploratory Page Model Generator

> **Записано:** 21 августа 2026 · Максим
> **Статус:** idea / pre-PoC

## Идея

Полноценный exploratory crawler, который:

1. Ходит по формам целевого приложения (Selenium/CDP)
2. Записывает все взаимодействия — поля ввода, клики, переходы
3. Генерирует **generic page object** с локаторами (css/xpath/id)
4. Выдаёт заготовку макета страницы (page model) в формате wired.json

Со временем — **обучать бортовой ИИ** (Qwen3 на борту) предсказывать структуру форм и
предлагать локаторы, а юзеру показывать готовый page object.

## Предыдущие зачатки идеи

- `docs/backlog.md:857` (16 августа 2026): «коробка одной кнопкой: URL → grab network →
  spider cluster search → extract → process corpus → form list → activeScan →
  passiveScan → report. 0 actions юзером»
- **ZAP Sequence / HAR Import** уже в бэклоге: replay с CSRF/token correlation
  (`docs/backlog.md:1233`)
- **Chain Module** — уже умеет `.har → steps + slots + template`, материализует
  цепь вызовов из сырого HAR. Это ближайший предшественник.

## PoC-сценарий

1. Юзер открывает Студию → жмёт «Exploratory»
2. CDP/Selenium открывает браузер, заходит на URL
3. Краулер обходит все видимые формы: `<input>`, `<select>`, `<textarea>`, `<button>`
4. Для каждого элемента пишет `Элемент name = css ".selector"`
5. Группирует элементы по страницам (URL path → page model)
6. Выдаёт готовый `pages: { login: {...}, register: {...} }` в wired.json
7. Юзер может допилить локаторы вручную или принять как есть

## Что уже есть под капотом

| Компонент | Что умеет | Где |
|---|---|---|
| Chain materializer | HAR → steps + slots + template | `orchestrator/utils/chain_ops.py` |
| Page resolver | Операция → локаторы + wire | `orchestrator/core/page_resolver.py` |
| CDP set_blocked_urls | Блокировка URL в браузере | `orchestrator/adapters/browser_adapter.py` |
| Gather info (G-62) | Spider URL list + passive scan | `orchestrator/utils/gather_info.py` |
| Studio Form | Page models editor | `cosmo/src/studio/StudioWorkspace.tsx` |

## Что нужно построить

1. **Exploratory Engine** (`orchestrator/utils/exploratory_engine.py`) — ходит по формам,
   снимает DOM-слепки, извлекает интерактивные элементы
2. **Locator inference** — по элементу определяет лучший css/xpath/id локатор
   (приоритет: id > data-testid > name > уникальный css-путь)
3. **Page Model Builder** — группирует элементы по URL, генерит `Элемент name = css ...`
   и `Операция АвтоЗаполнить { ВставитьЗначение ... }`
4. **Studio UI** — кнопка «Exploratory» в Home или Studio, модалка с прогрессом,
   результат → импорт в текущий чек

## Роль AI

Qwen3-4B (reasoning) может:
- Классифицировать тип формы (login / register / search / checkout)
- Предлагать названия элементов на основе placeholder/label
- Группировать элементы по семантическим фазам
- Предлагать тестовые payload в зависимости от типа поля

## Приоритет

После EXP-01/EXP-02 приёмки AI Co-Pilot и стабилизации Studio.