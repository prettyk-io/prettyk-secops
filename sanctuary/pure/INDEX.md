# CANON hub — реестр «свой»

> Единственный реестр продуктовой narrative-истины для агентов.  
> Slice: **23 августа 2026** (2FA sealed: ROLE-MATRIX зачислен; Playwright Browser Core зачислен; Webswing выпилен).  
> Machine-контракт: Pydantic-модели [`../../orchestrator/models/manifest.py`](../../orchestrator/models/manifest.py). `docs/manifest.json` — legacy JSON Schema (RJSF era), хранится как reference.  
> Презентация / deck **потом** режется из этого INDEX + topics + [`MODULES-SKELETON.md`](MODULES-SKELETON.md).  
> Тулы презентации — **void**.

## Замок 2FA — hub не ломают, полируют

**Никто** (агент, «продолжение сессии», CULT, «заодно») не меняет этот INDEX, FRIEND-топики, Void, promote без двух факторов.

Hub — **монолит**. Правки = **полировка** (уточнение тезиса, созревший add FRIEND), не снос / rewrite «под сессию».  
SOLID для канона — в rule [`docs-canon.mdc`](../../.opencode/rules/docs-canon.mdc).

| Фактор | Смысл |
|---|---|
| **1** | Явная просьба владельца **полировать** hub / открытый canon-request |
| **2** | После листа тезисов и здравого ответа владельца (1–5 предложений) — «да, полируй канон» / явный приказ апдейтить |

Между факторами агент не пишет `docs/canon/**`. Не экзаменует владельца деталями кода — валидирует логику размышления.  
Канон enforcement: rule [`docs-canon.mdc`](../../.opencode/rules/docs-canon.mdc).

## Friend / foe (кратко)

| Вердикт | Где |
|---|---|
| **FRIEND** | Файл в этой папке + строка ниже + шапка `> **CANON**` |
| **CANON SEEKER** | FRIEND на птичьих правах — тезис канонизирован, мясо дозревает. Шапка `> **CANON SEEKER**`. Полный 2FA → member. |
| **QUEUE** | [`../backlog.md`](../backlog.md), эпики — статусы, не истина |
| **EVIDENCE** | [`../acceptance/`](../acceptance/), [`../history/`](../history/) |
| **VOID** | § Void — не воскрешать |
| **PUBLIC** | [`../README.md`](../README.md) — переписывать от hub при конфликте |

Нет строки здесь и нет `> **CANON**` в `docs/canon/` → **не цитировать как истину**.  
Русское «канон» в прозе ≠ badge.

**Кандидаты / deepen:** [`POSSIBLE-FRIEND.md`](POSSIBLE-FRIEND.md) — `rg POSSIBLE-FRIEND`.  
**Окультуривание тонких FRIEND:** [`../backlog.md`](../backlog.md) § CANON-CULT.  
**Скелет / диаграммы:** [`MODULES-SKELETON.md`](MODULES-SKELETON.md) — `rg MODULES-SKELETON`.

### Братья оплота (зачисление 11 авг)

Привет приверженцам. В основу hub зачислены пакеты: **AUTH lab 12–15+37** · **CONN thin MethodId** · **hold / package secrets honesty**. Residual (UI C, толстый MQ/SQL, demo polish) — QUEUE, не блок основы.

---

## FRIEND topics

Сортировка: Product → Runtime → Admission → Authoring → Walls → Void.

> **Алтарь Обители** — [`../ALTAR.md`](../ALTAR.md). Благодарность Boss, Flash, Keeper. Фиксация того, что мы построили. Не FRIEND, не backlog, не evidence — благодарность.

| Тема | Файл | Группа |
|---|---|---|
| Честный контракт (слот ≠ runtime) | [`honest-contract.md`](honest-contract.md) | Product |
| FE shell Login→Home→ЖЦ | [`fe-shell.md`](fe-shell.md) | Product |
| BRAND-VIDEO: фоновое видео бренда | [`brand-video.md`](brand-video.md) | Product / Brand |
| MONITOR-HEADER: унификация wordmark | [`monitor-header.md`](monitor-header.md) | Product / Brand |
| BRAND-STRATEGY: prettyK SecOps Lab | [`brand-strategy.md`](brand-strategy.md) | Product / Brand |
| BRAND-FONTS: библия шрифтов | [`brand-fonts.md`](brand-fonts.md) | Product / Brand |
| REBRANDING: KDT / zap-kdt → PrettyK | [`rebranding.md`](rebranding.md) | Product / Brand |
| Enterprise-friends-required: планка Enterprise | [`enterprise-friends-required.md`](enterprise-friends-required.md) | Product / Brand |
| FEATURE-ADMISSION: конвейер допуска фич в коробку | [`feature-admission.md`](feature-admission.md) | Product / Governance |
| NAV CheckInstance / History | [`nav-check.md`](nav-check.md) | Product |
| Admin Integrations (секреты) | [`admin-integrations.md`](admin-integrations.md) | Product |
| Split CANON (BASE vs INTEGRATION) | [`split-canon.md`](split-canon.md) | Product / Governance |
| FRIEND lifecycle (коридоры и переходы) | [`friend-lifecycle.md`](friend-lifecycle.md) | Product / Governance |
| AUTH-ROLES: сплит учёток и ролей коробки | [`auth-roles.md`](auth-roles.md) | Product / Governance |
| FE vnext architecture (seeker) | [`fe-vnext-architecture.md`](fe-vnext-architecture.md) | Product / Authoring — **seeker** |
| REGULATION-EDITOR-SPLIT | [`regulation-editor-split.md`](regulation-editor-split.md) | Product / Authoring |
| Auth module (Studio → IR → apply) | [`auth-module.md`](auth-module.md) | Product / Authoring |
| Auth slots (legacy enum / bank gaps) | [`auth-slots.md`](auth-slots.md) | Product / Honesty |
| Connectors (Admin → activate → thin MethodId) | [`connectors.md`](connectors.md) | Product / Authoring |
| Studio Action Hub (единственный create) | [`studio-hub.md`](studio-hub.md) | Authoring |
| Data modules (DataStream) | [`data-modules.md`](data-modules.md) | Authoring |
| Манифест: machine-контракт (legacy JSON Schema) | [`manifest-sot.md`](manifest-sot.md) | Authoring / SoT |
| prettyK core | [`prettyk-core.md`](prettyk-core.md) | Authoring |
| Цепь (глаголы / карта / ≠ чужой HAR) | [`chain.md`](chain.md) | Authoring / Runtime |
| API-модули (OA / GQL / gRPC каскад) | [`api-modules.md`](api-modules.md) | Authoring |
| Discovery / label / heal | [`discovery-heal.md`](discovery-heal.md) | Authoring (DISC-1 дно; HEAL+DISC-2 landed) |
| Runtime shell (Grid / WD / Live) | [`runtime-shell.md`](runtime-shell.md) | Runtime |
| Playwright Browser Core (launch / attach / context) | [`pw-browser-core.md`](pw-browser-core.md) | Runtime |
| Studio Stack (фронтенд-зависимости: 2FA sealed) | [`studio-stack.md`](studio-stack.md) | Product / Governance |
| MONITOR-HUB: Space / ACL / Retention | [`monitor-hub.md`](monitor-hub.md) | Runtime |
| Lab-up обязательный контур | [`lab-up.md`](lab-up.md) | Runtime / Lab |
| Stand Port META (порты + команды) | [`stand-port-meta.md`](stand-port-meta.md) | Runtime / Lab |
| Infra Stack (PostgreSQL 16 + Valkey 8: ядро данных) | [`infra-stack.md`](infra-stack.md) | Product / Governance |
| ZAP demon | [`zap-dual.md`](zap-dual.md) | Runtime |
| DAST wave (ФаззингВолна) | [`dast-wave.md`](dast-wave.md) | Runtime |
| Security lab bounds | [`security-lab.md`](security-lab.md) | Runtime / Walls |
| Допуск ИБ + опциональный акт | [`admission.md`](admission.md) | Admission |
| Стены | [`walls.md`](walls.md) | Walls |

---

## SATELLITE & SERVICE TOOLING (service-needs — не ядро продукта)

> Внутренний сервисный инструментарий команды. Не канон ядра продукта. 2FA sealed.

| Инструмент | Файл | Статус |
|---|---|---|
| DESIGN-WORKBENCH: живой дизайн-полигон (Theme Studio, Catalog, Patterns, Tailwind Sandbox) | [`../DESIGN-WORKBENCH.md`](../DESIGN-WORKBENCH.md) | `service-needs` (2FA sealed) |
| ROLE-MATRIX (4×4): ролевая архитектура агентов, модели 3.1–3.7, Sanctuary-лор, 2FA-ритуалы | [`ROLE-MATRIX.md`](ROLE-MATRIX.md) | `service-needs` (2FA sealed · 23 авг 2026) |

### Скелет презентации (из hub)

1. Product — honest-contract · fe-shell · **brand-video** · **monitor-header** · **brand-strategy** · **brand-fonts** · **enterprise-friends-required** · nav-check · admin-integrations · auth-module · auth-slots · connectors  
2. Authoring — studio-hub · data-modules · manifest-sot · prettyk-core · **chain** · **api-modules** · discovery-heal (DISC-1 дно)  
3. Runtime — runtime-shell · **pw-browser-core** · **monitor-hub** · lab-up · zap-dual · dast-wave · security-lab  
4. Admission — admission  
5. Walls — walls + § Void  

---

## QUEUE (указатели, не канон)

| Что | Путь |
|---|---|
| Живая очередь | [`../backlog.md`](../backlog.md) |
| Честный утренний долг | [`../agent-suggested-not-tested.md`](../agent-suggested-not-tested.md) |
| План эпиков | [`../future-plans.md`](../future-plans.md) |
| Results as-built | [`../internal/results-as-built.md`](../internal/results-as-built.md) |
| Auth/CONN detail | [`../internal/auth-module.md`](../internal/auth-module.md) · [`../internal/connectors.md`](../internal/connectors.md) |
| Live / ферма detail | [`../monitoring.md`](../monitoring.md) · [`../basis-services.md`](../basis-services.md) |
| Research / evolve | [`../research/`](../research/) |
| PoC research | [`../proof_of_concept/`](../proof_of_concept/) |

---

## EVIDENCE

| Что | Путь |
|---|---|
| Trials / протоколы | [`../acceptance/`](../acceptance/) |
| Сессия FE+AUTH+Sonar | [`../history/2026-08-11-session-fe-auth-sonar.md`](../history/2026-08-11-session-fe-auth-sonar.md) |
| Handoff документалисту 11 авг | [`../history/2026-08-11-documentalist-handoff.md`](../history/2026-08-11-documentalist-handoff.md) |
| IMP handoff | [`../history/2026-08-11-imp-documentalist-handoff.md`](../history/2026-08-11-imp-documentalist-handoff.md) |
| CONN Admin/activate | [`../history/2026-08-11-conn-admin-activate/`](../history/2026-08-11-conn-admin-activate/) |
| RES internal / sonar dig | [`../history/`](../history/) |
| Sonar closeout (прошлый baseline) | [`../sonar-closeout-report.md`](../sonar-closeout-report.md) |
| Alpha presentation (срез) | [`../history/releases/alpha-1.0.0/acceptance/01-presentation-kdt.md`](../history/releases/alpha-1.0.0/acceptance/01-presentation-kdt.md) |

---

## Void (не восстанавливать)

| Что | Почему |
|---|---|
| Presentation tool / `presentation-drafts` | Deck из INDEX + topics |
| OWASP ZEST → prettyK | Чужой формат |
| Smart Pre-Run Sanitizer | Тихий «фикс» врёт акту |
| Intent-to-DOM synthesizer | Промпт-магия |
| rapidfuzz-Phase-3 / Healenium заранее | Не канонизировать стек heal |
| Старые ID SH/AB/TP/ZS/SS | Агентский чулан |
| Selenoid + docker.sock в ферме | Снято — [`runtime-shell.md`](runtime-shell.md) |
