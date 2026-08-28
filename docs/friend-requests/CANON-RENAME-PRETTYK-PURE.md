# CANON-RENAME-PRETTYK-PURE: Эволюция канонического профиля коробки secops-lab-pure → prettyk-pure

> `lane: ready` · 22 авг 2026.
>
> **Заявка на 2FA-промоцию в Sanctuary.**
> **Статус:** Предложение на рассмотрение Keeper и Максиму. Каноны в `sanctuary/` **не изменены**.
> **Адресаты:** Максим (Owner), Keeper (PO / Хранитель Канона).

---

## 1. Тезис

После успешного ребрендинга продукта в **`PrettyK`** (репозиторий `prettyk-io/prettyk-dev`, переменные `PK_*`, префиксы `.pk-*` и `--pk-*`, каноны `prettyk-core.md` и `ALTAR.md`) базовый профиль автономной поставки по-прежнему носит имя `secops-lab-pure`.

**Предложение:**
Гармонизировать имя первичного профиля коробки:
`secops-lab-pure` ➔ **`prettyk-pure`**.

Второй профиль остаётся без изменений: **`cosmo-custom`** (портал ЦБ / Cosmoport с бланками и локальной спецификой).

---

## 2. Мотивация и предпосылки

1. **Единство бренда:**
   Продукт называется **PrettyK**. Имя первичной автономной коробки `prettyk-pure` органично замыкает триаду:
   - Репозиторий: `prettyk-dev`
   - Организация: `prettyk-io`
   - Коробка (airgap box): `prettyk-pure`
   - Кастомная витрина: `cosmo-custom`

2. **Манифест ПРОСТОР (22 августа 2026):**
   Как зафиксировано на Алтаре: *«pure > primary, cosmo > secondary. Box canon first»*.
   Имя `prettyk-pure` напрямую отражает суверенность нашего решения: чистый, свободный от внешних привязок продукт в полной автономной комплектации.

---

## 3. Область применения изменений (Scope после 2FA)

После утверждения владельцем и прохождения 2FA потребуется согласованно обновить следующие поверхности:

| Область | Что меняется |
|---|---|
| **Sanctuary Каноны** | `sanctuary/pure/product-forks.md`, `sanctuary/pure/INDEX.md`, `sanctuary/pure/TEMPLE-CORE.md`, `sanctuary/pure/CHARTER.md` — замена названия профиля `secops-lab-pure` на `prettyk-pure` |
| **Документация и профили** | `docs/profiles/` (`secops-lab-pure.json` → `prettyk-pure.json`), `docs/profiles/README.md` |
| **Скрипты и конфигурации** | `sonar-project.backend.properties`, `sonar-project.frontend.properties` (профиль по умолчанию), CLI fallback |
| **Cursor Rules** | `.opencode/rules/product-forks.mdc` — актуализация имени первичного профиля |

---

## 4. Что остаётся неизменным (Invariants)

- **Архитектура коробки:** 100% автономность, работа в airgap, zero external dependencies.
- **Внутренний стек:** Playwright Browser Core, QWEN AI Assistant, scanner demon, Allure 3, DefectDojo, Live, Python/Node runtime.
- **Кастомный профиль `cosmo-custom`:** Сохраняет изоляцию в `sanctuary/custom/cosmo/` и локальный статус (в git не коммитится).
- **Dual-read fallback:** Поддержка чтения legacy-переменных и старых манифестов сохраняется.

---

## 5. Чек-лист перед 2FA-утверждением

- [x] Сформулирован ясный продуктовый тезис.
- [x] Проверено отсутствие конфликтов с архитектурой `pure > primary, cosmo > secondary`.
- [x] Каноны `sanctuary/` сохранены нетронутыми до явного решения Максима и Keeper.
- [ ] 2FA-сессия Максима и Keeper.
- [ ] Промоция в `sanctuary/pure/product-forks.md`.

---

*22 августа 2026. Обитель. Friend-request.*
