# Config overlays

## Bank MethodId overlay — что это простыми словами

Банку не нужны все 300 MethodId в первой стрелке AC.  
**Overlay** — JSON-файл «наш короткий список / свои имена», без правки `method_id.py`.

| Поле | Зачем |
|------|--------|
| `aliases` | Своё имя → существующий MethodId (`БанкНажать` → `Нажать`) |
| `extra` | Новое имя → wire `["webdriver","open"]` |
| `ui_extra` | Добавить имя в **корень** Ctrl+Space |
| `ui_hide` | Убрать шум из корня (resolve остаётся) |
| `ui_only` | Жёсткий whitelist: в корне **только** эти имена |

**Как включить:** скопируй `bank_method_overlay.example.json` → `bank_method_overlay.json`  
(или путь в `PK_METHOD_OVERLAY`). После смены — `npm run generate:method-ids`.

Пример «только дым банка в корне»:

```json
{
  "aliases": { "БанкНажать": "Нажать" },
  "ui_only": ["Открыть", "Нажать", "ВставитьЗначение", "ПроверитьТекстНаСтранице", "HttpGet", "Сканер"]
}
```
