# Cosmoport 2.0 RBAC Synthesis

> Date: 2026-08-29
> Status: research, pending owner approval
> Sources: `docs/research/2026-08-24-user-profiles-and-rbac.md`,
> `docs/research/2026-08-29-cosmoport-frontend-reverse-spec.md`,
> `docs/research/2026-08-29-cosmoport-grand-unified-synthesis.md`,
> `orchestrator/core/domain_rbac.py`, `orchestrator/tests/test_rbac.py`.

> **UI scope clarification:** this document describes backend authorization and
> a possible separate administrative plane. It does **not** prescribe an RBAC,
> roles, users or team-scope screen inside the Cosmoport2 operator portal.
> Cosmoport2 consumes authorization outcomes; it is not the place where the
> internal role model is displayed or managed.

## 1. Source validation

The file
`C:\Users\mails\Downloads\ЦБРФ.62.0.39780.РО.Э.Матрица_доступов_RM_17.08.xlsx`
was inspected as an OOXML workbook. It contains one worksheet, `Лист1`, with
dimension `A1:R727`: 726 matrix rows plus the header.

The matrix is real and usable. Its columns are:

`Элемент Портала управления`, `Зона`, followed by 12 roles:

`ИТ-лидер`, `Руководитель разработки`, `Разработчик`, `Тестировщик`,
`Администратор`, `Администратор НШР`, `Администратор КИТС`,
`Администратор ИБ`, `Контролер эксплуатации`, `Оператор`,
`Релиз-менеджер`, `Эксперт ИБ`.

The final columns carry comments and legend material. The three zones are
`ЗР`, `ЗТ` and `ЗПЭ`, with 242 rows each. Cell values distinguish:
`есть доступ`, `только просмотр`, `нет доступа` and `не применимо`; suffixes
`*` and `**` carry scope caveats rather than being separate roles. The legend
defines `*` for applications whose team includes the user, and `**` for КИТС
to which the user belongs. There are also narrower values such as access only
to objects created by the user.

The matrix is not merely a menu-visibility list. It reaches individual
actions: create/archive applications, configure integrations, operate
deployments, upload artifacts, manage environment profiles, change credentials,
inspect audit/history, and accept or transfer releases. This is precisely the
granularity needed to derive capabilities, while preserving the source rows as
the traceability layer.

The screenshot and raw workbook therefore supersede the earlier mistaken
negative finding. The mistake came from selecting the first workbook returned
by a broad `*.xlsx` glob instead of the file matching `*62.0.39780*`. No
ЦБ-specific conclusion should be based on that earlier statement.

As a sanity check, after normalizing suffixes and conditional variants, the
726-row counts are:

| Source role | Full | Read-only | Denied | N/A |
|---|---:|---:|---:|---:|
| ИТ-лидер | 178 | 42 | 236 | 270 |
| Руководитель разработки | 261 | 27 | 168 | 270 |
| Разработчик | 181 | 41 | 234 | 270 |
| Тестировщик | 159 | 45 | 252 | 270 |
| Администратор | 391 | 58 | 205 | 72 |
| Администратор НШР | 645 | 9 | 0 | 72 |
| Администратор КИТС | 379 | 49 | 226 | 72 |
| Администратор ИБ | 194 | 94 | 366 | 72 |
| Контролер эксплуатации | 208 | 157 | 289 | 72 |
| Оператор | 172 | 142 | 340 | 72 |
| Релиз-менеджер | 165 | 82 | 407 | 72 |
| Эксперт ИБ | 107 | 60 | 289 | 270 |

The counts are descriptive only: they must not be converted directly into
global role grants, because they mix zones, parent menu rows, child actions,
and conditional `*`/`**` rows.

## 1.1. What the matrix contributes

The workbook is a portal-element entitlement matrix, not yet a normalized API
policy model. It provides valuable evidence for:

- role names and their granularity (12 source roles, not five);
- zone-specific availability (`ЗР`, `ЗТ`, `ЗПЭ`);
- three access levels: full, read-only and denied;
- conditional access markers for team/КИТС membership;
- per-action restrictions such as "only objects created by the user";
- operational distinctions such as deployment, artifact upload, pipeline
  metrics, settings, audit, releases and application-card actions.

It does not by itself define resource IDs, HTTP verbs, ownership semantics,
emergency elevation TTLs, or complete separation-of-duties rules. Those must
be derived by joining it with the reverse specification and the product
security model.

## 2. Canonical Cosmoport role set

The role set below is an authorization/backend concern. It must not become a
navigation item or explanatory matrix in the operator-facing Cosmoport2 UI.
Role assignment, reconciliation and access administration belong either to an
independent admin plane or to existing platform administration tooling.

The current project canon defines five domain-scoped roles:

| Role | Meaning | Default scope |
|---|---|---|
| `admin_sec` | Security/domain administrator | Entire domain; all teams |
| `admin_abnormal` | Emergency/abnormal administrator | Domain-wide, time-bounded elevation |
| `admin_service` | Infrastructure/service administrator | Domain; operational resources |
| `sec_expert` | Security expert | Assigned domains and teams |
| `user` | Observer/requestor | Assigned domains; own or explicitly shared data |

These are roles, not the authorization primitive. The enforcement primitive
is a capability plus a resource scope.

## 2.1. Source-role reconciliation

The ЦБ matrix has 12 operational roles while the current Cosmoport baseline
has five domain roles. This is a **lossy compression problem**, not a naming
exercise. A source role must not be silently collapsed into `user` merely to
make the table fit.

| Source role | Initial relation to Cosmoport | Decision |
|---|---|---|
| Администратор ИБ | `admin_sec` | strong candidate; verify exact write/delete and gate rights |
| Администратор НШР | `admin_abnormal` | strong candidate; preserve emergency semantics and TTL |
| Администратор КИТС | `admin_service` plus domain administration | candidate; split infrastructure from membership management |
| Администратор | admin/service capability bundle | unresolved; generic source role is too broad to map blindly |
| Эксперт ИБ | `sec_expert` | strong candidate; retain finding/report/gate distinctions |
| ИТ-лидер | project/application owner bundle | needs explicit owner capability or scoped manager role |
| Руководитель разработки | application/pipeline manager bundle | needs explicit pipeline and release scope |
| Разработчик | application contributor bundle | needs create/update/run boundaries |
| Тестировщик | test/run observer-operator bundle | needs test execution versus deployment boundary |
| Контролер эксплуатации | operational control bundle | needs production gate and runtime policy decision |
| Оператор | run/deployment operator bundle | needs runtime and stop/restart boundaries |
| Релиз-менеджер | release/transfer bundle | needs release approval versus execution split |

The matrix therefore suggests one of two valid designs:

1. keep the five high-level security roles and add scoped capability bundles
   for project, release and operations work; or
2. introduce the 12 source roles as assignable roles, each implemented as a
   capability bundle, while retaining the five roles as security/admin roles.

The first option is the safer Cosmoport default, but it needs explicit
capabilities for owner, developer, tester, operator, controller and release
manager. The choice is open and must not be resolved by accidental fallback to
`user`.

## 2.2. Zone is an authorization dimension

`ЗР`, `ЗТ` and `ЗПЭ` are not decorative worksheet labels. The same portal
element can have different access in different zones. Cosmoport should model
zone/contour as part of the resource context, for example:

```text
resource = { domain_id, application_id, zone, environment, team_id }
```

An allow in `ЗР` must not imply an allow in `ЗТ` or `ЗПЭ`. The `*` and `**`
markers also show that membership-based scope sits below the role level and
must be represented as an ABAC condition, not copied as a global capability.

## 3. Resource model

RBAC must be applied to the eight canonical Cosmoport entities, not to every
legacy Rails table:

| Entity | Security meaning | Typical scope |
|---|---|---|
| `cosmo_domains` | Domain, team membership, policy boundary | domain |
| `cosmo_applications` | Application hierarchy and metadata | domain/application/team |
| `cosmo_pipelines` | Brick/DAG/lifecycle definitions | domain/application |
| `cosmo_runs` | Builds, deploys, executions | domain/application/team |
| `cosmo_batches` | Run step batches | parent run |
| `cosmo_findings` | Security findings and results | domain/application/team |
| `cosmo_evidence_ledger` | Attachments, events, annotations, transfers | parent resource |
| `cosmo_audit_events` | Immutable security and administration trail | domain/system |

Supporting resources such as secrets, integrations, runtimes and package
artifacts are capabilities on these entities or explicit administrative
resources. They must not silently inherit broad application read/write access.

## 4. Capability vocabulary

The existing code uses two partially overlapping vocabularies. The following
normalized vocabulary is the target contract; adapters may map old names while
the API is migrated.

| Capability | Resource/action | Risk |
|---|---|---|
| `domain:read` | read domain and membership metadata | low |
| `domain:write` | create/update domain metadata | high |
| `domain:delete` | retire a domain | critical |
| `app:read` | read application metadata | low |
| `app:write` | create/update application | medium |
| `app:delete` | archive/delete application | high |
| `pipeline:read` | read pipeline/brick definitions | low |
| `pipeline:write` | change execution definition | high |
| `run:read` | read run status and output | low/medium |
| `run:start` | start a build, scan or deployment | high |
| `run:stop` | stop an active run | high |
| `finding:read` | read findings | medium |
| `finding:write` | annotate or triage findings | medium |
| `evidence:read` | read evidence and artifacts | medium |
| `evidence:write` | attach evidence or comments | medium |
| `gate:read` | read quality/security gate | low |
| `gate:decide` | approve, reject or override a gate | critical |
| `report:read` | read reports | low/medium |
| `report:generate` | generate/export a report | medium |
| `integration:read` | inspect integration status | medium |
| `integration:manage` | change CI/runtime/integration config | critical |
| `secret:use` | use a referenced secret during execution | critical |
| `secret:manage` | create, rotate or delete secret references | critical |
| `rbac:read` | inspect roles and assignments | medium |
| `rbac:manage` | assign roles or capabilities | critical |
| `audit:read` | inspect audit events | medium/high |
| `tokens:manage` | issue or revoke PATs | high |

`fuzzer:execute`, `policies:manage` and `retention:clean` from the existing
profile research remain valid product capabilities, but should be mapped to
`run:start`, policy-specific resources and a dedicated retention action before
they are exposed in Cosmoport.

## 5. Initial role matrix

This is a product baseline derived from the current repository, not a ЦБ
mapping. It requires owner approval and later implementation tests.

| Capability group | `admin_sec` | `admin_abnormal` | `admin_service` | `sec_expert` | `user` |
|---|:---:|:---:|:---:|:---:|:---:|
| Domain read | yes | yes | yes | assigned | assigned |
| Domain write/delete | yes | no by default | no | no | no |
| App read | all | all during elevation | domain | assigned | assigned |
| App write/delete | yes | write only during elevation | operational subset | no | no |
| Pipeline read | yes | yes during elevation | yes | assigned | assigned |
| Pipeline write | yes | emergency only | yes | no | no |
| Run read | all | all during elevation | domain | assigned | assigned/shared |
| Run start/stop | yes | emergency only | operational | yes | no |
| Findings read | all | all during elevation | domain | assigned | assigned/shared |
| Findings write | yes | emergency only | no | yes | no |
| Gate read | yes | yes | yes | yes | assigned |
| Gate decide/override | yes with audit | emergency only with reason | no | decide, no override | no |
| Integrations/runtimes | manage | emergency only | manage | read assigned | no |
| Secrets | manage | never by default | use, not manage | no direct access | no |
| RBAC | manage | no | no | no | no |
| Audit read | yes | yes | operational subset | assigned | own actions only |
| PAT management | own and delegated policy | emergency session only | own | own | own if enabled |

`admin_abnormal` is not a second permanent super-admin. It requires an
explicit elevation record, expiry, reason and complete audit trail. Emergency
access must not silently grant secret management or role administration.

## 6. Scope and policy evaluation

Every authorization decision should evaluate:

1. subject identity, active role assignments and elevation state;
2. capability requested;
3. resource type and resource ID;
4. domain membership and team membership;
5. ownership or explicit sharing where applicable;
6. environment/contour restrictions for runs and integrations;
7. separation-of-duties constraints;
8. audit requirements and emergency reason.

Recommended policy shape:

```text
allow(subject, capability, resource, context)
  = role_capability(subject, capability)
  && domain_scope(subject, resource)
  && team_scope(subject, resource)
  && abac_conditions(subject, resource, context)
  && sod_allows(subject, capability, resource)
  && elevation_valid(subject, capability, context)
```

The current `DomainRBAC.can()` implements only role lookup and optional team
matching. It is a useful smoke-test engine, not the final durable policy
engine. Persistent assignments and audit records belong in PostgreSQL; Valkey
may cache decisions but cannot be the source of truth.

## 7. Separation of duties

The following controls are required for a secure default:

- The actor who changes a pipeline or security policy must not silently be the
  sole actor who approves its production gate.
- Gate override requires a reason, actor, timestamp, target and immutable
  audit event.
- Secret values are never returned through profile, application or audit APIs.
- Role assignment changes require `rbac:manage` and produce before/after
  audit evidence.
- Emergency elevation has a TTL and is denied after expiry, even if the
  session remains active.
- Audit events are append-only from the application authorization path.

## 8. Open questions

- Record the validated ЦБРФ.62.0.39780 workbook hash/version and preserve a
  machine-readable extraction of its 726 matrix rows.
- Decide whether `sec_expert` may approve ordinary gates or only sign findings;
  the current test fixture grants `sign_act` but not administrative override.
- Define the exact team/application inheritance rule for nested applications.
- Define production-contour restrictions for `run:start`, `run:stop` and
  `integration:manage`.
- Define PAT scope issuance rules and whether users can self-issue tokens.
- Define the immutable audit storage boundary between
  `cosmo_evidence_ledger` and `cosmo_audit_events`.

## 9. Acceptance baseline

Before implementation is accepted:

- every API operation declares a resource and capability;
- no UI-only role check is treated as authorization;
- domain and team scope are tested for every non-admin role;
- emergency access expiry and audit are tested;
- secret read/write and gate override are negative-tested;
- role assignment changes are audited;
- PostgreSQL persistence survives process restart;
- the validated ЦБ matrix is either mapped explicitly or listed as not adopted.