# Profile: `cosmoport-custom` — пак в портал Cosmoport
<!-- compose-request_51 -->


> **Не CANON** (пока).  
> Имя сущности: **`cosmoport-custom`**.  
> **Cosmoport = portal (ЦБ).** Мы **встраиваем коробку** [`secops-lab-pure`](secops-lab-pure.md) в этот portal.

## Тезис

Не второй продукт PK.  
**Integration pack:** коробка SecOps Lab ↔ ЖЦ портала Cosmoport:

```text
Cosmoport (portal)
└── app-code  →  builds[]  →  deploys[]  →  URL
         ↓ потребляет коробка (custom)
    meta.project_id  ·  infrastructure.base_url_override
```

Кейс ЦБ. К другому банку (Сбер и т.д.) — **та же коробка**, другой `*-custom` later.

## Входит в пак

- UI каскада под модель portal (сейчас mock: `CosmoportLadderFields`)  
- Admin Deploy registry, стыкующийся с тем же `project_id`  
- Будущий live API app/build/deploy, когда portal даст  
- Bank bringup / Selenoid portal — narrative и ops **этого** внедрения  
- Пресейл «как встроится в их Cosmoport»  

## Не обещаем

- Что mock = прод API Cosmoport  
- Что Cosmoport — бренд нашей коробки  
- Автосоздание Dojo Product из выбора app  
- Отдельный git-clone «чтобы не мешать pure» без приказа  

## Связь с коробкой

Pure = что продаём и гоняем до внедрения.  
Custom = как коробка **сидит внутри** portal Cosmoport.  
Общие эпики (hooks, DOJO, fuzz) не переезжают «в Cosmoport» — остаются в коробке.

## Lab FE users (local shell, пароль `verysecure`)

| Логин | Роль | Admin | внештатный / pre_release / акт |
|---|---|---|---|
| `admin-nshr@spaceport.cbr.ru` | НШР | да | да |
| `admin-sec@spaceport.cbr.ru` | Администратор ИБ | да | да |
| `expert-sec@spaceport.cbr.ru` | Эксперт ИБ | нет | mute |
| `admin` / `debug` | aliases → admin_ib | да | да |

Cut: [`../history/2026-08-12-roles-cosmoport-2bot-cut.md`](../history/2026-08-12-roles-cosmoport-2bot-cut.md).

## PAL (приятель пака)

> **Не CANON. Не друг / не hub FRIEND.** **PAL = приятель.**  
> Alias **PAL** · `lane: evolve`.  
> Inbox: [`../friend-requests/2026-08-12-pal-cosmoport-custom.md`](../friend-requests/2026-08-12-pal-cosmoport-custom.md).  
> Эпик: [`../ihsttypwnb-epic.md`](../ihsttypwnb-epic.md).  
> PoC Stage 2 (проблема): [`../proof_of_concept/06-stage2-platform-as-is.md`](../proof_of_concept/06-stage2-platform-as-is.md).  
> UI dig: global skill `browser-hands-remote` (CDP на bankvm). Отдельный трек от `product-forks`.

## Агенту

Фичи лесенки / portal bringup / PAL-волны → `profile: cosmoport-custom`.  
Не делать Cosmoport HTTP обязательным для default CI/lab коробки.  
Friend ladder: [`../friend-requests/2026-08-12-cosmoport-app-deploy-ladder.md`](../friend-requests/2026-08-12-cosmoport-app-deploy-ladder.md).
