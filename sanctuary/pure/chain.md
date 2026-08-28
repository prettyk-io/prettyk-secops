# Цепь — запись потока, подмены, глаголы MethodId

> **CANON** — hub topic. Slice: **11 августа 2026**.  
> Реестр: [`INDEX.md`](INDEX.md).  
> QUEUE/EVIDENCE: [`../imp-api-modules-epic.md`](../imp-api-modules-epic.md) § CHAIN · acceptance 19 · friend-request ladder.

## Тезис

Модуль **Цепь** — свой бизнес-поток под проверку: записать/обрезать шаги → карта подмен → materialize → действие глаголом MethodId.  
Сканер и низкоуровневый HAR остаются инструментами; Цепь не подменяет Auth-модуль входа (`auth=chain` логин — другое).

## Глаголы PrettyK (без `режим=`)

| PrettyK | Смысл |
|---|---|
| `ВыполнитьЦепь id` | play: materialize → importHar |
| `СканированиеЦепи id` | удар: + sequence active scan |
| `РасследованиеЦепи id` | isolate context → sequence / обход → restore |
| `ПодготовитьЦепь id` | только precondition (фугас setup) |
| `ФаззингЦепи id` | prepare(pre) → attack targets → `ФаззингВолна` |

Низкий уровень (`ИмпортHAR`, `СканПоследовательности`, …) остаётся.

## Карта и значения

| Это | Не это |
|---|---|
| Карта = `slots[]` (где менять) | Fuzz corpus / SecLists |
| Значения = properties data-модуля (`value_pack_module`) | CSV как SoT карты эндпоинтов |

См. также [`data-modules.md`](data-modules.md).

## Чужой HAR ≠ Цепь

| Путь | Смысл |
|---|---|
| Resources `har_file` | Чужой `.har` → import / sequence |
| Модуль Цепь | Свой поток + подмены + глаголы |

## Не обещаем

- Silent active scan от галочки модуля  
- Живой scanner sequence / тяжёлый AS как default без opt-in и согласованного контура  
- Что Цепь = промышленный «полный банк DAST»  
- Подмену [`discovery-heal.md`](discovery-heal.md) (дно)

Честность слота: [`honest-contract.md`](honest-contract.md).
