# Data Contracts & Telemetry Protocol (PK-EC-4)

> Canonical telemetry and ghost values contract for PrettyK Editor Workbench, Step Debugger, and Live Execution Engine.

---

## 1. Step Status State Machine
Step execution statuses follow fail-closed honest states:
```
[idle] ──> [queued] ──> [running] ──┬──> [success]
                                     ├──> [failed]
                                     └──> [skipped]
```

- **`idle`**: Step is configured but not part of current dispatch.
- **`queued`**: Scheduled and awaiting runner / lease allocation.
- **`running`**: Actively executing probes / actions / HTTP requests.
- **`success`**: Step completed successfully, invariants verified.
- **`failed`**: Step encountered an assertion failure, exception, or timeout.
- **`skipped`**: Step was bypassed due to upstream condition or failure without `continue_on_error`.

---

## 2. Server-Sent Events (SSE) Wire Format
Backend execution engines (`:8767` or pipeline runner) emit SSE streams using standard `data: JSON\n\n` frames:

### Event: `step_telemetry`
```json
{
  "type": "step_event",
  "payload": {
    "run_id": "run-alpha-8821",
    "step_id": "step-fuzz-auth-header",
    "status": "running",
    "duration_ms": 850,
    "timestamp": "2026-08-25T14:32:01.950Z",
    "metrics": {
      "payloads_sent": 120,
      "anomalies_detected": 1
    }
  }
}
```

### Event: `runtime_snapshot` (Ghost Values & Variable Inspector)
```json
{
  "type": "runtime_snapshot",
  "payload": {
    "step_id": "step-auth-init",
    "timestamp": "2026-08-25T14:32:01.242Z",
    "variables": [
      {
        "name": "JWT_ACCESS_TOKEN",
        "value": "pk_live_****3a8f",
        "isSecret": true,
        "type": "token",
        "sourceStepId": "step-auth-init",
        "masked": true
      }
    ],
    "stdout": "[AUTH] Handshake OK",
    "httpExchange": {
      "requestUrl": "https://api.stage.internal/v1/auth/exchange",
      "method": "POST",
      "status": 200,
      "responseBodyPreview": "{\"status\":\"ok\"}"
    }
  }
}
```

---

## 3. Ghost Values Resolution Protocol
- When the user edits DSL or inspects a step in **Editor Workbench**, expressions like `$JWT_ACCESS_TOKEN` or `$SESSION_NONCE` are resolved against the latest `StepRuntimeSnapshot`.
- **Secret Redaction**: Variables marked with `isSecret: true` are never exposed in plaintext across unauthenticated telemetry endpoints.
- **Provenance**: Each `VariableSnapshot` specifies `sourceStepId` for traceability across step dependencies.
