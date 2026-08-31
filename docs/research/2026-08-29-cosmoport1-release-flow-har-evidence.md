# Cosmoport1 Release Flow HAR Evidence

> Date: 2026-08-29
> Status: observed behavioral evidence; not Cosmoport2 canon
> Source: `D:\cosmo\portal.dev.spaceport.cbr.ru_Archive [26-08-29 15-33-38].har`
> HAR size: 52,780,559 bytes
> HAR SHA-256: `86a12ada9991c09764db4c6f030023e678988c81679c791eead6a484717b1363`
> Entries: 477

## 1. Evidence boundary

This artifact records a real test-user flow with data in Cosmoport1. It is
stronger evidence than static scraping because it demonstrates which controls
and API mutations were actually exercised under two user contexts:

1. a low-privilege `admin` account, which can enter the application and
   settings but sees most settings disabled;
2. a privileged `admin_abnormal` account, which performs the configuration and
   release-build lifecycle described below.

The account labels and the observed UI behavior are supplied as the flow
annotation. The HAR is used here for request ordering, endpoint paths, HTTP
methods/statuses, and response shapes. Credentials, cookies, authorization
headers, query values, request values and response values are intentionally not
copied into this document.

## 2. Observed end-to-end sequence

The privileged flow performs these durable-looking portal operations in order:

| HAR position | Method | Endpoint shape | Result | Behavioral meaning |
|---:|---|---|---:|---|
| 288 | `PATCH` | `/api/projects/{project_id}/settings` | `200` | update project settings |
| 289 | `PATCH` | `/api/projects/{project_id}/update_lc_config` | `200` | apply lifecycle configuration and steps |
| 310 | `POST` | `/api/projects/{project_id}/runtimes` | `201` | assign/create execution runtime |
| 333 | `POST` | `/api/projects/{project_id}/pipelines` | `201` | assign/create application pipeline |
| 357 | `POST` | `/api/projects/{project_id}/vms` | `201` | provision execution VM |
| 403 | `POST` | `/api/projects/{project_id}/releases` | `201` | create release |
| 429 | `POST` | `/api/releases/{release_id}/build` | `201` | start release build |
| 451 | `PATCH` | `/api/builds/{build_id}/stop` | `204` | stop running release build |
| 452 | `DELETE` | `/api/builds/{build_id}` | `200` | delete the stopped build |

The flow therefore proves a concrete capability chain, not merely page
visibility:

```text
project settings write
  → lifecycle write
  → runtime provision
  → pipeline provision
  → VM provision
  → release create
  → release build start
  → build stop
  → build delete
```

## 3. Read-side evidence around the flow

The portal loads the following resource families while entering the project,
settings, release and build views:

- `/api/settings/all`;
- `/api/core_services`;
- `/api/its_groups`;
- `/api/projects/{project_id}/members` and `/members/contacts`;
- `/api/projects/{project_id}/abac_realm_codes`;
- `/api/projects/{project_id}/resources` and `/resources/inherited`;
- `/api/projects/{project_id}/runtimes` and `/runtimes/production`;
- `/api/projects/{project_id}/pipelines`;
- `/api/projects/{project_id}/vms`;
- `/api/projects/{project_id}/env_profiles`;
- `/api/projects/{project_id}/integrations`;
- `/api/projects/{project_id}/releases`;
- `/api/releases/{release_id}/release_routes`;
- `/api/releases/{release_id}/release_logs`;
- `/api/releases/{release_id}/release_runtimes`;
- `/api/releases/{release_id}/events`;
- `/api/projects/{project_id}/builds`;
- `/api/builds/{build_id}/deployments`.

The response shapes confirm that the legacy portal uses JSON:API-like
`data/type/id/attributes/relationships` envelopes. Project attributes include
settings such as `autoBuild`, `runUnitTests`, `canOrderRuntime`,
`canOrderPipeline`, `customBuildPipeline` and `multithreadingBuilds`.

The lifecycle update payload contains ordered steps with:

```text
stepId, stepOrder, stepName, stepRequired, stepEnabled,
stepOnFailure, section, __META__.fields, __META__.refs
```

Release/build response shapes include status, security and analysis status,
quality, manifest, commit, environment/profile IDs, pipeline ID, runtime types,
configuration and protection flags.

## 4. Security-relevant observations

### 4.1. Disabled settings are an authorization projection

The low-privilege account can navigate to settings, but most settings are
disabled. Therefore Cosmoport1 distinguishes at least:

```text
route/page visibility
  ≠ field/action editability
  ≠ backend mutation authority
```

Cosmoport2 should preserve this distinction in UI, while treating backend
capability checks as authoritative.

### 4.2. Provisioning is distinct from project write

The flow separates project settings from runtime, pipeline and VM creation.
This supports independent capabilities such as:

```text
application:write
runtime:manage
pipeline:manage
execution_environment:manage
```

`app:write` must not implicitly grant access to credentials, runtime
provisioning or execution infrastructure.

### 4.3. Release build is a first-class operational action

The release is created before its build is started. The build can then be
stopped and deleted through separate operations. Cosmoport2 should model these
as separate capabilities and audit events rather than one generic
`release:manage` permission:

```text
release:create
release:read
release:build:start
run:stop
run:delete
```

Whether a release build may be deleted, and under which zones/statuses, must be
governed by lifecycle policy and SoD.

### 4.4. Legacy release routes expose SoD-shaped data, not enforcement proof

Release responses contain transfer routes with `zone`, `contour`, `sod` and
related route metadata. This is evidence that the legacy domain has a concept
of transfer routing and SoD-shaped configuration. The flow itself does not
prove that SoD is enforced. The dedicated discovery result says it is not.

Therefore the Cosmoport2 rule remains:

```text
legacy route metadata → observed input
Cosmo2 SoD policy       → explicit server-side decision
```

### 4.5. Credential exposure must not be inherited

The HAR response shapes expose credential-shaped fields in legacy service and
pipeline-related data, including a `password` attribute name. This document
does not copy any values. Cosmoport2 must retain the already sealed rule:

```text
OpenBao value
  → vault reference in PostgreSQL
  → redacted metadata in API/UI
```

## 5. Mapping to Cosmoport2

| Legacy evidence | Cosmoport2 interpretation | Classification |
|---|---|---|
| disabled settings for low-privilege account | capability-aware UI projection | observed → implementation requirement |
| project settings PATCH | application/settings mutation | observed → inferred capability split |
| LC config PATCH | lifecycle/pipeline policy mutation | observed → inferred capability split |
| runtime POST | runtime provisioning | observed → separate scoped capability |
| pipeline POST | pipeline provisioning | observed → separate scoped capability |
| VM POST | execution environment provisioning | observed → separate critical capability |
| release POST | release creation | observed → release:create |
| release build POST | release execution/build start | observed → release:build:start |
| build stop PATCH | execution stop | observed → run:stop |
| build DELETE | destructive run/build operation | observed → run:delete with policy |
| hostname/session zone behavior | legacy zone context mechanism | observed; not trusted design |
| `allow_failure`/missing severity gate | legacy security gap | observed → Cosmo2 must own gate policy |
| missing creator/approver separation | legacy security gap | observed → Cosmo2 SoD requirement |

## 6. What this evidence does and does not prove

It proves that the tested privileged account could execute the listed sequence
and that the portal exposed distinct API operations for each phase.

It does not prove:

- that the same account was authorized by a secure server-side principal;
- that every API endpoint independently enforced the UI ability check;
- that release approval, severity gates or SoD were enforced;
- that a production transfer occurred;
- that any credential value should be retained or migrated.

The HAR is therefore an `observed behavioral evidence` source for the
traceability annex, not a security certification of Cosmoport1.