# PoC: Playwright SPA/State Crawler

> **Дата:** 28 августа 2026
> **Статус:** research / PoC design, не канон
> **Связанные материалы:** [`exploratory-page-model-poc.md`](../exploratory-page-model-poc.md), [`pw-browser-core.md`](../../sanctuary/pure/pw-browser-core.md), [`2026-08-28-session-orchestration-and-multi-substrate-architecture.md`](2026-08-28-session-orchestration-and-multi-substrate-architecture.md)

## 1. Решение

Нужен не новый вариант scanner AJAX Spider, а собственный **Playwright-native SPA/State Crawler**.

Его единица покрытия — не URL, а наблюдаемое состояние приложения:

```text
BrowserContext/persona
        |
        v
  State (route + DOM/AX + visible controls + storage fingerprint)
        |
        +--> Action (click / fill / select / submit / scroll / navigate)
        |
        v
  Outcome (new state + network delta + console/page errors)
```

Краулер должен строить граф состояний и переходов, а не просто список страниц. URL и endpoint остаются важными атрибутами графа, но не являются достаточной моделью для React/Vue/Angular SPA, модалок, вкладок, клиентских роутов, lazy-loaded компонентов и форм, которые меняют DOM без навигации.

### Граница ответственности

| Слой | Ответственность |
|---|---|
| Playwright crawler | Запуск/attach, действия, ожидание, state snapshots, network/console capture |
| Discovery IR | Нормализация состояний, элементов, переходов и evidence |
| `corpus` | Парсинг network/DOM, ServiceMap, `awaken`, request templates |
| CorpusFuzzer | Мутации подтверждённых request templates |
| scanner/scanner | MITM, Sites Tree, passive/active qualification downstream |
| wired compiler | Опциональный экспорт пригодных page models/actions |

scanner не является владельцем обхода. При включённом proxy трафик краулера может идти через scanner, но Playwright остаётся источником истины для браузерного поведения.

## 2. Что уже есть

### Готовые кирпичи

- `orchestrator/adapters/playwright_adapter.py` — lifecycle, navigation, semantic locators, click/fill/select и attach через CDP.
- `orchestrator/browser/playwright_runtime.py` — launch, `connect_over_cdp`, isolated contexts.
- `orchestrator/utils/discovery_pw_recorder.py` — Playwright request/response/console/pageerror capture, AX snapshot, переходы и session IR.
- `orchestrator/utils/discovery_element_extractor.py` — interactive elements, role/name/label/test id, secret/email/phone classification.
- `orchestrator/utils/discovery_candidate_builder.py` — locator candidates T0…T3.
- `orchestrator/utils/discovery_compiler.py` — IR → wired и incremental merge с сохранением ручных локаторов.
- `orchestrator/models/discovery.py` и `orchestrator/lab/discovery_session.py` — `PageFamily`, `StateVariant`, `StateRevision`, `Transition` и in-memory session.
- `orchestrator/corpus/discovery_capture.py` — нормализованный `DiscoveryCorpus` с redaction и лимитом тела.
- `orchestrator/corpus/corpus_parser.py` — `FormField` и `RequestTemplate`.
- `orchestrator/corpus/service_map.py` — page → endpoint → field bindings.
- `orchestrator/corpus/awaken.py` — кандидаты для orphaned форм и параметров.
- `orchestrator/corpus/fuzzer.py` — sniper, battering ram, pitchfork и cluster bomb для templates.
- `orchestrator/corpus/scanner_context.py` — downstream injection templates в Sites Tree.

### Чего не хватает

Сейчас есть one-shot recorder и отдельные чистые функции, но нет orchestrator loop, который:

1. извлекает очередь действий из текущего DOM/AX;
2. безопасно выполняет их в изолированном состоянии;
3. дедуплицирует результат по fingerprint состояния;
4. ограничивает комбинаторный взрыв;
5. повторяет capture после каждого meaningful action;
6. передаёт corpus в `awaken` только после обычного UI discovery;
7. связывает browser-native network events с существующим `DiscoveryCorpus`.

## 3. Research findings

### Playwright подходит как основной runtime

Официальная документация Playwright подтверждает нужные для PoC возможности:

- `page.on("request")` и `page.on("response")` видят XHR/fetch;
- `page.on("websocket")` позволяет зафиксировать наличие WebSocket и frames;
- `BrowserContext` изолирует cookies, local storage и session state;
- `context.route()` применим ко всем страницам контекста, но Service Worker может скрывать запросы; для network discovery следует создавать context с `service_workers="block"`;
- рекомендуемые locator strategies — role, label, placeholder, test id; CSS/XPath остаются fallback и не должны быть первичным смысловым контрактом;
- locators переоценивают DOM при каждом действии, что важно для React re-render и динамических списков.

Источники:

- [Playwright Python Network](https://playwright.dev/python/docs/network)
- [Playwright Python BrowserContext API](https://playwright.dev/python/docs/api/class-browsercontext)
- [Playwright Python Locators](https://playwright.dev/python/docs/locators)
- [Playwright Python Isolation](https://playwright.dev/python/docs/browser-contexts)

### Практический вывод

Краулер должен хранить **описание действия**, а не `ElementHandle`: после перехода или re-render старый handle ненадёжен. На каждом шаге заново строится locator из candidate descriptor и проверяется его cardinality/visibility/enabled state.

## 4. Модель состояния

### State fingerprint

Минимальный fingerprint состояния:

```text
state_key = hash(
    persona_hash,
    normalized_url,
    route_without_query,
    visible_accessible_controls,
    visible_headings,
    modal/dialog identity,
    relevant network endpoint set,
    stable DOM/AX digest
)
```

Не включаем в ключ:

- timestamps;
- случайные request ids;
- nonce/token values;
- полные cookies и authorization headers;
- абсолютные координаты и шумные asset requests.

Одинаковый route с разными модалками или заполненной/пустой формой должен иметь разные `StateVariant`, если набор доступных действий или security-relevant network behavior различается.

### State snapshot

Каждый snapshot содержит:

- URL, route и title;
- AX tree или его нормализованный digest;
- видимые interactive elements и locator candidates;
- формы, поля, select options и submit candidates;
- dialogs, tabs, accordions, menus, pagination и expandable controls;
- network delta с method, URL, status, resource type и безопасным body snippet;
- console warnings/errors и page errors;
- screenshot/trace references, если включены;
- persona/context id и parent transition.

Секреты не попадают в evidence. Для secret-полей сохраняем только `value_class=secret`, fingerprint и факт действия.

## 5. Алгоритм PoC

### Inputs

```python
CrawlerConfig(
    target_url="http://target",
    allowed_origins=["http://target"],
    max_states=100,
    max_actions_per_state=30,
    max_depth=4,
    action_timeout_ms=5000,
    settle_timeout_ms=750,
    context_options={"service_workers": "block"},
    awaken=True,
    fuzz=False,
)
```

### Main loop

```text
seed context + page
attach network/console/error listeners
enqueue(seed URL, empty parent)

while queue and budget remains:
    work = queue.pop_best()
    restore or recreate isolated state
    navigate(work.url or replay parent path)
    settle()
    snapshot = capture_state()

    if snapshot.state_key already visited:
        record edge and continue

    save snapshot
    actions = derive_actions(snapshot)
    for action in rank_and_cap(actions):
        before = snapshot.state_key
        execute_safely(action)
        settle_after_action()
        outcome = capture_state_and_network_delta()
        save transition(before, action, outcome)
        enqueue outcome if new and in scope

    run awaken on orphaned candidates from accumulated corpus
    add only observed/verified outcomes to ServiceMap and corpus
    optionally hand verified templates to scanner/fuzzer downstream
```

В первом PoC допускается replay seed URL для каждого branch вместо полноценного action replay. Это медленнее, но честнее и проще для изоляции. Replay chains и token correlation подключаются через существующий `chain_ops.py` после доказательства базового state graph.

## 6. Какие действия выполнять

### P0: безопасные discovery actions

- `click` по видимой кнопке, ссылке, tab, menuitem, disclosure и pagination;
- `fill` в текстовые/email/search поля тестовыми значениями;
- `select_option` для первой безопасной option;
- `submit` формы только при наличии формы и ограниченном payload;
- `scroll` вниз один-два раза для lazy content;
- `navigate` по same-origin ссылкам и SPA route candidates.

### Не выполнять автоматически в P0

- logout, delete, destroy, remove, reset account;
- purchase, transfer, payment, invite, password change;
- file upload/download без отдельной policy;
- повторные submit без state delta;
- произвольный `page.evaluate` как способ обхода UI;
- cross-origin переходы, кроме явно разрешённых policy origins.

Dangerous action classifier должен быть policy gate, а не набором эвристических исключений внутри crawler loop. Заблокированное действие всё равно фиксируется как `candidate` с причиной reject, чтобы не терять coverage gap.

### Дедупликация действий

```text
action_key = hash(
    state_key,
    action_type,
    semantic target,
    normalized locator candidate,
    input value class,
)
```

Значение поля не входит в ключ в открытом виде. Для повторного исследования можно использовать отдельный bounded value profile.

## 7. Как смешать `corpus awaken`

`awaken` не должен превращаться в blind HTTP fuzzer. Его правильная роль — **расширитель discovery**, который поднимает связи, не проявившиеся в пассивном обходе.

### Фаза A: passive corpus

Playwright listeners записывают request/response в нормализованный `DiscoveryCorpus`. Для каждого request сохраняются:

- method, URL, resource type;
- redacted headers;
- ограниченный request/response body;
- status и response content type;
- parent page/state/action id.

Это дополняет существующий `discovery_capture.py`, а не ломает его scanner History fallback.

### Фаза B: DOM/AX parse

Из state snapshots извлекаются `FormField`, controls и `RequestTemplate`. `ServiceMap` связывает поле с endpoint:

1. form action;
2. совпадение имени параметра;
3. same-origin fallback.

### Фаза C: UI awakening

Для orphaned field сначала выполняется browser-native действие:

```text
field -> safe value -> nearest submit/click -> settle -> capture network delta
```

Если появился реальный endpoint, он становится observed edge. Это предпочтительнее прямого запроса, потому что сохраняет JS validation, CSRF/bootstrap flow и client-side state.

### Фаза D: template awakening

Только если UI action невозможен или не дал вызова, `awaken_candidates()` создаёт bounded `RequestTemplate`. Перед отправкой:

- сверить origin с policy;
- не отправлять секретные поля и не изобретать auth tokens;
- использовать существующий authenticated context/chain, если он есть;
- ограничить одну попытку на `(state, field, endpoint)`;
- записать `reason=awakened`, а не выдавать результат за observed browser behavior.

Ответ от такой попытки маркируется как `synthetic_candidate` до независимого подтверждения.

### Фаза E: fuzz handoff

`CorpusFuzzer` получает только verified или operator-approved templates. Его мутации не возвращаются в state queue как обычные discovery states: они идут в attack/evidence pipeline. Это разделяет «узнать поверхность» и «атаковать поверхность».

## 8. Output contract

PoC должен выдавать один IR artifact, совместимый с текущими моделями, с расширением discovery-specific полей:

```json
{
  "schema_version": 2,
  "session_id": "disc_...",
  "target": {"origin": "http://target"},
  "persona": {"hash": "...", "kind": "anonymous"},
  "states": [
    {
      "state_key": "...",
      "url": "http://target/#/login",
      "route": "/#/login",
      "depth": 0,
      "elements": [],
      "network_delta": [],
      "evidence": {"screenshot_ref": "", "trace_ref": ""}
    }
  ],
  "transitions": [
    {
      "from_state": "...",
      "action": {"type": "click", "target": "Sign in", "candidate": {}},
      "outcome": {"to_state": "...", "url_change": "", "response_class": "2xx"}
    }
  ],
  "service_map": {"endpoints": [], "bindings": []},
  "awaken": {"candidates": [], "verified": [], "rejected": []},
  "limits": {"states": 0, "actions": 0, "blocked": 0}
}
```

Existing `DiscoverySession` fields (`page_families`, `variants`, `revisions`, `transitions`) остаются базовой совместимостью. `state_key`, `network_delta`, action candidate и awaken provenance можно сначала хранить в `fingerprint`/`evidence`, а после PoC вынести в typed models.

## 9. Архитектурная нарезка

### P0 implementation

1. `orchestrator/crawler/spa_crawler.py` — bounded BFS/priority queue и policy.
2. `orchestrator/crawler/state_fingerprint.py` — нормализация и digest.
3. `orchestrator/crawler/action_discovery.py` — extraction/ranking/dedup actions.
4. Playwright recorder adapter — перенос request/response в `DiscoveryCorpus` без scanner dependency.
5. adapters around existing `DiscoverySession` and `ServiceMap`.
6. fixture app with client-side routes, modal, tabs, lazy form and API calls.

### P1

- action replay chains вместо seed re-navigation;
- storage state/persona matrix;
- iframe and open shadow-root policy;
- WebSocket handshake/frame metadata;
- trace/screenshot evidence on state transitions;
- UI awakening integration with verified outcome classification;
- wired page-model export of selected states.

### P2

- mutation-guided exploration;
- coverage scoring by unvisited controls/endpoints;
- cross-browser comparison;
- LLM suggestion layer only as candidate generator, never as execution authority.

## 10. Acceptance criteria for PoC

Given a fixture SPA with `/`, `#/login`, `#/dashboard`, a modal, a tab panel, a lazy-loaded form and at least two API endpoints:

- crawler reaches client-side routes without full page navigation;
- crawler records at least one state distinction where URL does not change;
- click/fill/submit transitions contain before/after state keys;
- XHR/fetch requests are attached to the triggering transition;
- duplicate state/action combinations do not run twice;
- max state/action/depth budgets are enforced;
- dangerous controls are reported as blocked, not clicked;
- cross-origin links are reported as out-of-scope unless allowed;
- secret values are absent from the artifact;
- an orphan form is first attempted through UI awakening;
- synthetic awaken candidates are distinguishable from observed network events;
- verified request templates can be passed to `ServiceMap` and then to `CorpusFuzzer`;
- existing discovery compiler can produce a reviewable wired page model from selected states;
- focused tests cover fingerprinting, action ranking, policy, queue dedupe and awaken provenance.

## 11. Open questions

- Should the first implementation use the existing synchronous Playwright adapter or a new async crawler loop? Synchronous is smaller and matches current runtime; async is better for many pages/contexts later.
- How much `page.accessibility.snapshot()` data should be retained versus a normalized digest plus element list?
- Should state restoration begin with seed re-navigation or persist action chains immediately? PoC recommendation: seed re-navigation, then add replay after metrics show the cost.
- Which response classes qualify an awaken candidate as verified? Recommendation: network event observed in browser context is verified; direct synthetic response remains candidate until a browser replay confirms it.
- How should service worker traffic be represented when blocking workers changes application behavior? Record the policy in artifact and make worker mode explicit.

## 12. Decision

Proceed with a small fixture-backed `spa_crawler.py` PoC. Do not revive `ajax_spider_scan`, do not make `scanner|spider_scan` the browser contract, and do not couple crawler correctness to scanner History. The canonical flow is:

```text
Playwright state exploration
  -> Discovery IR + browser-native corpus
  -> ServiceMap
  -> UI awaken, then bounded template awaken
  -> approved RequestTemplates
  -> CorpusFuzzer / scanner / report
```

This keeps the browser contour ours, preserves scanner where it is useful, and makes `corpus awaken` a controlled discovery accelerator rather than an opaque second spider.