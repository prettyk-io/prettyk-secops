# Cosmoport 2.0 — Grand Handoff Pack

> Status: discovery handoff, not yet a new canon decision
> Date: 2026-08-29
> Audience: Cosmo/Gemini, Cosmoport2 maintainers, later implementers
> Source of truth for product decisions: `sanctuary/cosmoport2/`

## 0. Mission

Cosmoport 2.0 is not a visual clone of Cosmoport 1.0. It is a sovereign run
control plane for secure software delivery:

```text
domain -> application -> pipeline/brick graph -> compile -> run
       -> batches -> findings -> security gate -> evidence/audit
```

The handoff has to preserve two kinds of truth at the same time:

1. **Observed truth:** what the real Cosmoport 1.0 frontend exposes, which
   fields and actions exist, and which roles can access them in each zone.
2. **Product truth:** what Cosmoport 2.0 intentionally keeps, simplifies,
   rejects or redesigns around PostgreSQL, Valkey, S3/MinIO, Better Auth and
   OpenBao.

Do not copy legacy Rails structure merely because it exists. Do not discard a
real operational rule merely because the old UI implemented it awkwardly.

## 1. Required reading order

Send these to Cosmo in separate context batches, in this order:

### Batch A — non-negotiable architecture

- `sanctuary/cosmoport2/CONCEPT.md`
- `sanctuary/cosmoport2/stack-decision.md`
- `sanctuary/cosmoport2/roadmap.md`
- `sanctuary/cosmoport2/persistence-and-minio.md`
- `sanctuary/cosmoport2/backlog.md`

### Batch B — observed frontend contract

- `docs/research/2026-08-29-cosmoport-frontend-reverse-spec.md`
- `D:\cosmo\cosmo-frontend-to-scrape` (18 HTML snapshots and the JS bundle)
- `docs/COPYPASTA-DISCOVERY-COSMO-FRONTEND.md`

### Batch C — data and domain synthesis

- `docs/research/2026-08-29-cosmoport-grand-unified-synthesis.md`
- `docs/research/2026-08-24-user-profiles-and-rbac.md`
- existing Pydantic/domain models and integration tests listed in
  `sanctuary/cosmoport2/inventory.md`

### Batch D — access-control source

- `docs/research/2026-08-29-cosmoport-rbac-synthesis.md`
- local workbook:
  `C:\Users\mails\Downloads\ЦБРФ.62.0.39780.РО.Э.Матрица_доступов_RM_17.08.xlsx`

### Batch E — scale and Sonar reference

- `docs/COPYPASTA-COSMO-SONAR-WORKER-POOL.md`
- `D:\pipeline.yml`, `D:\main.py`, `D:\vault.env` as reference only

After every batch Cosmo must return a short list of: accepted facts,
contradictions, assumptions, and questions. No silent interpretation.

## 2. The synthesis contract

The core design object is not a legacy page and not a role string. It is an
authorized action over a canonical resource in a context:

```text
AuthorizationDecision(
  subject,
  capability,
  resource_type,
  resource_id,
  domain_id,
  zone,
  environment,
  team_id,
  ownership,
  elevation,
  reason,
)
```

The decision must be explainable and auditable:

```text
allow = role_or_bundle_grants_capability
     && domain_scope_matches
     && zone_scope_matches
     && team_or_ownership_condition_matches
     && environment_policy_allows
     && separation_of_duties_allows
     && emergency_elevation_is_valid
```

The frontend may hide an action for usability, but only the backend policy
engine authorizes it. A hidden button is not a security boundary.

## 3. Observed frontend surface

The reverse-engineered frontend exposed the following logical areas:

- Overview and dashboard;
- Applications and archived applications;
- services and service orders;
- deployments and packages;
- templates, message brokers and runtimes;
- release types, pipelines and pipeline metrics;
- artifact upload and reporting;
- application settings, integrations, validity periods and notifications;
- feedback requests and email templates;
- users and audit.

Application hierarchy:

```text
ITS / domain (КИТС)
  -> grouping universe (Level 2 group)
     -> Level 2 application/container
        -> Level 1 application/service
           -> Level 0 module/library/template
```

The observed frontend contains forms for applications, pipelines, runtimes
and notifications; tables for applications, builds, deployments, pipelines,
runtimes and notifications; and detail tabs for information, builds,
deployments, releases, configurations, teams, quotas and settings.

The exact field, enum, validation and endpoint inventory remains in the
frontend reverse specification. This handoff intentionally does not duplicate
all ~140 legacy paths: the important transformation is from those paths to
clean resource-oriented Cosmoport2 routes.

## 4. Canonical Cosmoport2 model

Collapse the legacy tables into eight durable entities:

| Entity | What it owns | Important authorization boundary |
|---|---|---|
| `cosmo_domains` | ITS/KITS, teams and domain membership | domain and zone membership |
| `cosmo_applications` | hierarchy, metadata, integrations and bindings | application/team/ownership |
| `cosmo_pipelines` | bricks, DAG, lifecycle steps and policy | pipeline editor vs executor |
| `cosmo_runs` | builds, deployments and execution attempts | environment and operator scope |
| `cosmo_batches` | typed groups of steps in a run | parent run and worker lease |
| `cosmo_findings` | normalized security results | finding visibility and triage |
| `cosmo_evidence_ledger` | artifacts, annotations, release events and chain | provenance and immutability |
| `cosmo_audit_events` | administrative/security trail | append-only access |

Legacy concepts such as services, runtimes, integrations, secrets, release
routes and packages become typed fields, references or explicit supporting
resources. They do not justify recreating 80+ tables.

### Contract gap requiring an explicit decision

The concept and backlog treat Security Gates as durable PostgreSQL resources
with `/gates/{id}/approve|reject`, but the headline list of eight entities does
not contain `cosmo_gates`. Releases have the same ambiguity. This cannot be
left as an informal JSONB convention: a gate owns policy snapshot, state,
decision actor/time/reason, evidence links and separation-of-duties checks.

Cosmo must either add first-class tables or define Gate/Release as typed
durable sub-resources with stable IDs and their own capabilities. Recommended:
keep the headline eight if desired, but implement Gate and Release as explicit
durable sub-resources. Never store a gate decision as an undifferentiated run
status.

## 5. Access-control source: the actual matrix

The validated workbook is a 727-row OOXML workbook (`A1:R727`) with one sheet
`Лист1`. It has 726 data rows, evenly split across `ЗР`, `ЗТ` and `ЗПЭ`.

Source roles:

```text
ИТ-лидер
Руководитель разработки
Разработчик
Тестировщик
Администратор
Администратор НШР
Администратор КИТС
Администратор ИБ
Контролер эксплуатации
Оператор
Релиз-менеджер
Эксперт ИБ
```

Source access values:

```text
есть доступ
только просмотр
нет доступа
не применимо
```

Scope markers:

- `*`: for applications whose team includes the user;
- `**`: for КИТС to which the user belongs;
- some rows narrow access to objects created by the user;
- comments mark deprecated, conditional or configuration-dependent elements.

Concrete observed anchors that Cosmo must preserve during synthesis:

```text
2.5  create application in ZR      -> IT-leader + abnormal admin
11.2.1 create build in ZR          -> dev lead* + developer* + KITS admin* + abnormal
11.3.1 create deployment in ZT     -> dev lead* + developer* + tester* + admin + abnormal + KITS admin*
11.4.2 create release in ZR        -> abnormal admin + release manager
9.1   audit in ZR                  -> administrator + abnormal + security admin + controller + operator + security expert
```

These are raw matrix observations, not yet the final Cosmoport2 role grants.
The asterisk conditions and zone must remain attached to the row during
translation. In particular, the generic `Администратор` is not equivalent to
`Администратор НШР`, and `Релиз-менеджер` is not a cosmetic alias for a user.

The matrix reaches individual portal actions, not just sidebar visibility:

- create, edit, archive and delete application records;
- view application cards and history;
- manage teams, quotas, profiles and environment settings;
- configure integrations and brokers;
- operate builds and deployments;
- upload/download artifacts;
- control release acceptance and transfers;
- use context-menu actions such as restart, stop, disconnect and refresh;
- inspect audit/history and security-related data.

### 5.1. Important implication

The source has 12 roles; the existing Cosmoport2 baseline has five security
roles. This must not be treated as a simple rename operation.

Strong mappings:

| Matrix role | Cosmoport2 candidate | Qualification |
|---|---|---|
| Администратор ИБ | `admin_sec` | verify exact gate, RBAC and secret rights |
| Администратор НШР | `admin_abnormal` | temporary elevation, TTL, reason and audit |
| Администратор КИТС | `admin_service` + domain membership policy | split infra from membership authority |
| Эксперт ИБ | `sec_expert` | preserve findings/report/gate distinctions |

Roles requiring capability bundles or an explicit scoped role:

```text
ИТ-лидер              -> application owner / manager bundle
Руководитель разработки -> application + pipeline manager bundle
Разработчик           -> contributor bundle
Тестировщик           -> test execution + evidence bundle
Контролер эксплуатации -> operational control bundle
Оператор              -> run/deployment operator bundle
Релиз-менеджер        -> release/transfer bundle
Администратор         -> unresolved generic admin; do not map blindly
```

The five high-level roles can remain as security roles while these operational
bundles are assigned within a domain/application. Alternatively, Cosmo may
make all 12 source roles assignable. The decision must be explicit and tested;
fallback to `user` is not acceptable.

## 6. Initial capability catalog

Every capability must identify resource and scope. Initial groups:

```text
domain:read             domain:write             domain:delete
app:read                app:write                app:delete
 pipeline:read           pipeline:write
 run:read                run:write                 run:delete
 run:start               run:stop
run:read                run:start                 run:stop
finding:read            finding:write
evidence:read           evidence:write
 gate:read               gate:decide
 release:read            release:manage
report:read             report:generate
integration:read        integration:manage
secret:use              secret:manage
rbac:read               rbac:manage
audit:read              tokens:manage
```

Product-specific capabilities such as `fuzzer:execute`, `policies:manage` and
`retention:clean` remain explicit until their resource and risk boundary is
defined. Do not hide them inside an overbroad `run:start` permission if that
loses meaningful audit or approval semantics.

## 7. Minimum role policy

This is a proposed product baseline, not a sealed canon:

| Capability area | admin_sec | admin_abnormal | admin_service | sec_expert | user |
|---|---|---|---|---|---|
| Domain read | all | all while elevated | domain | assigned | assigned |
| Domain administration | yes | no by default | no | no | no |
| Application read | all | all while elevated | domain | assigned | assigned/shared |
| Application write | yes | emergency only | operational subset | no | no |
| Pipeline write | yes | emergency only | yes where operational | no | no |
| Run start/stop | yes | emergency only | operational | assigned | no |
| Findings write | yes | emergency only | no | assigned | no |
| Gate decide | yes with audit | emergency with reason | no | ordinary decision if approved | no |
| Gate override | yes with audit | temporary only | no | no | no |
| Secrets | manage | never by default | use, not manage | no direct access | no |
| RBAC | manage | no | no | no | no |
| Audit | all | all while elevated | operational subset | assigned | own actions |

`admin_abnormal` is not a permanent second super-admin. The elevation record
must include actor, approver if applicable, reason, expiry, capabilities and
target scope. Expiry is enforced server-side even if the session survives.

## 8. API/resource contract

The clean API should be grouped by canonical resource rather than mirroring
the old 140 endpoints:

```text
/api/v1/domains
/api/v1/domains/{domain_id}/members
/api/v1/applications
/api/v1/applications/{application_id}
/api/v1/pipelines
/api/v1/pipelines/{pipeline_id}/compile
/api/v1/runs
/api/v1/runs/{run_id}/cancel
/api/v1/runs/{run_id}/retry
/api/v1/runs/{run_id}/events
/api/v1/findings
/api/v1/evidence
/api/v1/gates/{gate_id}/approve
/api/v1/gates/{gate_id}/reject
/api/v1/catalog
/api/v1/audit
/api/v1/me/profile
/api/v1/me/tokens
```

Each route must declare:

```text
required_capability
resource_loader
scope_resolver
policy_check
audit_event_kind
```

The frontend reverse spec remains the traceability source for which old UI
action maps to which new route. A route is not complete until its 403 case and
audit behavior are defined.

## 9. Dual-surface UI contract

### Surface A — Control Station

MUI Minimal UI, MUI X Data Grid, React Flow/dagre, Meta Light white default.
It owns workflows, runs, gates, evidence, releases, operations and audit.

Required views:

```text
Overview
Applications tree: Domain -> Group -> App
Application detail
Pipeline DAG
Run control and live timeline
Findings/evidence
Security gate inspector
Releases/transfers
Catalog
Admin/RBAC/audit
```

### Surface B — Sovereign Web IDE

Tailwind v4, Radix, Monaco, xterm, dark IDE default. It owns source/tree,
DSL/YAML editing, diffs, branches, commit/run and worker terminal workflows.

Required context jumps:

```text
Gate finding -> exact editor file/line
Commit & Run -> Control Station run/DAG
LC configuration -> DSL/YAML editor
```

Both surfaces use the same backend policy. The IDE must not gain a hidden
second permission system merely because it has a different visual shell.

## 10. Execution and evidence contract

Canonical steel thread:

```text
create domain
  -> define application
  -> define pipeline/brick DAG
  -> compile deterministic plan
  -> create idempotent run
  -> allocate capabilities by run_id
  -> execute batches
  -> normalize findings
  -> evaluate gate
  -> record evidence and audit
  -> stream status to both surfaces
```

Durability rules:

- PostgreSQL is the durable source of truth;
- Valkey is transport/cache/stream, never the only copy of state;
- artifacts go to S3/MinIO with checksum and provenance;
- evidence and audit are distinct concepts but both append-only where required;
- every retry and transition is idempotent and traceable to the run.

Sonar worker pool rules from the battle reference:

- ephemeral worker per run or shard;
- Docker labels include `prettyk.run_id`;
- port allocation uses a durable lease tracker, not random probing;
- CE task polling uses the returned task ID;
- raw SARIF survives standalone outage in MinIO;
- findings can appear in PostgreSQL before slow downstream import;
- no `allow_failure` that masks infrastructure failure;
- no plaintext credentials in the handoff or runtime logs.

## 11. Delivery order for Cosmoport2

### Wave 1 — contract freeze and traceability

- accept this handoff as discovery input;
- produce a machine-readable extraction of all 726 matrix rows;
- assign stable IDs to portal elements and source roles;
- map every top-level and child UI action to a canonical resource;
- mark each mapping `observed`, `inferred`, `decision` or `open`.

### Wave 2 — authorization foundation

- define capability enum and role/bundle registry;
- define domain, zone, team, ownership and environment scope;
- add PostgreSQL role assignments and elevation records;
- add policy decision/audit schema;
- negative-test secrets, gates, audit and emergency expiry;
- replace UI-only role checks with backend enforcement.

### Wave 3 — durable steel thread

- finish PostgreSQL/Alembic models;
- finish compiler and run state machine;
- finish evidence chain and audit events;
- expose resource-oriented FastAPI routes with 401/403/404/409 contracts;
- add SSE with REST history fallback.

### Wave 4 — Control Station and IDE

- build Control Station shell and application tree;
- build detail tabs, pipeline DAG, run control and gate inspector;
- port Web IDE with scoped style boundary;
- implement context jumps;
- apply the same capability checks to both surfaces.

### Wave 5 — adapters and scale

- Gitea and Woodpecker adapters;
- scanner, Playwright and Fuzzer through CapabilityBroker;
- Sonar worker lease, MinIO buffer, rate-limited ingest;
- 50-report burst and chaos matrix;
- full-cycle acceptance on a live local stack.

## 12. Backlog hygiene

The current Cosmoport backlog already uses `COS-020` through `COS-025` for
Control Station/Web IDE work. The older Sonar handoff also proposes
`COS-020` through `COS-027`. Do not paste those cards under the old IDs.

Recommended allocation:

```text
COS-030  matrix extraction and traceability
COS-031  capability and role/bundle registry
COS-032  zone/team/ownership policy engine
COS-033  PostgreSQL assignments and emergency elevation
COS-034  route authorization and audit middleware
COS-035  RBAC negative/integration test matrix
COS-036  application read/write vertical slice
COS-037  deployment gate and SoD vertical slice
COS-038  Sonar worker lease and lifecycle
COS-039  SARIF normalizer
COS-040  MinIO/Valkey ingest buffer
COS-041  rate-limited standalone ingest
COS-042  50-worker/report scale smoke
COS-043  chaos and recovery matrix
```

These are proposed IDs only. They must be added to the Cosmoport backlog by
the owner after review; this handoff does not silently edit the sealed
Cosmoport canon.

## 13. Required response from Cosmo/Gemini

Return four artifacts, not a vague acknowledgement:

1. **Traceability table:** source row/element → canonical entity → capability
   → scope → proposed route → evidence status.
2. **Role decision:** choose five roles plus bundles, or 12 assignable roles,
   with explicit treatment of every source role.
3. **Implementation slice:** the smallest vertical slice proving one matrix
   action end to end, including backend 403, UI visibility, audit and scope.
4. **Backlog patch proposal:** cards with non-colliding IDs, owner, estimate,
   dependencies and GWT/DoD; no direct edits until approved.

## 14. Hard prohibitions

- do not recreate the 80+ legacy database tables;
- do not mirror all 140 legacy endpoints one-for-one;
- do not use Ant Design/MobX as the Cosmoport2 frontend foundation;
- do not make the frontend the authorization authority;
- do not make Valkey the durable state store;
- do not put secrets into frontend payloads, logs or evidence;
- do not grant `admin_abnormal` permanent super-admin powers;
- do not silently collapse operational roles into `user`;
- do not copy source matrix suffixes as global permissions;
- do not reuse colliding backlog IDs;
- do not change `sanctuary/pure/` or sealed Cosmoport decisions in this pass;
- do not claim a mapping is observed when it is an inference.

## 15. Acceptance gate

The handoff is ready for implementation only when:

- all source roles and zones are represented;
- every matrix action has a traceability status;
- every new route has capability, scope, 403 and audit behavior;
- the 12-to-5 role decision is explicit;
- emergency elevation and separation of duties are defined;
- Control Station and Web IDE share policy enforcement;
- PostgreSQL persistence and Valkey failure behavior are tested;
- Sonar worker and evidence paths are idempotent;
- the proposed backlog IDs do not collide with existing cards;
- unresolved assumptions are listed instead of being hidden in code.
