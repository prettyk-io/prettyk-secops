# pk-api-lab — внешне-провижининг (в репо исходников нет)

`pk-api-lab` — opt-in demo-таргет стенда: REST + OpenAPI + GraphQL + gRPC
(`bank.v1.AccountService`) на `:8090` / `:50051`. Нужен для opt-in сессионных
прогонов и gRPC-cascade проверок.

**Статус (PK-API-LAB-SRC, 25.09.2026):** build-контекст (Dockerfile + сервис) в
этом репозитории **отсутствует by design** — внешне-провижининг. В папке лежит
только пустой `proto_pack/`. Историческая стоянка источника (`kdt-api-lab`)
жила вне репо (переименование `kdt-* → pk-*`, ALTAR §534); в git-истории
`services/pk-api-lab` пусто, восстановить нечего. Образ `pk-api-lab:local`
собирается только после того, как контекст положен внешним провижинингом.

## Что ожидают потребители

- `services/session-template.yml` и `services/docker-compose.api-lab.yml`:
  `build: context ./pk-api-lab`, `image: pk-api-lab:local`, health `/health`,
  mount `./pk-api-lab/proto_pack:/proto_pack:ro`, DNS `pk-api-lab:8090`.
- `docs/stand.md` — таблица endpoints (контракт, когда api-lab поднят).
- Тесты (скипаются с явной причиной, пока контекста/пака нет):
  `test_session_isolation.py` (docker/lab), gRPC-cascade
  (`test_grpc_adapter_cascade.py`, `test_grpc_module_runtime.py`,
  `test_imp_api_triple_pipeline.py`, `test_imp_scope_smoke.py`).

## Чтобы включить (внешний провижининг)

1. Положить build-контекст: `services/pk-api-lab/{Dockerfile,app/…}`.
2. Положить gRPC-пак: `services/pk-api-lab/proto_pack/bank.proto`
   (`package bank.v1;`, `service AccountService { rpc Ping(…) returns (…); }`).
3. `docker compose -f services/docker-compose.api-lab.yml up -d --build`.

После этого docker/lab-скипы session-контура снимаются без правок кода
(`_infra_gap()` в `test_session_isolation.py` видит Dockerfile).
