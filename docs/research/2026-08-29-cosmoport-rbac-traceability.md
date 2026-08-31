# Cosmoport 2.0 RBAC Traceability Annex

> Date: 2026-08-29
> Status: discovery mapping, pending owner approval
> Source: ЦБРФ.62.0.39780.РО.Э.Матрица_доступов_RM_17.08.xlsx
> Workbook: one sheet `Лист1`, `A1:R727`, 726 rows, zones `ЗР`, `ЗТ`, `ЗПЭ`

## 1. How to read this annex

The workbook repeats the same portal-element identifiers across zones. Each
row has a separate entitlement cell for each of 12 source roles. This annex
does not flatten those cells into a single grant. Instead it defines the
translation rule:

```text
matrix_row_id + zone + source_role + cell_value
    -> action capability
    -> canonical resource
    -> scope predicate
    -> API operation
    -> UI surface/action
    -> audit event
```

`mapping_status=inferred` identifies a rule-based proposal from this annex.
Rows outside the currently mapped action families remain `open`; their raw
entitlement is preserved and they must not be implemented from an empty
capability field.

The complementary behavioral evidence artifact is
`docs/research/2026-08-29-cosmoport1-release-flow-har-evidence.md`. It records
the tested Cosmoport1 flow under low-privilege and privileged user contexts,
including settings/lifecycle writes, runtime/pipeline/VM provisioning, release
creation, release-build start, stop and delete. It is observed evidence only;
it does not alter the source matrix or seal the proposed Cosmoport2 mappings.


Status labels:

- **Observed:** directly stated by the workbook or reverse-engineered UI.
- **Inferred:** reasonable mapping that still needs owner/subject review.
- **Decision:** product rule already fixed in Cosmoport2 canon.
- **Open:** must not be implemented as an assumption.

The same action may produce different capabilities for different roles. For
example, `pipeline:read` and `pipeline:manage` are separate capabilities even
when the old portal places them near each other.

## 2. Canonical resource aliases

| Resource alias | Cosmoport2 entity | Notes |
|---|---|---|
| `domain` | `cosmo_domains` | КИТС/ITS, teams, memberships, zone policy |
| `application` | `cosmo_applications` | Level 0/1/2, groups, hierarchy |
| `pipeline` | `cosmo_pipelines` | bricks, DAG, LC steps, pipeline catalog |
| `run` | `cosmo_runs` | build, deployment, test and execution attempts |
| `batch` | `cosmo_batches` | typed steps inside a run |
| `finding` | `cosmo_findings` | normalized scanner/security results |
| `evidence` | `cosmo_evidence_ledger` | reports, artifacts, attachments, provenance |
| `audit` | `cosmo_audit_events` | user logs and administrative events |
| `release` | `cosmo_runs` + release metadata | no separate canonical table yet; open design point |
| `runtime` | pipeline/catalog supporting resource | endpoint, environment, lease and availability |
| `integration` | application/catalog supporting resource | Gitea, CI, broker, JIRA, Vault refs |
| `settings` | domain/application settings | must be explicit, not an unguarded blob |
| `membership` | domain/application membership | role, team, assignment scope |

## 2.1. Contract gap: Gate and Release are missing from the eight entities

The existing Cosmoport2 concept says that Security Gates are durable
PostgreSQL entities and the backlog already exposes `/gates/{id}/approve` and
`/gates/{id}/reject`. However, the canonical eight-entity list does not name a
`cosmo_gates` entity. Releases are also represented as metadata under runs
rather than as a named canonical entity.

This is an architectural gap, not a documentation detail. A gate has its own
state, policy snapshot, decision actor, decision time, reason, evidence links
and separation-of-duties constraints. Hiding that in arbitrary run JSONB will
make approval audit and RBAC ambiguous.

Options to return to the owner:

1. add first-class `cosmo_gates` (and optionally `cosmo_releases`) to the
   canonical model;
2. explicitly define Gate and Release as typed sub-resources with durable
   tables and stable IDs, while documenting why the headline entity count
   remains eight;
3. reject the existing `/gates/*` contract and redesign it before coding.

Recommended direction: option 2 if the eight-entity headline is important,
but the persistence and authorization model must behave as if gates and
releases are first-class resources. No gate decision should be stored as an
undifferentiated run status.

## 3. Traceability map: navigation and application surface

The following rows are representative action families. Each family covers the
corresponding child rows in the workbook; the exact cell status remains the
source entitlement and is never replaced by this capability suggestion.

| Matrix IDs | Observed portal action | Capability | Resource | Scope predicate | API shape | Audit |
|---|---|---|---|---|---|---|
| `1`, `1.1`, `1.2` | overview, component list and links | `domain:read`, `app:read` | domain/application | visible domain/team | `GET /domains`, `GET /applications` | optional read event |
| `2` | applications sidebar | `app:read` | application | zone + domain | `GET /applications` | no mutation |
| `2.1` | application list | `app:read` | application | `*` team membership condition | `GET /applications` | no mutation |
| `2.2` | public spaces | `app:read` | application | public flag plus zone | `GET /applications?visibility=public` | no mutation |
| `2.3`, `2.4` | links to application card | `app:read` | application | row visible to subject | `GET /applications/{id}` | no mutation |
| `2.5` | create application | `app:write` | application | allowed parent/domain; zone | `POST /applications` | required |
| `4.4` | capsules / base level | `domain:read` or `app:read` | domain/application | КИТС membership | `GET /domains/{id}` | no mutation |
| `4.7` | archived applications | `app:read` | application | archive visibility policy | `GET /applications?archived=true` | no mutation |
| `4.10` | deployments navigation | `run:read` | run | domain/application/zone | `GET /runs?kind=deployment` | no mutation |
| `9`, `9.1` | users and audit navigation | `rbac:read`, `audit:read` | membership/audit | admin or assigned audit scope | `GET /audit`, `GET /domains/{id}/members` | audit read event |
| `10` | change history | `audit:read` | audit/evidence | parent resource scope | `GET /audit?resource_id=...` | no mutation |

## 4. Traceability map: services, catalog and infrastructure

| Matrix IDs | Observed portal action | Capability | Resource | Scope predicate | API shape | Audit |
|---|---|---|---|---|---|---|
| `3.1`–`3.3` | services list and orders | `integration:read`, `integration:manage` | integration/catalog | domain + service availability | `GET /catalog`, `POST /catalog/orders` | mutation required |
| `4.1` | packages | `evidence:read`, `evidence:write` | evidence | artifact scope + zone | `GET/POST /evidence/artifacts` | upload/delete audit |
| `4.2` | templates | `pipeline:read`, `pipeline:write` | pipeline/catalog | catalog scope | `GET/POST /catalog/templates` | mutation required |
| `4.3` | message brokers | `integration:read`, `integration:manage` | integration/runtime | domain + environment | `GET/PATCH /integrations/brokers/{id}` | mutation required |
| `4.4.2` | edit capsule | `domain:write` | domain | КИТС membership or admin | `PATCH /domains/{id}` | before/after |
| `4.5`–`4.5.4` | runtimes, edit and disable | `integration:read`, `integration:manage` | runtime | zone/environment + ops scope | `GET/PATCH /runtimes/{id}` | mutation required |
| `4.6`–`4.6.5` | pipeline list, status, disable | `pipeline:read`, `pipeline:write` | pipeline | domain/application + team | `GET/PATCH /pipelines/{id}` | mutation required |
| `4.8` | pipeline metrics | `report:read`, `report:generate` | run/evidence | domain/application | `GET /reports/pipeline-metrics` | export event |
| `4.9`–`4.9.4` | upload/download artifact and archive | `evidence:read`, `evidence:write` | evidence | environment, application and ownership | `POST/GET /evidence/artifacts` | hash + actor |
| `4.11`–`4.12` | release types and acceptance | `release:read`, `release:manage`, `gate:decide` | release/run | zone/environment + SoD | `GET/PATCH /releases`, `POST /gates/{id}/decide` | mandatory |

`runtime`, `integration`, package and catalog endpoints must not be granted
implicitly by `app:write`. They affect execution and credentials and therefore
need their own capability and scope checks.

## 5. Traceability map: application card

| Matrix IDs | Observed portal action | Capability | Resource | Scope predicate | API shape | Audit |
|---|---|---|---|---|---|---|
| `11`, `11.1` | open application card/info | `app:read` | application | visible application | `GET /applications/{id}` | no mutation |
| `11.2` | builds tab | `run:read` | run | application + zone | `GET /applications/{id}/runs?kind=build` | no mutation |
| `11.3` | deployment tab | `run:read` | run | application + environment | `GET /applications/{id}/runs?kind=deploy` | no mutation |
| `11.4` | releases tab | `release:read` | release/run | application + zone | `GET /applications/{id}/releases` | no mutation |
| `11.5` | configurations tab | `app:read`, `app:write` | application/settings | app kind and ownership | `GET/PATCH /applications/{id}/config` | mutation required |
| `11.6` | team tab | `rbac:read`, `rbac:manage` | membership | domain/application admin scope | `GET/PATCH /applications/{id}/members` | before/after |
| `11.7` | quota tab | `domain:read`, `integration:manage` | domain/runtime | domain + environment | `GET/PATCH /domains/{id}/quotas` | mutation required |
| `11.8` | settings tab | `app:read`, `app:write`, `policies:manage` | application/settings | security admin or scoped manager | `GET/PATCH /applications/{id}/settings` | before/after |
| `11.8.1` | JIRA URL + save | `integration:manage` | integration | application scope | `PATCH /applications/{id}/integrations/jira` | required |
| `11.8.2` | deployment timeout | `app:write` + policy check | application | allowed operational range | `PATCH /applications/{id}/settings` | required |
| `11.8.3` | ABAC selector + save | `policies:manage` | application/settings | security policy scope | `PATCH /applications/{id}/abac` | critical |
| `11.8.4` | application status + save | `app:write` | application | lifecycle transition policy | `POST /applications/{id}/status` | required |
| `11.8.10` | build/deploy order | `pipeline:write` | pipeline/application | parent hierarchy + manager scope | `PATCH /applications/{id}/execution-order` | required |
| `11.8.11` | content type for helper space | `app:write` | application | kind-specific condition | `PATCH /applications/{id}/content-type` | required |
| `11.8.16` | custom build/deploy pipelines | `pipeline:write` | pipeline/application | manager/admin scope | `PATCH /applications/{id}/pipelines` | critical |
| `11.8.17` | service availability monitoring | `integration:manage` | runtime/integration | operational domain scope | `PATCH /applications/{id}/monitoring` | required |
| `11.8.18` | source initialization | `app:write` | application/repository | non-legacy condition | `POST /applications/{id}/repository/init` | required |
| `11.8.19` | scheduled tasks | `run:start`, `pipeline:write` | run/pipeline | scheduler scope | `POST/PATCH /applications/{id}/schedules` | required |
| `11.8.20` | smoke-test settings | `pipeline:write`, `run:start` | pipeline/run | test environment only | `PATCH /applications/{id}/smoke-tests` | required |
| `11.8.21` | restart | `run:stop`, `run:start` | run | operational environment | `POST /runs/{id}/restart` | required |
| `11.8.22` | order service function | `integration:manage` | application/integration | domain/catalog availability | `POST /applications/{id}/services` | required |
| `11.8.23` | order pipeline | `pipeline:write` | pipeline/application | domain + application | `POST /applications/{id}/pipelines` | required |
| `11.8.24` | order runtime | `integration:manage` | runtime/application | zone/environment | `POST /applications/{id}/runtimes` | required |
| `11.8.25` | order broker | `integration:manage` | broker/application | zone/environment | `POST /applications/{id}/brokers` | required |
| `11.8.26`–`11.8.27` | message topic actions | `integration:manage` | broker/topic | domain + team | `POST/PATCH /brokers/{id}/topics` | required |
| `11.8.28` | order VM | `integration:manage` | runtime | zone and quota policy | `POST /applications/{id}/runtimes/vm` | critical |
| `11.8.31` | environment variables | `app:write`, `secret:use` | application/settings | owner/admin + secret policy | `PATCH /applications/{id}/env` | never log values |
| `11.8.32` | environment profiles | `app:write`, `secret:use` | application/settings | team/application scope | `POST/PATCH /applications/{id}/profiles` | required |
| `11.8.33` | archive application | `app:delete` | application | lifecycle + manager/admin scope | `POST /applications/{id}/archive` | critical |
| `11.8.34` | delete application | `app:delete` | application | explicit destructive policy | `DELETE /applications/{id}` | critical + reason |

Some rows are deliberately mapped to more than one capability because the
old UI combines operations in one control. The new API must split read,
mutation, execution and secret use into separate authorization checks.

## 6. Traceability map: runs, builds, deployments and releases

| Matrix IDs | Observed portal action | Capability | Resource | Scope predicate | API shape | Audit |
|---|---|---|---|---|---|---|
| `11.1.1` | edit application card | `app:write` | application | owner/manager/admin | `PATCH /applications/{id}` | before/after |
| `11.2.1` | create build | `run:start` | run | app + zone + environment | `POST /runs` | required |
| `11.2.2.1` | edit build | `run:write` | run | creator/manager/admin | `PATCH /runs/{id}` | required |
| `11.2.2.2` | restart build | `run:start` | run | operational policy | `POST /runs/{id}/retry` | required |
| `11.2.2.4` | delete non-release build | `run:delete` | run | creator/manager/admin | `DELETE /runs/{id}` | destructive |
| `11.2.2.5` | delete release build | `release:manage` | run/release | release policy + SoD | `POST /releases/{id}/withdraw` | critical |
| `11.2.3` | deploy from build | `run:start` | run | target environment + operator scope | `POST /runs/{id}/deploy` | critical |
| `11.2.5.1` | start/stop deployment | `run:start`, `run:stop` | run | runtime and environment | `POST /runs/{id}/start|stop` | required |
| `11.2.5.2` | delete deployment | `run:delete` | run | non-production or admin policy | `DELETE /runs/{id}` | critical |
| `11.2.5.3` | start/stop dynamic tests | `fuzzer:execute`, `run:start`, `run:stop` | batch/run | test scope | `POST /runs/{id}/tests` | required |
| `11.2.5.4` | permanent address | `integration:manage` | runtime/run | environment policy | `POST /runs/{id}/permanent-url` | critical |
| `11.3.1` | create deployment | `run:start` | run | environment + release policy | `POST /deployments` | critical |
| `11.3.3.1` | stop deployment | `run:stop` | run | operator/control scope | `POST /runs/{id}/stop` | required |
| `11.3.3.2` | restart deployment | `run:start` | run | operator/control scope | `POST /runs/{id}/restart` | required |
| `11.3.3.3` | delete deployment | `run:delete` | run | environment policy | `DELETE /runs/{id}` | critical |
| `11.4.2` | create release | `release:manage` | release/run | release-manager scope | `POST /releases` | required |
| `11.4.4` | edit release | `release:manage` | release/run | creator/release-manager | `PATCH /releases/{id}` | required |
| `11.4.6` | start/restart build for release | `run:start` | run/release | release route + environment | `POST /releases/{id}/runs` | required |
| `11.4.9`–`11.4.10` | add/remove attachments | `evidence:write` | evidence/release | release scope + ownership | `POST/DELETE /evidence` | hash + actor |
| `11.4.12` | send report | `report:generate` | evidence/report | release/application scope | `POST /reports` | export event |

`run:start` is not enough to authorize all execution. The policy must also
check run kind, target zone, environment, runtime, application ownership and
whether the actor is allowed to cross the release gate.

## 7. Traceability map: configurations, teams and secrets

| Matrix IDs | Observed portal action | Capability | Resource | Scope predicate | API shape | Audit |
|---|---|---|---|---|---|---|
| `11.5.1` | create configuration | `app:write` | application/settings | application manager | `POST /applications/{id}/config` | required |
| `11.5.2.1` | edit configuration | `app:write` | application/settings | owner/manager/admin | `PATCH /config/{id}` | required |
| `11.5.2.2` | delete configuration | `app:delete` | application/settings | destructive policy | `DELETE /config/{id}` | critical |
| `11.6.2` | edit/delete team member | `rbac:manage` | membership | domain/application admin | `PATCH/DELETE /members/{id}` | before/after |
| `11.8.1` | integration credentials/config | `integration:manage` | integration | domain/application admin | `PATCH /integrations/{id}` | no secret values |
| `11.8.3` | ABAC configuration | `policies:manage` | settings/policy | security policy scope | `PATCH /policies/{id}` | critical |
| `11.8.31` | environment variable data | `secret:use` or `secret:manage` | settings/OpenBao ref | actor may use, not read value | `PATCH /secret-references` | metadata only |
| `11.8.32` | environment profiles | `app:write` + `secret:use` | application/settings | team/application scope | `POST/PATCH /profiles` | metadata only |

The UI may show that a secret-backed field exists. It must never receive the
plaintext secret merely because the user can edit the application settings.

## 8. Zone and conditional semantics

For every mapped operation, preserve the source cell exactly before mapping:

```text
source_status = full | read_only | denied | not_applicable
source_marker = none | * | ** | creator_only | custom_comment
```

Rules:

1. `not_applicable` is not a deny. It means the element has no meaning in that
   zone and should normally be omitted from that zone's UI/API projection.
2. `read_only` grants read capability only. It must not enable mutation by
   calling the endpoint directly.
3. `*` becomes a team-membership predicate, not a global role grant.
4. `**` becomes a КИТС/domain-membership predicate, not a global role grant.
5. Creator-only access becomes an ownership predicate on the resource.
6. A comment such as deprecated/not applicable/configuration-dependent becomes
   a validation or lifecycle rule, not a new permission.
7. Zone is evaluated before environment-specific rules; `ЗР` access never
   implies `ЗТ` or `ЗПЭ` access.

Recommended resource context:

```json
{
  "domain_id": "...",
  "application_id": "...",
  "team_id": "...",
  "zone": "ZR|ZT|ZPE",
  "environment": "dev|test|prod",
  "owner_id": "...",
  "created_by": "...",
  "resource_kind": "application|pipeline|run|finding|evidence"
}
```

## 8.1. Exact anchor rows from the workbook

These samples are transcribed from the actual matrix. They are useful anchors
for validating the future machine-readable export. Abbreviations:

```text
F   = есть доступ
R   = только просмотр
D   = нет доступа
NA  = не применимо
*   = team/application condition
**  = КИТС condition
```

| Matrix row | Zone | IT | Dev lead | Dev | Test | Admin | Abnormal | KITS admin | Sec admin | Controller | Operator | Release | Sec expert |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `2.5` create application | ЗР | F | D | D | D | D | F | D | D | D | D | D | D |
| `2.5` create application | ЗТ | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA |
| `4.5` runtimes | ЗР | F** | F** | F** | F** | F | F | F** | F | R | R | D | R** |
| `4.5` runtimes | ЗТ | F** | F** | R** | F** | F | F | F** | F | R | R | D | R** |
| `4.5` runtimes | ЗПЭ | NA | NA | NA | NA | F | F | F** | F | R | R | D | NA |
| `4.6` pipeline list/status | ЗР | R | R | D | D | F | F | R | R | R | R | R | R |
| `4.9.2` artifact upload | ЗР | D | F | F | F | D | F | D | D | D | D | D | F |
| `9.1` audit | ЗР | D | D | D | D | F | F | D | F | F | F | D | F |
| `11.2.1` create build | ЗР | D | F* | F* | D | D | F | F* | D | D | D | D | D |
| `11.2.3` deploy from build | ЗР | D | F* | F* | F* | F | F | F* | D | D | D | D | D |
| `11.3.1` create deployment | ЗТ | D | F* | F* | F* | F | F | F* | D | D | D | D | D |
| `11.4.2` create release | ЗР | D | D | D | D | D | F | D | D | D | D | F | D |
| `11.6.2` edit/delete team member | ЗР | F* | F* | D | D | D | F | D | F | D | D | D | D |
| `11.8.3` ABAC settings | ЗР | F* | F* | R* | R* | F | F | F* | R | R | R | R* | R* |
| `11.8.31` environment variables | ЗР | R* | F* | F* | F* | F | F | F* | R | R | R | R* | R* |
| `11.8.33` archive application | ЗТ | F* | F* | D | D | D | F | D | D | D | D | D | D |

This table immediately proves several important facts that the abstract
five-role baseline must not erase:

- application creation in `ЗР` is granted to `ИТ-лидер` and
  `Администратор НШР`, not to the generic administrator;
- build/deployment creation is granted to development roles with team scope;
- release creation is concentrated in `Администратор НШР` and
  `Релиз-менеджер`;
- audit is available to operational and security administration roles but not
  to ordinary development roles;
- ABAC and environment-variable settings have different read/write patterns;
- `ЗПЭ` is not simply a third copy of `ЗР` or `ЗТ`.

The exact values above are **observed**, while the capability/API mappings in
the preceding tables are **inferred** and require owner review.

## 9. First implementation slice

Do not start with all 726 rows. Prove the contract with one safe read, one
ordinary mutation and one critical operation:

### Slice A — application read

```text
matrix: 2.1 / 2.3
resource: cosmo_applications
capability: app:read
scope: domain + team marker where present
route: GET /api/v1/applications/{id}
UI: Control Station application list/card
audit: optional read telemetry
negative test: different domain -> 403 or filtered 404
```

### Slice B — application creation

```text
matrix: 2.5
resource: cosmo_applications
capability: app:write
scope: allowed domain/parent/zone
route: POST /api/v1/applications
UI: Control Station create dialog
audit: actor, target, before=null, after, zone, correlation_id
negative test: developer/tester without bundle -> 403
```

### Slice C — production deployment

```text
matrix: 11.3.1 / 11.3.3.*
resource: cosmo_runs
capability: run:start or run:stop
scope: target environment + operator/release policy + SoD
route: POST /api/v1/runs/{id}/deploy|stop
UI: Control Station run/deployment view
audit: mandatory, reason for stop/override
negative test: wrong zone, expired elevation, changed pipeline actor -> deny
```

If these three slices work, the remaining rows become data and policy
expansion rather than a new architecture.

## 10. Machine-readable extraction and backlog cards

The reproducible extractor is `docs/research/extract_cosmoport_rbac.py`. Its
output is `docs/research/2026-08-29-cosmoport-rbac-matrix.jsonl`.

The output contains 8,712 records: one record for each of the 726 workbook
rows and each of the 12 source-role entitlement cells. This is intentional:
the source matrix is not a single row-level grant table. The extractor retains
one record per workbook row/zone/source-role tuple and includes:

```text
source_row_number
element_id
element_label
zone
source_role
raw_status
marker
comment
canonical_resource
capability
scope_predicate
api_route
ui_surface
audit_event
mapping_status
```

Proposed non-colliding Cosmoport backlog cards:

| ID | Card | Depends on |
|---|---|---|
| `COS-030` | Matrix extraction and stable element IDs | none |
| `COS-031` | Capability and role/bundle registry | COS-030 |
| `COS-032` | Zone/team/ownership policy engine | COS-031 |
| `COS-033` | PostgreSQL assignments and emergency elevation | COS-031 |
| `COS-034` | Route authorization and audit middleware | COS-031, COS-032 |
| `COS-035` | RBAC negative/integration matrix | COS-032–034 |
| `COS-036` | Application read/write vertical slice | COS-030–034 |
| `COS-037` | Deployment gate/SoD vertical slice | COS-032–035 |

These IDs are proposals only. They do not modify the sealed Cosmoport backlog
until the owner explicitly accepts them.
