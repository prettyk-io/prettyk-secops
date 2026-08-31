# Cosmoport 2.0: матрица сканеров и минимальный контур

> **Статус:** `evolve` / research, не канон. Документ не меняет утверждённый Cosmoport backlog без отдельного решения.
> **Дата:** 29 августа 2026.

## 1. Вопрос

В старом списке жизненного цикла рядом стоят SonarQube, PTAI, Solar AppScreener, Trivy,
CodeScoring, Kaspersky Container Security, PT Sandbox и существующий DAST. Это не означает,
что все они должны быть обязательными шагами одного pipeline. Сначала нужно разделить:

- разные классы анализа;
- дублирование capability;
- обязательный pipeline и optional adapter;
- статический file/malware scan и динамический sandbox.

## 2. Подтверждённые capabilities

| Инструмент | Что подтверждено источниками и контекстом | Класс | Вывод для Cosmoport |
|---|---|---|---|
| **SonarQube** | Классический code quality + статический анализ исходников; точный состав security rules и edition-dependent возможностей требует проверки по конкретной версии/лицензии | SAST / quality | Кандидат на основной SAST-контур, но не считать его заменой SCA, malware scan или DAST |
| **Trivy** | Сканирует container image, filesystem, Git repository, VM image и Kubernetes; ищет vulnerabilities, IaC misconfigurations, secrets, SBOM и licenses | vuln/SBOM/IaC/secrets | Сильный минимальный open-source baseline для образов, репозитория и IaC |
| **CodeScoring** | SCA, OSA, SBOM, license compliance, malware-компоненты, secrets, policy engine, dependency graph, CI/IDE/репозиторные режимы | SCA / OSA / secrets / governance | Не просто дубль Trivy: уникальная ценность в supply-chain policy, российских базах, OSA/protestware и управлении организацией |
| **PTAI / PT Application Inspector** | По вторичной карточке TAdviser заявлены SAST, SCA с reachability и транзитивными зависимостями, secrets, Config-анализ, JSA DSL и анализ вредоносной логики через MOLOT; исторически также заявлялись DAST/IAST и exploit validation | AppSec / SAST / SCA | Маркетинговый/вторичный claim без подтверждённой поставки и нашего execution evidence; не считать enterprise capability и не включать в baseline |
| **Kaspersky Container Security** | Официальная справка 2.5: registry/image/repository/IaC scanning на vulnerabilities, malware, secrets и misconfiguration; CI/CD, SBOM SPDX/CycloneDX, JSON/HTML, cluster benchmarks, admission/runtime policies, monitoring, API и file-threat protection | container security platform / vuln / malware / posture / runtime | Не просто Trivy-дубль: широкий container-platform control layer; optional adapter до проверки лицензии, deployment и фактической потребности в runtime/admission |
| **Solar appScreener** | На официальной странице RT-Solar заявлены SAST, DAST и OSA; OSA включает SCA, SCS и оценку лицензионных рисков; также заявлены binary SAST, корреляция SAST/DAST, Fuzzy Logic Engine, 36 языков и 10 форматов исполняемых файлов | AppSec / SAST / DAST / SCA / SCS / license risk | Product claims зафиксированы, но enterprise-качество, coverage и пригодность для нашего контура не доказаны; не включать в baseline и не считать заменой SonarQube/ZAP без PoC |
| **ClamAV** | Open-source GPLv2 antivirus engine; daemon/CLI, signed databases, archive extraction, Office/PDF/PE/ELF/Mach-O и archive-bomb protections | file malware scan | Отдельный synchronous file gate для загруженных документов и артефактов; не sandbox |
| **YARA** | Rule-based pattern matching для идентификации/классификации malware; CLI и Python extension | custom malware rules | Дополнительный слой сигнатур/организационных правил рядом с ClamAV, не самостоятельная поведенческая песочница |
| **PT Sandbox** | В рамках текущего требования рассматривается как динамический анализ подозрительных файлов | malware detonation | Не помещать в общий каждый-commit pipeline; отдельная async capability с quarantine, retention и явным verdict |
| **Blackbox** | Во внутренних материалах найден только lifecycle/UI `stepId=blackbox`, гипотеза `WHEN_BLACKBOX` и привязка к `dast-include`; описание движка, vendor, API, входов/выходов и evidence contract отсутствует | unknown / unverified | Не считать PT Blackbox или отдельным DAST capability. Удалить из product matrix до получения первичного документа или живого execution evidence |

## 3. Что ещё требует отдельного подтверждения


| Инструмент | Что нужно подтвердить | Почему нельзя принять решение сейчас |
|---|---|---|

| **PTAI / PT Application Inspector** | Точный состав текущей версии/edition, лицензируемые модули DAST/IAST/exploit validation, форматы результата и deployment | Core AppSec scope подтвержден вторичным источником, но без vendor matrix нельзя назначать все модули обязательными |
| **Solar appScreener** | Версию/edition для сравнения, состав лицензируемых SAST/DAST/OSA-модулей, API/export и условия offline-поставки | Официальный лендинг подтверждает capabilities, но не даёт полного коммерческого контракта и не доказывает, что каждая функция есть в каждой редакции |

Отсутствие подтверждения не является отрицательным verdict. Это `open` до получения
официальной product matrix, конкретного edition и условий лицензирования.

## 4. Overlap по задачам

| Задача | Минимальный кандидат | Возможный overlap | Граница |
|---|---|---|---|
| Code quality и SAST | SonarQube | PTAI, Solar appScreener, частично CodeScoring | Один primary SAST в обязательном pipeline; Solar может стать enterprise-альтернативой, но не должен без решения запускаться вторым SAST |
| Dependency CVE/SBOM | Trivy | CodeScoring SCA, Solar OSA/SCA, KCS | Trivy даёт lean baseline; CodeScoring и Solar добавляют supply-chain depth; выбрать policy owner и не плодить одинаковые gates |
| License compliance | Trivy basic license scanner | CodeScoring SCA/OSA, Solar OSA | CodeScoring и Solar имеют более широкий governance/supply-chain scope; нужен один владелец policy и evidence |
| Secrets | Trivy secret scanner | CodeScoring.Secrets, SAST tools | Один быстрый PR gate плюс один policy-oriented enterprise layer, если он нужен; не запускать три одинаковых сканера |
| IaC/Kubernetes misconfiguration | Trivy | KCS и cloud-security suites | Trivy для baseline; KCS только после подтверждения container/runtime scope |
| Uploaded document malware | ClamAV + YARA | PT Sandbox | Синхронный cheap gate отдельно от pipeline; sandbox асинхронно и только для подозрительных/политически выбранных файлов |
| Runtime web security | Existing scanner Demon / ZAP | Solar appScreener DAST, исторически PTAI DAST | Оставить отдельный DAST-контур, пока Solar не выбран как его явная замена с подтверждённым workflow и coverage |


## 4a. PTAI: что именно подтверждено

По карточке PT Application Inspector на TAdviser (вторичный источник, обновление страницы
21 августа 2026 года) продукт нельзя считать просто ещё одним линтером. Зафиксированы
следующие конкретные capabilities:

- SAST для исходного кода и пользовательские правила анализа через JSA DSL;
- SCA с анализом достижимости уязвимой функции и транзитивных зависимостей (ветка 4.10);
- поиск секретов в коде с проверкой достижимости;
- анализ конфигурационных файлов через отдельное Config-ядро (ветка 6.0);
- ML-анализ подозрительной/вредоносной логики в исходном коде через MOLOT; в описании
  версии 6.0 явно названы утечки данных, backdoor, загрузка и выполнение внешнего кода;
- project/branch-oriented workflow, агенты, API и CI/CD-интеграция.

Карточка также цитирует более раннее описание PT AI 4.0, где заявлены SAST, DAST, IAST
и SCA, а также автоматическая генерация безопасных эксплойтов для подтверждения
эксплуатируемости. Это полезный исторический сигнал о breadth продукта, но не принимается
как безусловный scope текущей поставки: нужно проверить конкретную версию, edition,
лицензионные модули и deployment перед тем, как назначать PTAI обязательным DAST/IAST-шагом.

Практический verdict для Cosmoport: PTAI — **непроверенный vendor claim**, а не сильный
enterprise adapter. Его возможная уникальность относительно SonarQube — контекстный
SCA/reachability, кастомные JSA-правила, подтверждение exploitability и анализ вредоносной
логики в коде, но в нашем контуре ни одна из этих особенностей не имеет execution evidence.
Относительно CodeScoring пересечение по SCA/secrets очевидно; до реального PoC нет оснований
покупать ему отдельное место в архитектуре только за счёт списка функций.

## 4b. Solar appScreener: что именно подтверждено

По официальным страницам RT-Solar vendor описывает Solar appScreener не как ещё один
SAST-инструмент, а как enterprise AppSec suite. Это описание является product claim, а не
доказательством качества или пригодности для нашего контура. В заявленный scope входят:

- SAST и DAST;
- OSA с SCA, SCS и оценкой лицензионных рисков;
- бинарный SAST для десяти форматов исполняемых файлов;
- анализ 36 языков программирования;
- корреляция SAST/DAST и Fuzzy Logic Engine для снижения дублирующих срабатываний;
- интеграции с Git/Subversion, webhook-потоком GitLab/GitHub/Bitbucket, Jira, CI/CD,
  SonarQube, JSON API и CLI.

Официальные страницы также указывают ветку 3.15, поддержку ГОСТ Р 71207–2024,
скачивание SBOM, сертификат ФСТЭК № 4825 от 3 июня 2024 года и регистрацию в реестре
отечественного ПО. Эти claims подтверждают breadth продукта, но не заменяют проверку
конкретной редакции и состава лицензии.

Практический verdict для Cosmoport: Solar appScreener — **vendor product claim**, не
доказанный enterprise suite для нашего применения. Теоретически он может заменить часть
связки SonarQube/SCA/DAST, но это нельзя выводить из лендинга. До PoC с измеримыми coverage,
false positives, gate semantics, exports и evidence он исключён из baseline и не должен
получать статус primary или trusted adapter.

## 4c. Blackbox: подтверждённого продукта нет

Внутри репозитория Blackbox найден только в двух неканонических материалах по UI портала:

- `frontend/docs/source/tocompose/2026-08-12-cosmo-portal-settings-wave1.md` — строка
  жизненного цикла рядом с «Выполнение автотестов» и «OWASP scanner», а также `stepId=blackbox`;
- `frontend/docs/source/tocompose/2026-08-12-pal-lc-stage-map-draft.md` — гипотеза
  `WHEN_BLACKBOX`, привязка к `dast-include` и явная пометка, что соответствие STAGE/WHEN
  ещё не подтверждено.

В документах отсутствуют сведения о том, что именно выполняется: тип тестирования, target,
генерация трафика, oracle/verdict, severity model, повторяемость, credentials, API, CLI,
артефакты, формат findings, evidence или связь с PT Security. В коде `orchestrator` и в
`sanctuary` реализации или контракта Blackbox также не найдено.

Следовательно, текущая честная классификация — **unverified portal placeholder**, а не
«enterprise black-box testing» и не доказанный PT-продукт. Название нельзя использовать
для capability matrix, архитектурного решения или marketing claim. Для реабилитации нужны
первичный vendor document либо живой запуск с зафиксированными входом, действием, выходом,
finding/evidence и повторяемым execution trace.

## 5. Рекомендуемый минимальный контур

### Обязательный pipeline

```text
build/test
  -> SonarQube (primary SAST + quality gate)
  -> Trivy (image/filesystem/IaC/secrets/SBOM baseline)
  -> deploy
  -> existing DAST scanner / ZAP
  -> normalized findings + gate + evidence ledger
```

### Отдельные capabilities

```text
uploaded file
  -> quarantine/object storage
  -> ClamAV
  -> YARA rules
  -> clean | blocked | needs_dynamic_analysis
  -> optional PT Sandbox (async, isolated, retention-controlled)
```

CodeScoring следует держать как **optional supply-chain adapter** до принятия конкретной
потребности заказчика. Его нельзя выкинуть как простой дубль Trivy, но и нельзя делать
обязательным третьим dependency scanner без решения, какие из его OSA/SCA/license/policy
функций действительно входят в продукт.

PTAI и Solar AppScreener остаются `unverified candidate adapters`, а KCS — `candidate
adapter`; ни один из них не является обязательной стадией.
Условие включения для любого из них: доказанная capability, которой нет в выбранном
baseline, плюс понятная лицензия, формат результата и владелец policy. KCS подтверждён как
более широкий container-platform слой, а breadth PTAI и Solar пока остаётся vendor claim
без нашего execution evidence; ничего из этого не следует включать в pipeline автоматически
только потому, что продукт умеет сканировать.

## 6. Архитектурные последствия

1. Capability Broker должен различать `pipeline_step` и `async_analysis_service`.
2. File scanner не должен получать произвольный сетевой доступ к приложению: только
   quarantine object, hash, metadata и ограниченный результат.
3. Sandbox verdict нельзя смешивать с обычным SAST/DAST finding без provenance:
   `source_tool`, `analysis_type`, `artifact_sha256`, `engine_version`, `policy_version`.
4. Все внешние результаты проходят один нормализатор Finding, но сырые SARIF/JSON и
   оригинальные verdict сохраняются в Evidence Ledger.
5. «Сканер включён» в UI должно означать capability и policy profile, а не просто
   наличие галочки старого портала.

## 7. Источники

- SonarQube documentation: <https://docs.sonarsource.com/sonarqube-server/>
- Trivy homepage and README: <https://trivy.dev/> and <https://github.com/aquasecurity/trivy>
- CodeScoring functional documentation: <https://docs.codescoring.ru/functionality>
- ClamAV documentation: <https://docs.clamav.net/>
- YARA project documentation: <https://virustotal.github.io/yara/>
- Existing DAST boundary: [`sanctuary/pure/split-canon.md`](../../sanctuary/pure/split-canon.md)
- Kaspersky Container Security 2.5, официальная справка:
  <https://support.kaspersky.ru/container-security/2.5/292907> (scope решения),
  <https://support.kaspersky.ru/container-security/2.5/267228> (CI/CD),
  <https://support.kaspersky.ru/container-security/2.5/306285> (новое в 2.5),
  <https://support.kaspersky.ru/container-security/2.5/265362> (JSON/HTML/SBOM API),
  <https://support.kaspersky.ru/container-security/2.5/300753> (файловые угрозы)
- PT Application Inspector / PT AI, карточка TAdviser (вторичный источник; официальный
  сайт PT Security в текущем исследовании недоступен через TLS):
  <https://www.tadviser.ru/index.php/%D0%9F%D1%80%D0%BE%D0%B4%D1%83%D0%BA%D1%82:PT_Application_Inspector_(PT_AI)>
- Solar appScreener, официальные страницы RT-Solar:
  <https://rt-solar.ru/products/solar_appscreener/> (scope продукта),
  <https://rt-solar.ru/products/solar_appscreener/architecture/> (архитектура и интеграции),
  <https://rt-solar.ru/products/solar_appscreener/documents/> (white paper и сертификаты),
  <https://rt-solar.ru/products/solar_appscreener/updates/> (ветка 3.15 и обновления),
  <https://rt-solar.ru/products/solar_appscreener/ai_agent/> (AI Triage/CodeFix)
- Внутренние неканонические UI-источники для Blackbox:
  [`frontend/docs/source/tocompose/2026-08-12-cosmo-portal-settings-wave1.md`](../../frontend/docs/source/tocompose/2026-08-12-cosmo-portal-settings-wave1.md),
  [`frontend/docs/source/tocompose/2026-08-12-pal-lc-stage-map-draft.md`](../../frontend/docs/source/tocompose/2026-08-12-pal-lc-stage-map-draft.md)

## 8. Open research

- Для Solar appScreener, PTAI и KCS получить точную матрицу версий/редакций, состав
  лицензируемых модулей, API/export contract, offline deployment и условия поддержки.
- Blackbox не включать в дальнейшую capability-матрицу до получения vendor identity,
  product documentation или повторяемого execution evidence; отдельно выяснить, не было
  ли это только историческим названием DAST-шага портала.
- Compare export formats, API/agent model, offline deployment and license terms.
- Decide whether CodeScoring is a mandatory enterprise profile or optional adapter.
- Define file limits, archive bomb policy, retention and false-positive workflow for the
  ClamAV/YARA service.
- Validate the minimal contour with one representative repository, one container image,
  one IaC bundle, one uploaded Office/PDF document and one DAST target.

## 9. Рабочее decision proposal

До получения коммерческой и технической матрицы поставок принять только рабочий профиль,
не каноническое решение:

1. Оставить обязательным baseline `SonarQube + Trivy + existing DAST/ZAP`.
2. Держать Solar appScreener только как непроверенный candidate adapter, без статуса
   enterprise и без добавления вторым SAST/DAST/SCA-gate.
3. Проверить Solar на том же наборе артефактов, что и baseline: репозиторий, контейнерный
   image, IaC bundle и DAST target; отдельно проверить binary SAST и OSA, если они входят
   в выбранную редакцию.
4. Сравнить не количество findings, а coverage, дублирование, severity mapping, quality
   gate semantics, SARIF/JSON/API export, evidence provenance, время анализа и стоимость
   лицензии/эксплуатации.
5. Перевести Solar в primary suite только если он закрывает согласованный gap и позволяет
   удалить дублирующие обязательные gates без потери требуемой evidence coverage.
6. Не включать Blackbox в capability catalog или DAST baseline: сейчас это только
   неподтверждённое имя lifecycle-шага из старого UI-исследования.

Это proposal для следующего validation round. Он не меняет Cosmoport backlog, Pure Box
канон или границу сервисов.