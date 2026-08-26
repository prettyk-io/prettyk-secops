# Concept: Gemini Co-Pilot Fine-Tuning — Advanced AI Consultant for PrettyK

> **Статус:** `concept / raw — первый черновик`  
> **Дата:** 26 августа 2026 года  
> **Владелец:** Максим  
> **Профиль:** non-AirGap (для AirGap — менее продвинутый Qwen, см. [`spike/2026-08-26-ai-provider-matrix.md`](../spike/2026-08-26-ai-provider-matrix.md))

---

## Тезис

Сегодня PrettyK-драйвер (Buddy) работает как **bounded agent-исполнитель**: он понимает intent, строит skeleton, помогает составить proposal. Но он работает на общей модели — той же Gemini или Qwen, которую использует кто угодно для чего угодно.

Идея: **взять cloud-provided Gemini и дообучить / оттюнить её под наш домен.** Не generic «AI для QA», а именно под PrettyK: наш DSL, наши контракты, наши типовые intent-ы, наши evidence-цепочки, наши политики безопасности и гейтов. Превратить модель из дженерик-драйвера в **супер-консультанта**, который:

- понимает prettyK DSL и MethodId на уровне native;
- знает типовые паттерны проверок (логин → профиль → API → fuzz → evidence);
- умеет объяснить, почему finding классифицирован именно так, а не иначе;
- предлагает coverage gap на языке оператора, а не на языке статистики;
- помнит каноны Обители (admission, failsafe, честный контракт, heal без silent rewrite);
- задаёт правильные clarifying questions, а не generic «что проверить».

Это не замена детерминированного core и не замена локального Qwen-драйвера. Это **advanced AI-слой для non-AirGap**, который делает коробку не просто инструментом, а экспертом в комнате.

---

## Предварительный sanity check

**Что отличает концепт от текущего Gemini-провайдера.** Сегодня Gemini в non-AirGap — это generic модель, которой Buddy даёт промпт с контекстом. Она отвечает. Fine-tuning меняет игру: модель обучается на нашем корпусе intent-ов, DSL-сценариев, evidence-цепочек, classified findings и операторских решений. Она не просто «понимает promt» — она обучена на домене PrettyK.

**Риск, который нельзя игнорировать.** Fine-tuning — это ML-инженерия. Нужен dataset, нужна валидация качества, нужен retraining при изменении DSL. Это не «кинуть API-ключ и поехали». Это требует компетенций, которых у нас пока нет, и времени на эксперименты. Именно поэтому концепт должен пройти отдельный **ML Capability PoC** до любого Plan.

**Чего точно не делаем.** Не заменяем deterministic core. Не учим модель объявлять pass/fail без evidence. Не обучаем на production-секретах. Не делаем обученную модель обязательным компонентом — если она недоступна, система работает на untuned Gemini (или Qwen, или deterministic fallback). Не строим SaaS AI-платформу — это именно улучшенный консультант внутри коробки.

---

## Граница с существующим AI-provider контуром

Этот концепт — надстройка над тем, что уже зафиксировано в [`spike/2026-08-26-ai-provider-matrix.md`](../spike/2026-08-26-ai-provider-matrix.md):

| Слой | Что | Статус |
|---|---|---|
| Deterministic core | Всегда. Валидация, redact, evidence, gate. | As-built |
| Local Qwen | Optional, любой профиль. | PoC |
| Generic Gemini | Optional, только non-AirGap. Ключ в Admin. | PoC |
| **Tuned Gemini** | Optional, non-AirGap. Нужен отдельный ML PoC. | **Этот концепт** |

Оператор в Admin видит: «Gemini AI-консультант — tuned revision» как вариант существующего Gemini provider, а не как третий независимый фундамент. Его включение не отключает Local Qwen и не ломает fallback.

---

## Что потребуется для исследования

1. Определить, какие именно Gemini-модели поддерживают fine-tuning и на каких условиях (Google AI Studio / Vertex AI).
2. Собрать candidate training dataset: intent-ы, skeleton-ы, decisions, classified findings, операторские acceptance.
3. Определить метрики качества: насколько обученная модель лучше untuned Gemini в задачах clarification, error explanation и gap suggestion.
4. Проверить, остаётся ли fine-tuned модель за границей sensitive data — training dataset должен быть синтетическим или redacted.
5. Определить, как доставлять обученную модель: как managed endpoint, как downloadable adapter или как vendor-managed model.

---

## Research Round 1 — Discovery (26 августа 2026)

### Что подтверждают официальные материалы Google

В текущем Google Cloud контуре tuning — это не «переобучение Gemini с нуля», а managed-операция над доступной базовой моделью. В документации Google Cloud (сейчас раздел называется **Gemini Enterprise Agent Platform**) отдельно описаны supervised fine-tuning, preference tuning и reinforcement-learning fine-tuning. Для PrettyK первый кандидат — supervised tuning на текстовых входах/выходах и, возможно, function-calling примерах; preference/RL пока являются исследовательскими ветками, не обязательным стартом.

Managed-путь выглядит так: подготовить датасет в поддерживаемом формате, запустить tuning job в Google Cloud, получить версию tuned model/checkpoint и использовать её через управляемый inference API. Доступность tuning, форматы, регионы, лимиты и поддерживаемые базовые модели зависят от конкретной model ID и меняются быстрее, чем наш канон. Поэтому нельзя заранее обещать «Gemini 3.7 Flash tuned»: сначала выбирается модель, затем проверяется её tuning matrix в официальной документации и в целевом GCP-проекте.

### AI Studio и Vertex / Agent Platform — не одно и то же

**Google AI Studio / Gemini API** полезны для быстрой проверки промптов, формата ответа и generic Gemini-провайдера. Но для enterprise-пути PrettyK tuning должен рассматриваться через **Vertex AI / Gemini Enterprise Agent Platform**: там есть IAM, Cloud Storage для датасета, Model Registry/версии, audit controls, региональные и сетевые настройки, а также управляемая оценка и наблюдаемость. Наличие кнопки или API в AI Studio не означает наличие тех же гарантий хранения, доступа и жизненного цикла модели.

Практическая граница для продукта: AI Studio — discovery и маленький synthetic experiment; Vertex/Agent Platform — кандидат на controlled ML PoC и дальнейший non-AirGap deployment. До принятия решения нужно отдельно подтвердить договорные условия для выбранного режима, регион обработки, retention и exportability. В AirGap cloud path не существует вообще: Gemini должен быть скрыт и технически недостижим, как уже принято в provider matrix.

### Цена и эксплуатационная модель

Официальная pricing-страница указывает token-based billing для inference и отдельно предупреждает, что **tuned model endpoint тарифицируется как 1.5× базовая модель**. На срезе 26 августа 2026 для Gemini 3.7 Flash на global standard endpoint указаны promotional rates до 31 декабря 2026: `$0.75 / 1M input tokens` и `$3.75 / 1M output tokens`; с 1 января 2027 указаны `$1.50 / $7.50`. Это не полный TCO: отдельно нужно учитывать tuning job, Cloud Storage, evaluation, logging, network и возможный reserved/provisioned capacity. Финальную смету нельзя строить по одной таблице inference.

Следствие для PrettyK: tuned Gemini должен быть **optional и budget-visible**. Admin показывает provider, model revision, регион, лимиты и usage/cost status; включение не должно превращать каждую телеметрию и каждый run в дорогой cloud call. Базовый bounded flow остаётся deterministic, а вызовы консультанта должны быть явными, ограниченными и трассируемыми.

### Discovery verdict

Концепт технически реален как managed non-AirGap research direction, но название «fine-tuning Gemini» пока слишком широкое. Уточнённый объект следующего PoC: **одна поддерживаемая text-capable Gemini model + supervised tuning на redacted/synthetic PrettyK examples + side-by-side evaluation против untuned Gemini и deterministic baseline**. Не обещаем adapter, переносимость весов или поддержку каждой новой Gemini model family. Открытые модели с LoRA/QLoRA — отдельная ветка и не являются способом получить downloadable adapter от закрытого Gemini.

**Источники Round 1:**

- [Introduction to tuning — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning)
- [About supervised fine-tuning — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning/supervised-tuning)
- [Prepare supervised fine-tuning data — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning/supervised-tuning/prepare-data)
- [Tune Gemini models with supervised fine-tuning — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning/supervised-tuning/use)
- [Generative AI pricing — Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/pricing)

---

## Research Round 2 — ML Capability (26 августа 2026)

### Датасет: учим поведению, а не текущему миру

Для supervised tuning нужен качественный набор пар «контекст задачи → желаемый ответ» в поддерживаемом Google формате (обычно JSONL с диалоговыми `contents` и ролями). Конкретные минимумы, лимиты токенов и схема должны быть проверены для выбранной model ID перед запуском job; цифры из старых Gemini-рецептов нельзя переносить на новую модель механически.

PrettyK-корпус разумно разделить на независимые task families:

1. `intent → normalized proposal`: свободное описание превращается в валидный skeleton без потери исходного intent;
2. `incomplete/contradictory intent → clarification`: модель задаёт минимальный вопрос, действительно уменьшающий неопределённость;
3. `run + evidence → diagnosis`: объяснение bounded failure только по доступным фактам;
4. `finding + evidence → explanation`: классификация и человеческое объяснение без самостоятельного pass/fail;
5. `coverage/context → gap suggestion`: предложение пробела с явной маркировкой гипотезы;
6. `tool request → structured proposal`: function/tool call только как предложение для deterministic validator.

Датасет должен содержать вариативные формулировки на русском и английском, простые и длинные journeys, неполные и противоречивые inputs, неизвестные страницы, unsupported/опасные просьбы и чувствительные тестовые значения в виде placeholders. Train/eval/test нужно разделять по сценариям и доменным шаблонам, а не случайно перемешивать почти одинаковые примеры: иначе получим красивую метрику запоминания, а не переносимость на новый run.

### Eval: качество консультанта, не красота ответа

Google Cloud предоставляет отдельный Gen AI evaluation service и evaluation datasets; для PrettyK этого недостаточно без доменных проверок. Side-by-side нужно прогнать на одном frozen set для `untuned Gemini`, `tuned Gemini`, Local Qwen (если доступен) и deterministic baseline. Основные метрики:

- **contract validity:** доля ответов, которые проходят JSON/schema и PrettyK domain validation;
- **intent fidelity:** не исчезли ли цель пользователя, action, expected result и ограничения;
- **clarification utility:** вопрос действительно устраняет неопределённость, а не просто просит «уточнить»;
- **grounded diagnosis:** каждое утверждение об ошибке/находке связано с evidence или явно помечено как гипотеза;
- **safety/failsafe:** ноль попыток изменить workspace, scope, policy или объявить pass без approval/evidence;
- **secret hygiene:** ноль plaintext secrets в output, traces, logs и сохранённых артефактах;
- **operator preference:** слепая оценка полезности ответа и числа необходимых ручных правок;
- **latency, token use и стоимость:** качество не должно покупаться неконтролируемым cloud bill.

Порог promotion должен быть сравнительным: tuned revision принимается только если она даёт измеримый выигрыш над untuned Gemini по заранее выбранным задачам и не ухудшает safety, contract validity и secret hygiene. Human review нужен для небольшого критического набора; автоматический judge может ускорить итерации, но не является единственным доказательством качества.

### Приватность и управление жизненным циклом

В обучение не попадают production secrets, реальные cookies/tokens, customer payloads, необезличенные target URLs и сырые логи с персональными данными. Нужен отдельный data-preparation gate: классификация → redaction → синтетическая замена → проверка redaction → dataset manifest/hash. Стабильные placeholders должны сохранять структуру примера, но не позволять восстановить исходное значение.

Для controlled cloud PoC нужны как минимум IAM с раздельными ролями dataset/training/inference, Cloud Storage с ограниченным доступом, audit logging, региональная политика, retention/deletion policy и проверка условий Google для tuning data и prompts. При повышенных требованиях рассматриваются CMEK, VPC Service Controls и private connectivity. AI Studio API key и consumer-style experimentation нельзя считать эквивалентом enterprise data boundary Vertex/Agent Platform.

Каждая tuned revision должна быть связана с `base_model_id`, версией PrettyK DSL/канонов, dataset manifest hash, eval report, датой и владельцем. При изменении DSL или policy модель не «помнит» автоматически новую истину: её нужно переоценить, а при необходимости переобучить или заменить retrieval context. Старую revision нельзя молча использовать после несовместимого изменения контракта.

### RAG, prompting, tuning и adapters

**RAG** лучше подходит для быстро меняющихся материалов: текущий DSL reference, policy, release notes, run/evidence context. Он позволяет обновить источник без retraining и даёт ссылки на retrieved evidence. **Fine-tuning** лучше подходит для устойчивого поведения: формат proposal, стиль clarification, границы bounded assistant и повторяющиеся domain patterns. Для PrettyK разумен гибрид: tuned model отвечает за поведение, retrieval приносит текущую истину, deterministic core проверяет результат.

До tuning следует измерить prompt/system-instruction, few-shot и context-cache baseline. Если они дают нужное качество, fine-tuning будет лишним operational burden. Preference tuning или RL fine-tuning имеют смысл позже, когда накопятся pairwise preferences или проверяемая reward function; они не являются быстрым способом починить плохой DSL-контракт.

Термин **adapter** требует дисциплины. В документации Google отдельные LoRA/QLoRA-рекомендации относятся к open models/Model Garden. Для закрытого managed Gemini нельзя обещать PrettyK downloadable LoRA adapter или portability между провайдерами. На текущем этапе планируем managed tuned model/version; portability остаётся открытым вопросом, а не acceptance criterion.

### ML Capability verdict

Capability PoC реалистичен при малом scope и synthetic/redacted data. Команде нужны domain owner, data curator, evaluation engineer и специалист по Google Cloud IAM/MLOps; полноценная исследовательская ML-команда для первого supervised experiment не обязательна. Но без владельца датасета и regression eval получится не «супер-консультант», а дорогой генератор уверенных ответов. Это достаточная причина держать направление в `research / evolve`, а не в production или каноне.

**Источники Round 2:**

- [Prepare your evaluation dataset — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-dataset)
- [Gen AI evaluation service overview — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview)
- [Ground responses using RAG — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/ground-responses-using-rag)
- [Security controls for Generative AI — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/security-controls)
- [Tuning recommendations with LoRA and QLoRA — Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-garden/lora-qlora)

---

## Research Round 3 — Product Vision (26 августа 2026)

### Где живёт функция

Tuned Gemini не должен становиться отдельным «магическим мозгом» рядом с Buddy. Продуктовая схема — это вариант Gemini внутри существующего provider routing:

```text
Admin policy + operator intent
        ↓
deterministic preflight / redaction / task classification
        ↓
optional retrieval of current DSL, policy and evidence context
        ↓
Gemini variant: tuned revision | generic Gemini | Local Qwen | deterministic fallback
        ↓
structured proposal / diagnosis / clarification
        ↓
deterministic validation + explicit operator approval
        ↓
workspace change or run + evidence
```

Admin хранит не «обучающуюся кнопку», а понятную карточку provider: `enabled`, profile (`non-AirGap`), base model, tuned revision, endpoint/region, evaluation status, dataset manifest hash, last validation date, token/cost budget и fallback policy. По умолчанию tuned revision не получает права применять изменения. В AirGap карточка Gemini, endpoint и все связанные настройки отсутствуют и технически заблокированы; Local Qwen и deterministic Buddy работают по текущей матрице.

Buddy показывает оператору, какой вариант реально ответил: `Gemini tuned / revision`, `Gemini generic`, `Qwen` или `deterministic`. В ответе сохраняются безопасные provenance-поля — model revision, request/task id, input/context hashes и ссылки на evidence — но не секреты и не лишний plaintext prompt. Если tuned endpoint недоступен, истёк бюджет, не прошёл validator или не хватает evidence, система честно откатывается к следующему разрешённому уровню, а не делает silent rewrite.

### Before / after — проверяемое отличие

**До, generic Gemini:** оператор пишет «проверь логин и найди проблемы». Buddy получает общий контекст и может попросить слишком общий вопрос, перепутать action с expected result, предложить несуществующий шаг или выдать длинное объяснение без привязки к evidence. Это не утверждение о каждом ответе generic Gemini, а класс baseline-гипотез, который нужно измерить на frozen set.

**После, tuned revision:** модель распознаёт PrettyK task family, предлагает нормализованный skeleton в ожидаемом формате, задаёт минимальный вопрос при конфликте, использует MethodId/DSL vocabulary и отделяет факт от гипотезы. В finding-разборе она объясняет наблюдаемую цепочку `intent → run → evidence → finding`, но не объявляет pass и не меняет workspace. Пользователь получает не «более умный чат», а меньше ручных исправлений и более короткий путь от intent к проверяемому proposal — только если это подтверждено eval.

### Рекомендуемый rollout

1. **Offline/shadow:** tuned и untuned получают одинаковые redacted inputs, но ответ tuned не виден оператору и ничего не применяет; собирается side-by-side report.
2. **Opt-in advisory:** доступ только в non-AirGap Admin для выбранного workspace/оператора; все proposals проходят старые deterministic gates.
3. **Canary revision:** ограниченный процент задач и жёсткий budget/rate limit; автоматический rollback на generic Gemini/Qwen/deterministic mode при drift или safety regression.
4. **Controlled availability:** tuned revision можно рекомендовать для подходящих task families, но не делать обязательной для базового сценария и не превращать в silent default.

Минимальный первый продуктовый срез — не «полная AI-платформа»: одна model revision, один или два bounded advisory task-а, Admin toggle, provenance, budget guard, side-by-side eval и честный fallback. Function calling, preference/RL tuning, автоматическая retraining pipeline и multi-tenant personalization остаются следующими исследованиями.

### Product vision verdict

Идея проходит здравый смысл, если назвать её **optional tuned Gemini advisor for non-AirGap**, а не автономный PrettyK brain. Её ценность — устойчивое доменное поведение поверх изменяемого retrieval context; её доказательство — contract/safety/evidence metrics и операторская экономия правок. Решение о Plan возможно только после ML Capability PoC с положительным side-by-side результатом.

**Финальный статус этого research:** `research / evolve / raw input`. Канон, backlog и provider matrix этим документом не изменяются. Следующий безопасный шаг — отдельный ML Capability PoC с synthetic/redacted dataset и frozen evaluation set, не production deployment.