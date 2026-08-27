# Cosmoport Improved — QWEN создаёт домен, PrettyK проводит проверку

> **Статус:** `research / concept` — не канон, не backlog  
> **Дата:** 26 августа 2026  
> **Профиль:** `cosmo-custom` поверх `prettyk-pure`  
> **Связанное:** [`2026-08-27-cosmoport-domain-model.md`](2026-08-27-cosmoport-domain-model.md) · [`2026-08-27-cosmoport-ib-poc.md`](2026-08-27-cosmoport-ib-poc.md) · [`../../sanctuary/cosmo-strategy.md`](../../sanctuary/cosmo-strategy.md)

---

## 0. Главная идея

Сейчас Cosmoport создаёт приложения по одному. Это не фабрика домена, а медленная форма с десятью одинаковыми походами к кнопке. Для реального КИТС нужен другой сценарий:

```text
Пользователь → QWEN → готовый домен приложений
```

QWEN получает намерение на естественном языке, знает модель Cosmoport и стандартные имена pipeline-объектов, а затем одним действием:

- создаёт шесть приложений Level 1;
- создаёт три библиотеки Level 0;
- создаёт одну группу Level 2 с pipeline-only репозиторием;
- раскладывает девять drop-папок с исходниками по нужным репозиториям;
- создаёт десять Git-репозиториев;
- загружает в них исходники и стандартные pipeline-описания;
- строит связи иерархии;
- создаёт общий draft сборки Level 2;
- подготавливает релиз.

Человеку остаётся не механическая расфасовка, а то, что действительно требует решения: политики прогона, финальное имя команды и ответственные.

После запуска PrettyK продолжает уже существующий жизненный цикл: сборка, проверки, деплой, переход в выделенный `PrettyK SecOps Lab instance_id` и выполнение проверки. Никакого второго продукта. QWEN создаёт контур, PrettyK проводит его через security lifecycle.

---

## 1. Пользовательский запрос

Пример команды:

```text
QWEN, создай домен команды «Линкор».

Нужно:
  - 6 приложений Level 1 типа «Линкор»;
  - для каждого — кастомные build и deploy pipeline
    со стандартными именами Cosmoport;
  - 3 библиотеки Level 0;
  - одну группу Level 2, в которой лежит общий pipeline
    для всех приложений;
  - разложи 9 drop-папок с исходниками;
  - подготовь общий draft сборки и релиз.
```

QWEN не воспринимает этот запрос как просьбу открыть шесть одинаковых форм. Он компилирует его в **Domain Bootstrap Plan**.

### 1.1. Что QWEN должен понять сам

- «6 приложений» — шесть самостоятельных узлов Level 1.
- «3 библиотеки» — три узла Level 0, которые не являются приложениями и не деплоятся сами.
- «групповая» — один узел Level 2 и его pipeline-only репозиторий.
- «кастомный build/deploy pipeline» — pipeline-набор каждого приложения, названный по стандартному каталогу Cosmoport, а не произвольный текст пользователя.
- «9 drop-папок» — шесть source drops приложений и три source drops библиотек.
- «общий draft сборки 2 уровня» — агрегирующий план, который включает дочерние приложения и учитывает зависимости библиотек.
- «подготовить релиз» — создать release draft, но не запускать security lifecycle без явного подтверждения.

QWEN не должен заставлять человека повторно сообщать то, что уже следует из модели. Иначе это будет тот же Cosmoport, только с чатовым окном поверх.

---

## 2. Результат одной операции

### 2.1. Девять source drops

```text
drop/
├── apps/
│   ├── lincor-command/
│   ├── lincor-core/
│   ├── lincor-gateway/
│   ├── lincor-identity/
│   ├── lincor-ledger/
│   └── lincor-notifications/
└── libraries/
    ├── lincor-common/
    ├── lincor-contracts/
    └── lincor-security-config/
```

Названия выше — иллюстрация домена «Линкор». В реальном сценарии имена выдаёт стандартный name resolver Cosmoport и подтверждает пользователь на финальном шаге.

**Итого:** 6 drop-папок приложений + 3 drop-папки библиотек = **9 source drops**.

### 2.2. Десять репозиториев

```text
Gitea domain: lincor
│
├── Level 0 — libraries
│   ├── lincor-common
│   ├── lincor-contracts
│   └── lincor-security-config
│
├── Level 1 — applications
│   ├── lincor-command
│   ├── lincor-core
│   ├── lincor-gateway
│   ├── lincor-identity
│   ├── lincor-ledger
│   └── lincor-notifications
│
└── Level 2 — group
    └── lincor-platform-pipeline
```

**Итого:** 3 библиотеки + 6 приложений + 1 групповой pipeline-репозиторий = **10 репозиториев**.

Групповой репозиторий содержит только pipeline и декларацию состава группы. Исходников приложения в нём нет. Он не превращается в мусорный монорепозиторий «на всякий случай».

---

## 3. Что делает QWEN по шагам

### Раунд 1. Понимание и preview

QWEN строит предварительный план:

```text
Domain Bootstrap Plan: «Линкор»

  Level 0: 3 libraries
  Level 1: 6 applications
  Level 2: 1 group
  Repositories: 10
  Source drops: 9
  Custom pipelines: 12 minimum
  Aggregate build draft: 1
  Release draft: 1
```

До создания внешних объектов пользователь видит не девять форм, а компактный preview:

- дерево домена;
- список будущих репозиториев;
- соответствие `drop → repository`;
- pipeline-объекты для каждого приложения;
- зависимости библиотек;
- состав общего Level 2 draft;
- что останется выбрать вручную.

### Раунд 2. Создание и расфасовка

После подтверждения QWEN выполняет одну логическую операцию:

1. создаёт или резервирует Domain;
2. подключает нужный Gitea instance;
3. создаёт три Level 0 repository;
4. создаёт шесть Level 1 repository;
5. создаёт один Level 2 pipeline-only repository;
6. раскладывает девять source drops;
7. добавляет стандартные build/deploy pipeline-описания;
8. создаёт RepositoryBinding для шести приложений и трёх библиотек;
9. создаёт связи parent/child и зависимости библиотек;
10. строит общий pipeline группы.

Операция должна быть идемпотентной: повтор команды не создаёт вторые десять репозиториев с суффиксом `-copy-final-final`.

### Раунд 3. Подготовка к запуску

QWEN создаёт:

- draft сборки Level 2, включающий все шесть приложений;
- resolved dependency graph с учётом трёх библиотек;
- draft релиза;
- предварительный PipelinePlan;
- список незаполненных решений.

На этом QWEN останавливается. Релиз подготовлен, но security lifecycle ещё не запущен.

---

## 4. Что остаётся человеку

QWEN автоматизирует механику, но не присваивает опасные полномочия по догадке.

Перед финализацией человек выбирает:

1. **Политики прогона** — какие SAST/SCA/DAST/autotest-гейты обязательны, что блокирует релиз, что только предупреждает.
2. **Финальное имя команды** — display name и нормативное имя домена.
3. **Команду** — кто входит в Domain, какие группы видит.
4. **Ответственных** — владелец команды, `admin_sec`, `sec_expert`, `admin_service` и ответственные за приложения.
5. **Контур запуска** — stage/test/prod и связанный deploy target.

После этого план получает статус `ready_to_run`. До этого он остаётся draft.

---

## 5. Запуск: QWEN передаёт эстафету PrettyK

```text
QWEN
  │
  ├─ создал Domain
  ├─ создал 10 repos
  ├─ разложил 9 source drops
  ├─ построил Level 0–2 graph
  ├─ создал pipeline definitions
  ├─ подготовил Level 2 build draft
  └─ подготовил release draft
       │
       ▼
Человек выбрал политики, команду и ответственных
       │
       ▼
PrettyK Run Control Plane
       │
       ├─ компилирует PipelinePlan
       ├─ создаёт Build Batches
       ├─ запускает static security gates
       ├─ создаёт Deploy Batches
       ├─ выполняет deployment
       ├─ получает deploy URL / target metadata
       ├─ выделяет PrettyK SecOps Lab instance_id
       ├─ запускает Playwright + Fuzzer + ZAP
       ├─ собирает Findings и Evidence
       ├─ формирует Gate decisions
       └─ выдаёт результат и отчёт
```

### 5.1. Жизненный цикл

```text
Domain Bootstrap
  → Draft Build (Level 2)
    → Policy Selection
      → Ready to Run
        → Build Batches
          → Static Scans
            → Static Security Gate
              → Deploy Batches
                → Deploy Readiness
                  → PrettyK SecOps Lab instance_id
                    → DAST + Autotests + Fuzzer
                      → Dynamic Security Gate
                        → Admission Gate
                          → Release Decision
```

Здесь нет разрыва между «создали приложение» и «проверили приложение». Cosmoport создаёт и описывает контур, PrettyK доводит его до security admission.

---

## 6. Роли QWEN и PrettyK

| Область | QWEN | PrettyK |
|---|---|---|
| Намерение пользователя | Понимает естественный язык | Использует нормализованный план |
| Domain bootstrap | Создаёт draft и расфасовывает объекты | Хранит доменную модель |
| Git repositories | Создаёт через ForgeAdapter | Владеет связями и состоянием binding'ов |
| Source drops | Раскладывает по репозиториям | Хранит provenance загрузки |
| Pipeline names | Выбирает из стандартного каталога | Валидирует и компилирует |
| Group hierarchy | Строит Level 0–2 graph | Хранит canonical graph |
| Policies | Предлагает defaults | Человек утверждает, PrettyK исполняет |
| Build/deploy | Подготавливает draft | Run Control Plane запускает lifecycle |
| Security checks | Может объяснить план | Запускает DAST, Fuzzer, Playwright, ZAP |
| Evidence | Может показать preview | Создаёт immutable evidence chain |
| Admission | Не принимает решение сам | Gate и ответственный принимают решение |

QWEN — не автономный security-администратор. Он может быть очень умным, но подпись допуска из его воображения не получается.

---

## 7. Модель данных операции

```text
DomainBootstrapRequest = {
  domain_intent: string,
  application_count: 6,
  application_archetype: "lincor",
  library_count: 3,
  source_drops: 9,
  pipeline_policy: "standard-with-custom-build-deploy",
  group_level: 2,
  create_release_draft: true,
  launch: false
}
```

QWEN возвращает:

```text
DomainBootstrapPlan = {
  domain_draft: DomainDraft,
  repositories: RepositoryDraft[10],
  source_bindings: SourceDropBinding[9],
  app_nodes: AppNode[9],
  pipeline_bricks: PipelineBrickDraft[],
  pipeline_plan: PipelinePlanDraft,
  build_draft: BuildDraft,
  release_draft: ReleaseDraft,
  unresolved_decisions: [
    "run policies",
    "final team name",
    "team members",
    "responsibles",
    "deploy target"
  ],
  status: "draft"
}
```

Важно: `app_nodes: AppNode[9]` включает шесть приложений и три библиотеки, но библиотечные узлы имеют `level = 0` и не проходят самостоятельный deploy lifecycle.

---

## 8. Границы и здравый смысл

### Делает

- массовое создание доменного каркаса;
- создание 10 репозиториев в выбранном Gitea;
- загрузку 9 source drops;
- генерацию стандартных pipeline names;
- создание RepositoryBinding;
- построение Level 0–2 graph;
- создание общего Level 2 build draft;
- подготовку release draft;
- подготовку к выбору политик и ответственных.

### Не делает автоматически

- не выбирает за человека blocking policies для production;
- не назначает ответственного по случайному совпадению имени;
- не запускает deployment до явного подтверждения;
- не выдаёт security admission от имени пользователя;
- не создаёт исходники в групповой pipeline repository;
- не превращает Level 0 library в приложение;
- не скрывает частично неуспешную операцию за «готово».

### Ошибка должна быть атомарной

Если создание десяти репозиториев или загрузка девяти drops прервались, система должна показать:

- что создано;
- что не создано;
- какие объекты можно безопасно продолжить;
- какие операции требуют cleanup или ручного решения.

Предпочтительный режим — предварительная резервация и повторяемый bootstrap. Никаких полусозданных лесов, где семь репозиториев живы, три потерялись, а QWEN торжественно сообщает «успешно».

---

## 9. Почему это Cosmoport Improved

| Cosmoport сейчас | Cosmoport Improved |
|---|---|
| Приложение создаётся по одному | Domain создаётся одной командой |
| Человек вручную повторяет форму | QWEN компилирует намерение в bootstrap plan |
| Репозитории и связи создаются разрозненно | 10 репозиториев создаются как одна операция |
| Исходники раскладываются вручную | 9 source drops маршрутизируются автоматически |
| Pipeline names вводятся руками | QWEN использует стандартный каталог имён |
| Группы собираются после приложений | Иерархия строится сразу |
| Нет общего draft сборки | Level 2 build draft готовится автоматически |
| Релиз начинается с пустого экрана | Release draft подготовлен заранее |
| Security lifecycle отдельно | После запуска — прямой переход в PrettyK SecOps Lab |

Главное улучшение — не чат и не красивый wizard. Это переход от **единичного CRUD** к **компиляции доменного намерения**.

---

## 10. Связь с канонами PrettyK

Этот concept опирается на уже родившиеся направления:

- **Domain как Level −1** и multi-Gitea;
- **App Graph Level 0–3**;
- **RepositoryBinding**;
- **Pipeline Bricks** и стандартный каталог;
- **Plan Compiler**;
- **Batch DAG**;
- **Security Gates**;
- **Run Control Plane**;
- **Evidence Chain**;
- **PrettyK SecOps Lab instance_id**;
- **QWEN как ассистент, который понимает модель, но не принимает security-решения вместо человека**.

Это не новый второй продукт и не замена PrettyK SecOps Lab. Это улучшенный вход в ту же систему: QWEN быстро создаёт и связывает контур, PrettyK исполняет всё, что уже умеет.

---

## 11. PoC-граница

Для демонстрации достаточно:

1. одной команды QWEN;
2. шести приложений Level 1;
3. трёх библиотек Level 0;
4. девяти локальных drop-папок;
5. десяти mock или Gitea-репозиториев;
6. автоматически построенного дерева;
7. группового pipeline-only репозитория;
8. draft Level 2 build;
9. draft release;
10. экрана выбора политик, команды и ответственных;
11. кнопки запуска, которая передаёт выполнение в существующий PrettyK lifecycle.

Не требуется сначала строить полный live API Cosmoport. Mock может показать саму механику фабрики. Реальный Gitea подключается через `ForgeAdapter`, когда определён конкретный домен и контур.

---

## 12. Честный статус

- Это **desired product concept**, а не as-built claim.
- Названия приложений и pipeline'ов выше — пример; стандартный resolver должен быть формализован отдельно.
- QWEN bootstrap, массовая Git-операция и автоматический release draft ещё не реализованы в полном виде.
- Политики, ответственные и production deployment всегда требуют явного решения человека.
- Кандидат силён именно тем, что связывает уже существующие идеи в один поток; его не следует дробить обратно на десять несвязанных форм.

## Итоговый тезис

> **QWEN не создаёт приложение. QWEN создаёт готовый домен приложений.**
>
> Он принимает намерение, раскладывает девять drops в десять репозиториев, строит иерархию, собирает общий Level 2 draft и подготавливает релиз. Человек выбирает политику и ответственность. PrettyK запускает lifecycle, деплоит контур и передаёт его в выделенный SecOps Lab instance. Дальше работает уже существующая Обитель исполнения.