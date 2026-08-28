# Cosmoport as-is (пайп) vs коробка SecOps Lab
<!-- compose-request_40 -->


> **Не CANON.** Research / chill note 2026-08-12.  
> Target env: `portal01.dev.stand.cosmo.cbr.ru` · кейс `cosmo-OWASP scanner Testing`.  
> Пайп: локальный DnD `gitlab-ci.yml` (не в репо).

## Контур A — сдача по ТЗ (пайп портала)

```text
Космопорт UI (модалка «Параметры для запуска»)
  → TARGET_URL (+ опц. bearer / scan type)
  → GitLab job scanner_universal_ci
  → генерация autorun YAML в job
  → scanner.sh -cmd -autorun
  → report.sarif.json → AppSecHub
```

Ожидаемый заказчиком слой: **CI-трубопровод** + сток. Без акта / Admin-программы / GatePolicy / Live / PrettyK — это не дыра ТЗ, это другой JTBD.

## Контур B — коробка SecOps Lab (отдельное назначение)

```text
SecOps Lab (коробка secops-lab-pure)
  → манифест + форма + PrettyK
  → назначение проверки / роли (НШР · Админ ИБ · Эксперт ИБ)
  → сценарии, фазз, auth bootstrap
  → Allure + DefectDojo honesty + Admin KPI/Evidence
  → (пак) cosmoport-custom: лесенка app → build → deploy → URL
```

**Операторский контур проверки**, параллельно SARIF→AppSecHub, не замена пайпа.

## Стык (когда скажем)

| Cosmo | Коробка |
|---|---|
| project uuid / код приложения | `meta.project_id` / карточка |
| сборка (домен/метка, коммит) | ladder `builds[]` |
| развёртывание | ladder `deploys[]` |
| `TARGET_URL` в модалке | `infrastructure.base_url_override` |
| SARIF → AppSecHub | параллельный контур; не ломать пайп |

**Правило:** пайп священен. Коробка — апсайд, не долг. Показ — когда выберем момент, одним кадром «CI+SARIF ‖ Lab+акт/гейты».

**Нарратив (нейтрально):** не «пайп плохой — коробка конфетка». Два JTBD: сдача сканера в ЖЦ+SARIF ‖ операторский контур проверки. Тон и цепь тезисов — [`../proof_of_concept/08-narrative-gap.md`](../proof_of_concept/08-narrative-gap.md).

## Не делать завтра утром

- Подменять job коробкой  
- Тащить SoT под их модалку  
- Писать hub mid-волны  
- Коммитить `.cursor/tmp_*` / creds  

БД стенда / референ UI — later (кормёжка).
