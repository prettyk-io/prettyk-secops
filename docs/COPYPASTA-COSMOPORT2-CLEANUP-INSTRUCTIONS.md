# Cosmoport 2.0 — Instructions for Cleanup and Steel-Thread Recovery

> **Status:** `draft / evolve / owner-review-needed`
>
> **Audience:** Cosmo/Gemini, Cosmoport2 maintainers, implementing engineers
>
> **Purpose:** turn the current broad UI demonstration into a narrow, honest,
> domain-backed operator control plane.
>
> This document is an instruction pack, not a new sealed canon. Do not modify
> `sanctuary/pure/` or sealed Cosmoport2 decisions as part of this pass.

---

## 1. Mission

Stop polishing the facade. Recover one truthful, testable operator path:

```text
Application
  -> Git binding
  -> lifecycle / pipeline definition
  -> immutable commit and Build
  -> Run and batches
  -> findings and Evidence
  -> backend Gate decision
  -> Release from the exact Build
  -> Deployment / transfer: ЗР -> ЗТ -> ЗПЭ
  -> audit and rollback evidence
```

The UI must never claim that an operation happened when only React state
changed. Empty, unavailable and not-yet-implemented states must be honest.

The quality bar is not the number of screens. The quality bar is whether an
operator can answer, from authoritative data:

1. Which application and repository are involved?
2. Which pipeline, plan and immutable commit were used?
3. Which Build and artifacts were produced?
4. Which Run executed, with which findings and evidence?
5. Why did the Gate pass or block?
6. Which Release was created from which exact Build?
7. Who transferred or deployed it, where, when and under which authorization?

---

## 2. Non-negotiable rules

1. **No synthetic production-looking data.** Do not render hardcoded releases,
   evidence, users, alerts, findings, batches, contacts, integrations or
   packages as if they came from the backend.
2. **No silent success.** API errors must remain errors. Do not convert a failed
   request into `[]`, a submitted payload or a locally created resource.
3. **No client authority.** The frontend may request an operation and display
   the result. It must not authorize, sign, approve, transfer or invent a
   cryptographic record.
4. **No fake SSE.** `setInterval` is polling, not SSE. Use a real server stream
   with REST history fallback, or label the feature as polling and do not call
   it live SSE.
5. **No vendor leakage.** Remove `Vault`, `HashiCorp Vault Path`,
   `VAULT/TOKEN` and `vault_path` from the operator UI and product contract.
   Secret-provider implementation belongs behind the backend boundary.
6. **No role-console drift.** RBAC matrix, role editing and team-scope admin
   are not operator-portal features. Keep authorization enforcement in the
   backend/admin plane; do not show a mock security console.
7. **No route theatre.** A route without a real domain-backed view must be
   hidden, embedded into its owning entity or removed. It must not fall through
   to Overview under another label.
8. **No scope expansion.** Do not add analytics, SLA, SBOM, GOST, emergency,
   topology, storage or infrastructure dashboards to compensate for missing
   core workflow.
9. **Preserve observed needs, not legacy clutter.** Application lifecycle
   settings are core when they affect execution. Legacy vendor fields and
   unverified forms are not automatically core.
10. **Every assumption is visible.** Mark facts as `observed`, `inferred`,
    `decision` or `open`; do not hide uncertainty in fallback code.

---

## 3. Current defects to address

These are confirmed in the current frontend source. Treat them as concrete
work items, not abstract recommendations.

### 3.1. Shell and navigation

File: `frontend/src/cosmo/station/ControlStationShell.tsx`

- The comment says “Canonical 6-Item Operator Sidebar”, while the current
  primary list contains eight items: Overview, Applications, Builds,
  Deployments, Pipelines, Runs, Gates and Releases.
- `Evidence`, `AuditLog` and `Analytics` exist as components but are not
  connected to the shell’s main routing.
- Internal routes such as `catalog`, `compare` and
  `gate-policy-builder` are reachable in code but are not consistently
  classified as primary, embedded or administrative surfaces.

Required result:

- Make the primary operator navigation explicitly consistent with the product
  decision: `Overview`, `Applications`, `Pipelines`, `Runs`, `Gates`,
  `Releases`.
- Keep Builds and Deployments as real views, either as first-class registries
  with an explicit owner decision or as embedded views in application/release
  detail. Do not replace them with generic Runs or decorative kanban.
- Evidence and Findings belong to Run/Gate/Release context. Do not expose a
  standalone mock ledger.
- Remove, embed or separately classify every route that has no authoritative
  data and operator action.

### 3.2. Application registry and detail

Files:

- `frontend/src/cosmo/station/views/Applications.tsx`
- `frontend/src/cosmo/station/views/ApplicationDetail.tsx`

Required result:

- Fix the Applications table so column headers match the rendered cells.
- Keep application identity, domain, level/kind, Git binding, owner/team,
  lifecycle status, pipeline binding and history in one authoritative detail
  model.
- Replace unconditional destructive delete with the agreed archive/lifecycle
  operation, if the backend supports it. If it does not, show the limitation;
  do not simulate archive.
- Make Git repository and branch context real and backend-backed.
- Keep lifecycle settings that genuinely influence build/deploy execution.
- Remove the current hardcoded contacts, always-green integrations and
  invented CBR/JIRA values unless each has an authoritative API contract.
- Remove `Vault Path` and ABAC/vendor-specific fields from the operator
  contract. JIRA and monitoring remain `open` until their ownership and API
  contract are explicitly confirmed.
- A save button is complete only when the backend persists the setting and a
  subsequent read returns the persisted value.

### 3.3. Pipeline and DAG

File: `frontend/src/cosmo/station/views/PipelineStudio.tsx`

Required result:

- Distinguish pipeline identity, immutable compiled plan, build, run and
  artifact set.
- Persist DAG/configuration changes through an authoritative API, or remove
  drag-and-drop editing until such an API exists.
- Run cycle detection against the actual edited graph, not the stale original
  `selectedPlan.brick_ids`.
- The “Run” action must create or request a real Run for the selected app,
  pipeline/plan and commit. Navigation alone is not execution.
- Replace the simulated status interval with real run/brick events. Until the
  stream exists, show a truthful non-live state.

### 3.4. Evidence and findings

File: `frontend/src/cosmo/station/views/Evidence.tsx`

Required result:

- Remove `mockEntries` and every hardcoded evidence record.
- Add or use a real evidence endpoint with `run_id`, `batch_id`, type,
  content reference, hash, provenance and creation time.
- An empty response must display “no evidence”, not a fabricated log/finding/
  decision.
- The “SHA-256 chain valid” indicator must be based on a backend verification
  result. If verification is unavailable, display that fact.
- Export buttons must download a server-produced artifact or be disabled with
  an honest explanation. A toast is not an export.
- Findings must link to their actual run/batch/evidence and, where available,
  repository, file and line.

### 3.5. Gates and signatures

File: `frontend/src/cosmo/station/views/Gates.tsx`

Required result:

- Remove timestamp-derived pseudo-signatures and arbitrary default operator
  identities.
- Gate decision authority, authenticated principal, capability, scope,
  separation of duties and audit record must be enforced server-side.
- The UI may collect a reason or confirmation, but it must not manufacture a
  signature or claim 2FA.
- Bulk decisions require an explicit backend contract. If no atomic/batch
  endpoint exists, do not disguise a client loop as one signed decision.
- Show the server response, including rejection, 403, conflict and SoD
  failure. Do not treat a local state update as approval.

### 3.6. Releases and transfer

Files:

- `frontend/src/cosmo/station/views/Releases.tsx`
- `frontend/src/cosmo/station/views/ReleaseTransferWizard.tsx`

Required result:

- Delete `DEFAULT_RELEASES` from the production path. An empty backend must
  produce an empty state; an unavailable backend must produce an error state.
- A Release manifest must be derived from an exact Build/artifact set, not from
  `head-main`, arbitrary selected apps or a timestamp hash.
- Remove client-generated release and transfer signatures.
- Enforce the only valid transition path: `ЗР -> ЗТ -> ЗПЭ`.
- Preflight must be bound to the actual release, plan/build, findings, gates
  and target zone. `history.length > 0` is not proof of an active approval.
- `authToken` must either participate in the authoritative auth flow or be
  removed from the UI. A field that is checked but never sent is misleading.
- Do not mutate the release manifest merely to render a preview.
- GOST/compliance artifacts must be generated from server-side evidence and
  audit data, not from browser state.

### 3.7. Alerts and live status

File: `frontend/src/cosmo/station/views/AlertHUD.tsx`

Required result:

- Remove hardcoded transfer and vulnerability alerts.
- Remove random timestamps and synthetic event generation.
- Use a real event endpoint/stream, or remove the HUD from the primary shell
  until a real event contract exists.
- Preserve alert identity, source resource, severity, timestamp and read state
  through a defined backend contract.

### 3.8. API client contract

File: `frontend/src/cosmo/station/api.ts`

Required result:

- Do not use `.catch(() => [])`, `.catch(() => data as Release)` or equivalent
  fallbacks for domain operations.
- Define one authoritative domain/context propagation mechanism for every
  request.
- Preserve HTTP semantics: `401`, `403`, `404`, `409`, validation errors and
  transport errors must remain distinguishable to the UI.
- Align the client model with the backend model. Remove fields that have no
  authoritative owner.
- Every mutating API method must document required capability, resource scope,
  audit event and expected failure cases.

### 3.9. Web IDE and Deep-Linking

Files:

- `frontend/src/cosmo/ide/WebIDEShell.tsx`
- `frontend/src/cosmo/shared/DeepLinker.tsx`
- `frontend/src/App.tsx`

Required result:

- Remove synthetic fallback files and mock code comments when backend fetch fails.
  Show an honest «File unavailable» state.
- `Commit & Run` must not use a hardcoded `plan_id: 'plan-steel'` or guess
  domain from repository name. It must be bound to the authoritative application,
  pipeline plan, and active branch/commit.
- Deep linking must complete the transition: `setIDEContext()` in `DeepLinker`
  must also switch active surface to `'ide'`, and `setStationContext()` must switch
  surface back to `'station'`.
- Remove fake step execution (`handleRunStep` claiming `[SUCCESS] Step completed`
  after just saving a file). An action must only report success if an actual backend
  runner executed it.

---

## 4. What to remove or hide in this pass

Remove from the operator portal, rather than cosmetically disabling:

- mock RBAC/team-scope console;
- SLA and executive posture dashboards;
- standalone SBOM explorer;
- standalone GOST constructor;
- emergency/mock rollback deck;
- static run comparison;
- global synthetic log viewer;
- standalone analytics/trend dashboards;
- vendor-specific Vault settings;
- random preflight and client-generated signatures;
- empty routes that render Overview under a different label.

These concepts may exist behind the backend or return as a separate product
decision. They do not belong in the current primary operator flow without a
real data contract and a demonstrated operator task.

---

## 5. Required implementation order

Do not parallelize the work into unrelated visual epics. Use this order:

### Phase A — Honest surface

1. Remove/hide fake and unowned routes.
2. Remove demo fallbacks, synthetic records and pseudo-signatures.
3. Replace misleading success UI with explicit empty/error/not-supported
   states.
4. Make the navigation registry and route behavior internally consistent.

### Phase B — Context and resource contracts

1. Make authenticated principal, domain, zone and environment context explicit.
2. Give Application, Pipeline, Plan, Build, Run, Gate, Evidence, Release and
   Deployment distinct identities.
3. Define the API response and failure contract for each resource.
4. Confirm which data is durable in PostgreSQL, streamed through Valkey and
   stored as artifacts in S3/MinIO.

### Phase C — First vertical slice

Implement and prove one complete slice:

```text
one application
  -> one Git binding
  -> one pipeline/plan
  -> one immutable commit
  -> one Build
  -> one Run
  -> one finding/evidence record
  -> one Gate decision
```

The slice must include successful and rejected paths, scope enforcement, audit
record and reload-after-write verification.

### Phase D — Release and transfer

Only after Phase C is real:

1. Create a Release from the exact Build/artifacts.
2. Evaluate gates server-side.
3. Transfer sequentially `ЗР -> ЗТ -> ЗПЭ`.
4. Record operator, authorization, timestamps, evidence and audit events.
5. Support rollback only when the backend defines the target artifact and
   authorization semantics.

### Phase E — Secondary surfaces

Do not restore Analytics, SBOM, GOST, comparison, emergency or admin surfaces
automatically. Each requires a new explicit scope decision and a real contract.

---

## 6. Definition of done

The cleanup/recovery pass is not complete until all statements below are true:

- [ ] No production-looking hardcoded records remain in the active operator
      path.
- [ ] No API error silently becomes empty data or local success.
- [ ] No client-generated string is presented as a signature or 2FA proof.
- [ ] No `setInterval` is labelled SSE/live execution.
- [ ] Empty and unavailable states are visually distinct.
- [ ] Primary navigation contains only owned, working surfaces.
- [ ] Application table headers match cells and actions have real handlers.
- [ ] Build and Deployment provenance includes application, repository, exact
      commit/artifact, status, actor and timestamps.
- [ ] Run, batch, finding and evidence records are linked by durable IDs.
- [ ] Gate decisions are backend-authorized, auditable and SoD-aware.
- [ ] Release manifests point to exact verified artifacts.
- [ ] Transfer cannot skip a security zone.
- [ ] Web IDE context jumps carry real repository/file/line and return to the
      correct Station resource.
- [ ] Both Control Station and Web IDE use the same backend authorization.
- [ ] The relevant frontend tests cover success, empty, error, 401/403 and
      stale/reload cases.
- [ ] The implementer reports every unresolved assumption instead of hiding it
      in a fallback.

---

## 7. Required response from the implementers

Do not answer with “done” or a screenshot. Return:

1. **Changed files and scope:** what was deleted, hidden, rewired or added.
2. **Contract table:** resource, endpoint, source of truth, capability,
   scope, audit event and failure behavior.
3. **Removed-mock inventory:** every synthetic fallback removed or explicitly
   retained with a reason.
4. **Vertical-slice evidence:** exact test/API/UI path proving the steel thread.
5. **Open questions:** facts still requiring owner decision; no silent guesses.
6. **Verification results:** focused tests, typecheck/build result and any
   environment limitation.

If a backend contract is missing, stop at the boundary and report it. Do not
invent a local substitute merely to make the screen look complete.

---

## 8. Final instruction

The target is not a prettier demo. The target is a smaller surface that tells
the truth.

Keep the useful architecture: two surfaces, application identity, Git binding,
pipeline graph, Build, Run, findings/evidence, Gate, Release and zone transfer.
Remove the theatrical layer around it. The monkey pit already had enough gold
paint; this pass is for load-bearing stone.
