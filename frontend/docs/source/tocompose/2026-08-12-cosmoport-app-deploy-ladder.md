# FRIEND-REQUEST: cosmoport-custom — лесенка portal Cosmoport → коробка
<!-- compose-request_42 -->


> **Не CANON.** **`lane: evolve`**. Пак: **[`cosmoport-custom`](../profiles/cosmoport-custom.md)** (встройка коробки в **портал** Cosmoport / ЦБ).  
> Ladder UI **landed** (mock). Живой API portal — later.  
> Коробка: [`secops-lab-pure`](../profiles/secops-lab-pure.md) · dual-rail: [`product-forks-dual-rail`](2026-08-12-product-forks-dual-rail.md).

## Зачем

Коробка умеет URL вручную. При внедрении в **портал Cosmoport** нужен каскад ЖЦ портала: приложение → сборка → деплой → URL в форму.  
Без эндпоинта portal — mock. Это не «второй продукт», а стык коробки с portal.

## Лесенка (модель портала)

```text
Cosmoport (portal, ЦБ)
└── app-code (= meta.project_id в коробке)
    └── builds[]
        └── deploys[]
            └── URL → infrastructure.base_url_override
```

Оператор в коробке идёт по селекторам portal, не пишет URL с нуля.

## UX формы (после stub)

1. **Селектор с автокомплитом** — список приложений, на которые у юзера есть назначенный доступ (endpoint портала / Космопорт). Выбор = код приложения (условно `owasp-…`) → сущность `meta.project_id` (или будущий явный ключ — только по приказу в SoT).
2. **Дропдаун «Сборка»** — N сборок выбранного приложения.
3. **Дропдаун «Деплой»** — M развёртываний выбранной сборки.
4. По выбору деплоя — **разлочить / заполнить** `base_url_override` (и при необходимости смежные поля). Поля больше не «просто текст вслепую», а каскад.

## Dojo / Admin

Чарт/якорь `project_id` — **коробка** (ADM-DOJO, pure). Пак cosmoport-custom только кормит тот же код из лесенки portal.  
Не iframe Dojo.

## Блокер сейчас

Грузить неоткуда: **эндпоинта списка приложений (и каскада build/deploy) нет.**  
Нужна **заглушка** (lab fixture / mock API), чтобы сверстать селекторы и проводку в formData.  
**Не стартуем код до визита обители** — только фиксация тезиса.

## Куда дозреет

- Секция FRIEND `product-forks` / admin-integrations — при promote.  
- SoT: не расширять `manifest.json` без приказа; stub на `project_id` / `base_url_override`.

## Не обещаем

- Живой Cosmoport API в этом спринте  
- Что Cosmoport = бренд коробки  
- Multi-tenant RBAC «как в банке завтра»  
- Что stub = прод-интеграция  
- Автосоздание Product в Dojo из выбора  
- Перепись SoT «заодно»
