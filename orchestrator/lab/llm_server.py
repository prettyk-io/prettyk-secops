# -*- coding: utf-8 -*-
"""LLM Server — Python wrapper over llama.cpp (subprocess llama-server).

Endpoints on :8766:
  POST /api/ai/classify   — alert → {severity, fp_confidence, reasoning}
  POST /api/ai/diff       — two HTTP responses → diff analysis
  POST /api/ai/prioritize — alert list → prioritized list

Uses llama-server (subprocess, :8768) as inference backend.
Models: fast Qwen3-1.7B and optional reasoning Qwen3-4B, CPU-only.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure orchestrator/ is on sys.path so that 'from models.delta import ...' works
# when llm_server.py is run directly (e.g. python orchestrator/lab/llm_server.py).
_ORCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ORCH not in sys.path:
    sys.path.insert(0, _ORCH)

MODEL_PATH = os.environ.get("LLM_MODEL_PATH", "/models/qwen3-1.7b-q5_k_m.gguf")
LLAMA_HOST = os.environ.get("LLAMA_HOST", "127.0.0.1")
LLAMA_PORT = int(os.environ.get("LLAMA_PORT", "8768"))
REASONING_HOST = os.environ.get("LLAMA_REASONING_HOST", LLAMA_HOST)
REASONING_PORT = int(os.environ.get("LLAMA_REASONING_PORT", str(LLAMA_PORT)))
FAST_MODEL_NAME = os.environ.get("LLM_FAST_MODEL_NAME", "Qwen3-1.7B")
REASONING_MODEL_NAME = os.environ.get("LLM_REASONING_MODEL_NAME", FAST_MODEL_NAME)
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "8766"))
LLAMA_THREADS = int(os.environ.get("LLAMA_THREADS", "4"))
LLAMA_CTX = int(os.environ.get("LLAMA_CTX", "4096"))
GRAMMAR_DIR = os.environ.get("LLM_GRAMMAR_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "grammars"))

_grammar_cache: dict[str, str | None] = {}


def _load_grammar(endpoint: str) -> str | None:
    """Load GBNF grammar for constrained JSON output. Cached per process."""
    if endpoint not in _grammar_cache:
        path = os.path.join(GRAMMAR_DIR, f"{endpoint}.gbnf")
        try:
            _grammar_cache[endpoint] = open(path, encoding="utf-8").read()
        except OSError:
            _grammar_cache[endpoint] = None
    return _grammar_cache[endpoint]


def _llama_request(
    prompt: str,
    max_tokens: int = 256,
    timeout: int = 5,
    enable_thinking: bool = False,
    grammar_file: str | None = None,
    backend: str = "fast",
) -> str:
    """Send chat-completion request to llama-server, return generated text.

    Qwen3 — thinking-модель: при enable_thinking=True ответ пишется в ``content``
    только ПОСЛЕ фазы reasoning. Для быстрой классификации думать не нужно.
    """
    body: dict = {
        "messages": [
            {
                "role": "system",
                "content": (
                    "Ты — ассистент анализа безопасности. Отвечай СТРОГО одним валидным "
                    "JSON-объектом, без markdown-разметки, без ```, без пояснений вне JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.1,
        "top_p": 0.95,
    }
    if not enable_thinking:
        body["chat_template_kwargs"] = {"enable_thinking": False}
    if grammar_file:
        gbnf_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "grammars", grammar_file
        )
        if os.path.exists(gbnf_path):
            with open(gbnf_path, "r", encoding="utf-8") as fh:
                body["grammar"] = fh.read()

    host, port = (REASONING_HOST, REASONING_PORT) if backend == "reasoning" else (LLAMA_HOST, LLAMA_PORT)
    req = urllib.request.Request(
        f"http://{host}:{port}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            message = data.get("choices", [{}])[0].get("message", {})
            content = message.get("content", "").strip()
            if not content:
                # Thinking-модель могла не дойти до ответа — берём reasoning как fallback.
                content = message.get("reasoning_content", "").strip()
            return content
    except urllib.error.URLError:
        return ""
    except Exception:
        return ""


def _extract_json(text: str) -> dict | list:
    """Best-effort JSON extraction from LLM output."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    for pat in [r'\{[\s\S]*\}', r'\[[\s\S]*\]']:
        m = re.search(pat, text)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                continue
    return {}


class _Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _read_body_bytes(self, max_bytes: int = 65536) -> bytes:
        """Read raw body with size cap. Returns empty bytes on oversize."""
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return b""
        if length > max_bytes:
            raise ValueError(f"body exceeds {max_bytes} bytes")
        return self.rfile.read(length)

    def do_POST(self):
        if self.path == "/api/ai/classify":
            self._handle_classify()
        elif self.path == "/api/ai/diff":
            self._handle_diff()
        elif self.path == "/api/ai/prioritize":
            self._handle_prioritize()
        elif self.path == "/api/ai/delta":
            self._handle_delta()
        elif self.path == "/api/ai/semantic-group":
            self._handle_semantic_group()
        elif self.path == "/api/ai/preflight":
            self._handle_preflight()
        elif self.path == "/health":
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, 404)

    # ── classify ────────────────────────────────────────────────

    def _handle_classify(self):
        data = self._read_body()
        alert = data.get("alert", data)

        name = alert.get("name", alert.get("alert", "Unknown"))
        desc = alert.get("description", alert.get("desc", ""))
        risk = alert.get("risk", alert.get("risk_level", "N/A"))
        confidence = alert.get("confidence", "N/A")

        prompt = (
            "Classify this security alert. Return ONLY valid JSON (no markdown, no extra text):\n"
            f"Alert: {name}\n"
            f"Description: {desc}\n"
            f"Risk: {risk}\n"
            f"Confidence: {confidence}\n\n"
            '{"severity": "<critical|high|medium|low|info>", '
            '"fp_confidence": <0.0-1.0>, '
            '"reasoning": "<short explanation>"}'
        )

        output = _llama_request(prompt, max_tokens=128, timeout=30, enable_thinking=False)
        result = _extract_json(output)

        if not isinstance(result, dict):
            result = {}
        result.setdefault("severity", "info")
        result.setdefault("fp_confidence", 0.5)
        result.setdefault("reasoning", output[:200] if output else "no output")

        self._send_json(result)

    # ── diff ────────────────────────────────────────────────────

    def _handle_diff(self):
        data = self._read_body()
        resp_a = data.get("response_a", data.get("a", ""))
        resp_b = data.get("response_b", data.get("b", ""))

        trunc_a = str(resp_a)[:1500]
        trunc_b = str(resp_b)[:1500]

        prompt = (
            "Compare two HTTP responses (security analysis). Return ONLY valid JSON:\n"
            f"Response A:\n{trunc_a}\n\n"
            f"Response B:\n{trunc_b}\n\n"
            '{"identical": <true|false>, '
            '"differences": ["<diff item>", ...], '
            '"security_relevant": <true|false>, '
            '"summary": "<short analysis>"}'
        )

        output = _llama_request(prompt, max_tokens=512, timeout=90, enable_thinking=True, backend="fast")
        result = _extract_json(output)

        if not isinstance(result, dict):
            result = {}
        result.setdefault("identical", False)
        result.setdefault("differences", [])
        result.setdefault("security_relevant", False)
        result.setdefault("summary", output[:300] if output else "no output")

        self._send_json(result)

    # ── prioritize ─────────────────────────────────────────────

    def _handle_prioritize(self):
        data = self._read_body()
        alerts = data.get("alerts", data if isinstance(data, list) else [])

        if not isinstance(alerts, list):
            alerts = []

        briefs = []
        for i, a in enumerate(alerts):
            name = a.get("name", a.get("alert", f"Alert {i}"))
            risk = a.get("risk", a.get("risk_level", "?"))
            briefs.append(f"{i}: {name} (risk={risk})")

        prompt = (
            "Prioritize these security alerts by severity. Return ONLY a JSON array of indices "
            "ordered from highest to lowest priority, then a brief reason:\n"
            + "\n".join(briefs)
            + '\n\n{"priority_order": [<indices>], "reasoning": "<brief>"}'
        )

        output = _llama_request(prompt, max_tokens=300, timeout=60, enable_thinking=False, backend="fast")
        result = _extract_json(output)

        priority_order = []
        reasoning = ""
        if isinstance(result, list):
            priority_order = [int(x) for x in result if isinstance(x, (int, float))]
        elif isinstance(result, dict):
            priority_order = result.get("priority_order", [])
            reasoning = result.get("reasoning", output[:200])
        if not isinstance(priority_order, list):
            priority_order = []

        prioritized = []
        seen = set()
        for idx in priority_order:
            if isinstance(idx, int) and 0 <= idx < len(alerts) and idx not in seen:
                seen.add(idx)
                prioritized.append(alerts[idx])

        for i, a in enumerate(alerts):
            if i not in seen:
                prioritized.append(a)

        self._send_json({
            "prioritized": prioritized,
            "original_order": priority_order,
            "reasoning": reasoning or output[:200],
        })


    # ── delta ──────────────────────────────────────────────────

    def _handle_delta(self):
        """W1: Qwen3 baseline delta — strict validation, fail-closed.

        Accepts compact redacted deterministic delta + provenance.
        Returns validated ai-delta-v1 or explicit error/abstain.
        AI does NOT change deterministic delta, severity, gate, exit or findings.
        """
        from models.delta import (
            AiDeltaDecision,
            AiDeltaResponse,
            AiDeltaSuggestion,
            AiDeltaModelInfo,
            AiSchemaError,
            Confidence,
        )

        try:
            raw = self._read_body_bytes(max_bytes=65536)
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except ValueError:
            self._send_json(
                AiDeltaResponse(
                    decision=AiDeltaDecision.abstain,
                ).to_dict(),
                422,
            )
            return
        except Exception:
            self._send_json(
                AiDeltaResponse(
                    decision=AiDeltaDecision.abstain,
                ).to_dict(),
                400,
            )
            return

        if not isinstance(payload, dict):
            payload = {}

        baseline_id = str(payload.get("baseline_id", ""))
        current_run_id = str(payload.get("current_run_id", ""))

        # Build compact redacted prompt: evidence-first, no raw HTTP/XML/secrets.
        compact = payload.get("compact_redacted_delta", payload.get("delta", {}))

        prompt = (
            "You are a SecOps analyst assistant. You must output ONLY a single JSON "
            "object, no markdown, no ```, no extra text.\n\n"
            "Below is a deterministic comparison between two security scans:\n"
            f"Baseline: {baseline_id}\n"
            f"Current:  {current_run_id}\n"
            f"Comparison status: {compact.get('comparison_status', 'unknown')}\n"
            f"Newly observed: {compact.get('newly_observed', 0)} finding(s)\n"
            f"Not observed:   {compact.get('not_observed', 0)} finding(s)\n"
            f"Changed:        {compact.get('changed', 0)} finding(s)\n\n"
            "Return a JSON object with:\n"
            '- "decision": "narrative_ready" (if possible) or "abstain"\n'
            '- "confidence": "low" | "medium" | "high"\n'
            '- "narrative_ru": short Russian-language advisory summary\n'
            '- "suggestions": []\n'
            '- "unsupported_claims": []\n'
        )

        output = _llama_request(
            prompt,
            max_tokens=512,
            timeout=90,
            enable_thinking=True,
            grammar_file="delta.gbnf",
            backend="reasoning",
        )

        if not output:
            self._send_json(
                AiDeltaResponse(
                    decision=AiDeltaDecision.llm_unavailable,
                ).to_dict(),
            )
            return

        try:
            result = _extract_json(output)
        except Exception:
            self._send_json(
                AiDeltaResponse(
                    decision=AiDeltaDecision.invalid_model_output,
                ).to_dict(),
                422,
            )
            return

        if not isinstance(result, dict):
            result = {}

        # Build response — fail-closed: no fake defaults.
        decision_raw = str(result.get("decision", "")).strip()
        try:
            decision = AiDeltaDecision(decision_raw)
        except ValueError:
            decision = AiDeltaDecision.invalid_model_output

        if decision == AiDeltaDecision.invalid_model_output:
            self._send_json(
                AiDeltaResponse(decision=decision).to_dict(),
                422,
            )
            return

        conf_raw = str(result.get("confidence", "")).strip().lower()
        confidence = Confidence.low
        for c in (Confidence.low, Confidence.medium, Confidence.high):
            if conf_raw == c.value:
                confidence = c
                break

        narrative = str(result.get("narrative_ru", output))[:2000]

        suggestions: list[AiDeltaSuggestion] = []
        for s in result.get("suggestions", []) or []:
            if isinstance(s, dict):
                suggestions.append(AiDeltaSuggestion(
                    code=str(s.get("code", "")),
                    text=str(s.get("text", "")),
                    support=str(s.get("support", "evidence_backed")),
                    evidence_refs=s.get("evidence_refs", []) or [],
                ))

        unsupported: list[str] = []
        for u in result.get("unsupported_claims", []) or []:
            if isinstance(u, str):
                unsupported.append(u)

        response = AiDeltaResponse(
            decision=decision if decision == AiDeltaDecision.narrative_ready else AiDeltaDecision.abstain,
            confidence=confidence,
            narrative_ru=narrative,
            suggestions=suggestions,
            unsupported_claims=unsupported,
            model=AiDeltaModelInfo(
                name=REASONING_MODEL_NAME,
                prompt_version="delta-v1",
            ),
        )
        self._send_json(response.to_dict())

    # ── semantic-group ──────────────────────────────────────────

    def _handle_semantic_group(self):
        """W2: группировка детерминированных findings в exploit-кластеры."""
        data = self._read_body()
        findings = data.get("findings", data if isinstance(data, list) else [])

        if not isinstance(findings, list) or len(findings) == 0:
            self._send_json({"clusters": [], "confidence": "low", "reasoning": "no findings"})
            return

        brief = [
            f"{i}: id={f.get('finding_id', f.get('id', i))} {f.get('title', f'Finding {i}')} "
            f"(sev={f.get('severity','?')}, cwe={f.get('cwe','?')})"
            for i, f in enumerate(findings[:50])
        ]

        prompt = (
            "Group these security findings into exploit families (clusters). "
            "Return ONLY a JSON object:\n"
            + "\n".join(brief)
            + '\n\n{"clusters":[{"cluster_id":"str","title":"str","severity":"<high|medium|low>",'
            '"member_indices":[0,1],"relationship":"<same_endpoint|same_category|same_root_cause>",'
            '"root_cause_hypothesis":"str","systemic_remediation":"str"}]}'
        )

        output = _llama_request(
            prompt,
            max_tokens=600,
            timeout=90,
            enable_thinking=False,
            grammar_file="semantic_group.gbnf",
            backend="reasoning",
        )
        result = _extract_json(output)
        if not isinstance(result, dict):
            result = {}

        clusters_raw = result.get("clusters", [])
        if not isinstance(clusters_raw, list):
            clusters_raw = []

        clusters_out = []
        claimed_indices: set[int] = set()
        for c in clusters_raw:
            if not isinstance(c, dict):
                continue
            raw_indices = c.get("member_indices", []) or []
            if not isinstance(raw_indices, list):
                raw_indices = []
            member_indices: list[int] = []
            for raw_index in raw_indices:
                if isinstance(raw_index, bool) or not isinstance(raw_index, int):
                    continue
                if 0 <= raw_index < len(findings) and raw_index not in claimed_indices:
                    claimed_indices.add(raw_index)
                    member_indices.append(raw_index)
            member_ids = [
                findings[index].get("finding_id", findings[index].get("id", index))
                for index in member_indices
            ]
            severity = str(c.get("severity", "medium")).lower()
            if severity not in {"critical", "high", "medium", "low", "info"}:
                severity = "medium"
            relationship = str(c.get("relationship", "same_endpoint"))
            if relationship not in {"same_endpoint", "same_category", "same_root_cause"}:
                relationship = "same_category"
            clusters_out.append({
                "cluster_id": str(c.get("cluster_id", c.get("id", f"cluster_{len(clusters_out)}"))),
                "title": str(c.get("title", "")),
                "severity": severity,
                "member_indices": member_indices,
                "member_ids": member_ids,
                "relationship": relationship,
                "root_cause_hypothesis": str(c.get("root_cause_hypothesis", "")),
                "systemic_remediation": str(c.get("systemic_remediation", "")),
            })

        self._send_json({
            "clusters": clusters_out,
            "confidence": str(result.get("confidence", "low")).lower()
            if str(result.get("confidence", "low")).lower() in {"low", "medium", "high"}
            else "low",
            "reasoning": str(result.get("reasoning", output[:200])),
            "total_findings": len(findings),
            "total_clusters": len(clusters_out),
            "model": {
                "name": REASONING_MODEL_NAME,
                "prompt_version": "semantic-group-v1",
            },
        })

    # ── preflight ───────────────────────────────────────────────

    def _handle_preflight(self):
        """W2: предполётный аудит манифеста — auth, orphans, sanity."""
        data = self._read_body()
        wired = data.get("wired", data)

        # Extract compact summary — no raw bodies, no secrets
        scenarios = wired.get("test_suites", {}).get("scenarios", []) if isinstance(Wired, dict) else []
        pages = wired.get("test_suites", {}).get("pages", []) if isinstance(Wired, dict) else []
        fuzzers = wired.get("test_suites", {}).get("fuzzers", []) if isinstance(Wired, dict) else []
        auth = wired.get("test_suites", {}).get("auth_modules", []) if isinstance(Wired, dict) else []
        connectors = wired.get("test_suites", {}).get("connectors", []) if isinstance(Wired, dict) else []
        infrastructure = wired.get("infrastructure", {}) if isinstance(Wired, dict) else {}

        brief_parts = [
            f"Manifest: {len(scenarios)} scenarios, {len(pages)} pages, {len(fuzzers)} fuzzers, "
            f"{len(auth)} auth profiles, {len(connectors)} connectors.",
        ]

        for s in scenarios[:5]:
            name = s.get("label", s.get("id", "?"))
            ctor = str(s.get("constructor", ""))
            has_auth = "ПрименитьAuth" in ctor or "НовыйКонтекст" in ctor or "ПрименитьКонтекст" in ctor
            brief_parts.append(f"Scenario '{name}': auth_applied={has_auth}")

        for f in fuzzers[:5]:
            brief_parts.append(f"Fuzzer: {f.get('id', '?')} — {f.get('label', '?')}")

        target_url = str(infrastructure.get("base_url_override", infrastructure.get("base_url", "?")))
        spider_timeout = str(infrastructure.get("spider_timeout", infrastructure.get("spider_timeout_sec", "?")))

        prompt = (
            "You are a SecOps pre-flight auditor. Based on the wired summary below, "
            "list potential issues. Return ONLY a JSON object:\n\n"
            + "\n".join(brief_parts)
            + f"\n\nTarget: {target_url}\nSpider timeout: {spider_timeout}\n\n"
            + '{"warnings":[{"code":"<AUTH_NOT_APPLIED|ORPHAN_FUZZER|ORPHAN_PAGE|TIMEOUT_SUGGESTION|TARGET_MISMATCH|PAGE_MODEL_UNUSED>",'
            + '"text":"<Russian advisory text>","entity_id":"<id>"}],'
            + '"summary":"<Russian one-line summary>"}'
        )

        output = _llama_request(
            prompt,
            max_tokens=400,
            timeout=90,
            enable_thinking=False,
            grammar_file="preflight.gbnf",
            backend="reasoning",
        )
        result = _extract_json(output)
        if not isinstance(result, dict):
            result = {}

        allowed_warning_codes = {
            "AUTH_NOT_APPLIED",
            "ORPHAN_FUZZER",
            "ORPHAN_PAGE",
            "TIMEOUT_SUGGESTION",
            "TARGET_MISMATCH",
            "PAGE_MODEL_UNUSED",
        }
        warnings_raw = result.get("warnings", [])
        warnings = []
        if isinstance(warnings_raw, list):
            for item in warnings_raw:
                if not isinstance(item, dict):
                    continue
                code = str(item.get("code", "")).strip()
                text = str(item.get("text", "")).strip()
                if code not in allowed_warning_codes or not text:
                    continue
                warnings.append({
                    "code": code,
                    "text": text[:1000],
                    "entity_id": str(item.get("entity_id", "")),
                })

        self._send_json({
            "warnings": warnings,
            "summary": str(result.get("summary", "")),
            "manifest_stats": {
                "scenarios": len(scenarios),
                "pages": len(pages),
                "fuzzers": len(fuzzers),
                "auth_modules": len(auth),
                "connectors": len(connectors),
            },
            "model": {
                "name": REASONING_MODEL_NAME,
                "prompt_version": "preflight-v1",
            },
        })


def _start_llama_server() -> subprocess.Popen | None:
    """Start llama-server subprocess. Returns None if model not found."""
    if not os.path.exists(MODEL_PATH):
        print(f"[llm_server] model not found: {MODEL_PATH}", flush=True)
        return None

    cmd = [
        "llama-server",
        "-m", MODEL_PATH,
        "--host", LLAMA_HOST,
        "--port", str(LLAMA_PORT),
        "-t", str(LLAMA_THREADS),
        "--ctx-size", str(LLAMA_CTX),
    ]
    print(f"[llm_server] starting: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc


def _wait_llama_ready(timeout: int = 60) -> bool:
    """Poll llama-server /health until ready."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(
                f"http://{LLAMA_HOST}:{LLAMA_PORT}/health",
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    print("[llm_server] llama-server ready", flush=True)
                    return True
        except Exception:
            pass
        time.sleep(1)
    print("[llm_server] llama-server did not become ready", flush=True)
    return False


def main():
    proc = _start_llama_server()
    if proc is None:
        print("[llm_server] WARNING: running without llama-server backend", flush=True)
    else:
        if not _wait_llama_ready():
            print("[llm_server] WARNING: llama-server not ready, will return fallbacks", flush=True)

    server = HTTPServer(("0.0.0.0", LISTEN_PORT), _Handler)
    print(f"[llm_server] listening on :{LISTEN_PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if proc:
            proc.terminate()
            proc.wait()


if __name__ == "__main__":
    main()
