# -*- coding: utf-8 -*-
"""
G-38 / G-35 / G-45: манифест → ZAP Automation Framework YAML.

Только генерация артефакта. Не вызывает runPlan / autorun (Honest Contract).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Union
from urllib.parse import urlparse

from core.auth_bootstrap import (
    _API_COOKIE,
    _BASIC,
    _BEARER,
    _FORM,
    _NONE,
    _SSO,
    _WEB_COOKIE,
)

# scan_policy формы → профиль jobs
POLICY_TO_PROFILE = {
    "custom_policy": "smoke",
    "scanner_crawler": "crawler",
    "scanner_fuzzing": "active",
    "openapi_schema": "api",
    "api_scanner": "api",
}

# G-49: глубина active scan (strength/threshold + durations) по AF-профилю
SCAN_DEPTH_PROFILES: Dict[str, Optional[Dict[str, Any]]] = {
    "smoke": {
        "policy_name": "pk-smoke",
        "defaultStrength": "Low",
        "defaultThreshold": "Medium",
        "maxRuleDurationInMins": 1,
        "maxScanDurationInMins": 3,
    },
    "crawler": None,
    "active": {
        "policy_name": "pk-deep",
        "defaultStrength": "High",
        "defaultThreshold": "Low",
        "maxRuleDurationInMins": 2,
        "maxScanDurationInMins": 5,
    },
    "api": {
        "policy_name": "pk-api",
        "defaultStrength": "Medium",
        "defaultThreshold": "Medium",
        "maxRuleDurationInMins": 1,
        "maxScanDurationInMins": 3,
    },
}

# G-46: алиасы шаблонов Report Generation add-on
REPORT_TEMPLATE_ALIASES: Dict[str, str] = {
    "html": "traditional-html",
    "traditional-html": "traditional-html",
    "traditional-html-plus": "traditional-html-plus",
    "sarif": "sarif-json",
    "sarif-json": "sarif-json",
    "risk-confidence-html": "risk-confidence-html",
    "traditional-json": "traditional-json",
    "traditional-xml": "traditional-xml",
    "traditional-md": "traditional-md",
}


def depth_spec_for_profile(af_profile: str) -> Optional[Dict[str, Any]]:
    """G-49: strength/threshold + durations для AF profile (smoke/deep/api)."""
    return SCAN_DEPTH_PROFILES.get(af_profile)


def normalize_report_template(template: Optional[str]) -> str:
    """G-46: canonical template id для AF report job."""
    key = (template or "traditional-html").strip()
    return REPORT_TEMPLATE_ALIASES.get(key, key)

DEFAULT_CONTEXT = "pk_ctx"

# Env vars для секретов в AF (не коммитить plaintext в этalon YAML).
AUTH_ENV_USERNAME = "PK_AUTH_USERNAME"
AUTH_ENV_PASSWORD = "PK_AUTH_PASSWORD"
AUTH_ENV_BEARER = "PK_AUTH_BEARER"
AUTH_ENV_COOKIE = "PK_AUTH_COOKIE"
AUTH_ENV_HEADER = "PK_AUTH_HEADER"
AUTH_ENV_HEADER_VALUE = "PK_AUTH_HEADER_VALUE"


@dataclass
class AfWiredHints:
    """Извлечённые из манифеста подсказки для генерации AF."""

    openapi_url: Optional[str] = None
    openapi_file: Optional[str] = None
    openapi_inline_note: Optional[str] = None
    extra_include_paths: List[str] = field(default_factory=list)
    gui_seed_urls: List[str] = field(default_factory=list)
    auth_type: str = _NONE
    auth_details: Dict[str, Any] = field(default_factory=dict)
    use_replacer_auth: bool = False
    replacer_rules: List[Dict[str, str]] = field(default_factory=list)
    auth_skip_note: Optional[str] = None


def profile_for_scan_policy(scan_policy: Optional[str]) -> str:
    key = (scan_policy or "custom_policy").strip()
    return POLICY_TO_PROFILE.get(key, "smoke")


def _yaml_str(value: str) -> str:
    """Простой scalar: quote если есть спецсимволы."""
    text = str(value)
    if text == "" or any(
        c in text
        for c in (
            ":",
            "#",
            "{",
            "}",
            "[",
            "]",
            ",",
            "&",
            "*",
            "?",
            "|",
            ">",
            "<",
            "=",
            "!",
            "%",
            "@",
            "`",
            "\n",
            "'",
            '"',
        )
    ):
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def _detail(details: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        val = details.get(key)
        if val is not None and str(val).strip() != "":
            return str(val).strip()
    return ""


def _split_url_list(raw: str) -> List[str]:
    out: List[str] = []
    for line in str(raw or "").replace(",", "\n").splitlines():
        token = line.strip()
        if token:
            out.append(token)
    return out


def _parse_openapi_spec(raw: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    scan_schema → (apiUrl, apiFile, inline_note).
    Inline JSON/YAML без пути — только честная заметка, job не генерируем вслепую.
    """
    text = (raw or "").strip()
    if not text:
        return None, None, None
    lower = text.lower()
    if lower.startswith("http://") or lower.startswith("https://"):
        return text, None, None
    if text.startswith("{") or text.startswith("openapi:") or text.startswith("---"):
        return (
            None,
            None,
            "inline OpenAPI spec в манифесте — сохраните в файл и укажите путь/URL",
        )
    if any(text.endswith(ext) for ext in (".json", ".yaml", ".yml")) or "/" in text or "\\" in text:
        return None, text, None
    return None, None, f"не распознан формат OpenAPI spec: {text[:40]!r}…"


def _extra_include_paths_from_csv(domains_csv: str, base_url: str) -> List[str]:
    """allowed_extra_domains → доп. includePaths (reuse regex-логики адаптера)."""
    from adapters.zap_adapter import ZapAdapter

    paths = list(ZapAdapter.domains_csv_to_include_regexes(domains_csv))
    if not paths and base_url:
        return []
    return paths


def _replacer_hint(
    hints: AfWiredHints,
    *,
    description: str,
    match_string: str,
    replacement: str,
) -> AfWiredHints:
    hints.use_replacer_auth = True
    hints.replacer_rules.append(
        {
            "description": description,
            "matchType": "REQ_HEADER",
            "matchString": match_string,
            "replacement": replacement,
        }
    )
    return hints


def _is_browser_auth_kind(kind: str) -> bool:
    return (
        kind in (_SSO, _FORM)
        or "SSO" in kind
        or "форм" in kind.lower()
        or "Form" in kind
    )


def _auth_hints_replacer(
    kind: str, details: Mapping[str, Any], hints: AfWiredHints
) -> Optional[AfWiredHints]:
    if kind == _BEARER:
        return _replacer_hint(
            hints,
            description="pk-auth-bearer",
            match_string="Authorization",
            replacement=f"Bearer ${{{AUTH_ENV_BEARER}}}",
        )
    if kind == _API_COOKIE:
        header = _detail(details, "Заголовок", "header") or "X-API-Key"
        return _replacer_hint(
            hints,
            description="pk-auth-header",
            match_string=header,
            replacement=f"${{{AUTH_ENV_HEADER_VALUE}}}",
        )
    if kind == _WEB_COOKIE:
        return _replacer_hint(
            hints,
            description="pk-auth-cookie",
            match_string="Cookie",
            replacement=f"${{{AUTH_ENV_COOKIE}}}",
        )
    return None


def _auth_hints(
    auth_type: Optional[str],
    auth_details: Optional[Mapping[str, Any]],
    base_url: str,
) -> AfWiredHints:
    hints = AfWiredHints()
    kind = (auth_type or "").strip() or _NONE
    hints.auth_type = kind
    hints.auth_details = dict(auth_details or {})
    if kind in (_NONE, ""):
        return hints

    details = hints.auth_details
    if kind == _BASIC:
        if not _detail(details, "Логин", "login", "username"):
            hints.auth_skip_note = "Basic: пустой Логин — auth в env пропущен"
        return hints
    replacer = _auth_hints_replacer(kind, details, hints)
    if replacer is not None:
        return replacer
    if _is_browser_auth_kind(kind):
        login_url = _detail(
            details, "URL входа", "login_url", "loginPageUrl", "login_page_url"
        )
        if not login_url and base_url:
            login_url = base_url.rstrip("/") + "/login"
        if not login_url:
            hints.auth_skip_note = (
                f"{kind}: нет URL входа — auth в AF env пропущен (Honest Contract)"
            )
        return hints

    hints.auth_skip_note = (
        f"auth_type={kind!r}: AF env auth не сгенерирован — настройте вручную или "
        "ZAP ПрименитьAuth"
    )
    return hints


def _scan_urls_from_wired(wired: Mapping[str, Any]) -> tuple[str, str]:
    infra = wired.get("infrastructure") or {}
    if not isinstance(infra, Mapping):
        infra = {}
    sec = wired.get("security_configuration") or {}
    if not isinstance(sec, Mapping):
        sec = {}
    base_url = str(infra.get("base_url_override") or sec.get("base_url_override") or "").strip()
    allowed = str(
        infra.get("allowed_extra_domains") or sec.get("allowed_extra_domains") or ""
    ).strip()
    return base_url, allowed


def hints_from_wired(wired: Mapping[str, Any]) -> AfWiredHints:
    sec = wired.get("security_configuration") or {}
    if not isinstance(sec, Mapping):
        sec = {}
    base_url, allowed = _scan_urls_from_wired(wired)

    hints = _auth_hints(
        str(sec.get("auth_type") or _NONE),
        sec.get("auth_details") if isinstance(sec.get("auth_details"), Mapping) else {},
        base_url,
    )
    hints.extra_include_paths = _extra_include_paths_from_csv(allowed, base_url)

    oas = wired.get("openapi_swagger_scanning") or {}
    if isinstance(oas, Mapping):
        url, file_path, note = _parse_openapi_spec(str(oas.get("scan_schema") or ""))
        hints.openapi_url = url
        hints.openapi_file = file_path
        hints.openapi_inline_note = note

    gui = wired.get("gui_elements_scanning") or {}
    if isinstance(gui, Mapping):
        hints.gui_seed_urls = _split_url_list(str(gui.get("scan_targets") or ""))

    return hints


def _use_client_spider(profile: str, hints: AfWiredHints) -> bool:
    # app_architecture снята со схемы — Client Spider только на crawler-профиле.
    _ = hints
    return profile == "crawler"


def _basic_auth_context_lines(details: Mapping[str, Any], base_url: str) -> List[str]:
    host = _detail(details, "Хост", "hostname", "host")
    realm = _detail(details, "Realm", "realm")
    port = _detail(details, "Порт", "port")
    if not host and base_url:
        parsed = urlparse(base_url)
        host = parsed.hostname or ""
        port = port or (str(parsed.port) if parsed.port else "")
        if not port:
            port = "443" if parsed.scheme == "https" else "80"
    if not host:
        return []
    return [
        "      authentication:",
        "        method: http",
        "        parameters:",
        f"          hostname: {_yaml_str(host)}",
        f"          port: {port or '80'}",
        f"          realm: {_yaml_str(realm)}",
        "      sessionManagement:",
        "        method: cookie",
        "      users:",
        "        - name: pk_user",
        "          credentials:",
        f"            username: ${{{AUTH_ENV_USERNAME}}}",
        f"            password: ${{{AUTH_ENV_PASSWORD}}}",
    ]


def _browser_auth_context_lines(details: Mapping[str, Any], base_url: str) -> List[str]:
    login_url = _detail(
        details, "URL входа", "login_url", "loginPageUrl", "login_page_url"
    )
    if not login_url and base_url:
        login_url = base_url.rstrip("/") + "/login"
    if not login_url:
        return []
    browser_id = (
        _detail(details, "BrowserId", "browser_id", "browserId") or "firefox-headless"
    )
    wait_s = _detail(details, "Ожидание", "login_page_wait", "loginPageWait") or "5"
    lines = [
        "      authentication:",
        "        method: browser",
        "        parameters:",
        f"          loginPageUrl: {_yaml_str(login_url)}",
        f"          browserId: {_yaml_str(browser_id)}",
        f"          loginPageWait: {wait_s}",
        "        verification:",
        "          method: autodetect",
        "      sessionManagement:",
        "        method: autodetect",
    ]
    login = _detail(details, "Логин", "login", "username")
    if login:
        lines.extend(
            [
                "      users:",
                "        - name: pk_user",
                "          credentials:",
                f"            username: ${{{AUTH_ENV_USERNAME}}}",
                f"            password: ${{{AUTH_ENV_PASSWORD}}}",
            ]
        )
    return lines


def _form_auth_context_lines(details: Mapping[str, Any]) -> List[str]:
    login_page = _detail(details, "loginPageUrl", "URL входа", "login_url")
    login_req = _detail(details, "loginRequestUrl", "login_request_url")
    login_body = _detail(details, "loginRequestBody", "login_request_body")
    if not (login_page and login_req):
        return []
    lines = [
        "      authentication:",
        "        method: form",
        "        parameters:",
        f"          loginPageUrl: {_yaml_str(login_page)}",
        f"          loginRequestUrl: {_yaml_str(login_req)}",
    ]
    if login_body:
        lines.append(f"          loginRequestBody: {_yaml_str(login_body)}")
    lines.extend(
        [
            "      sessionManagement:",
            "        method: cookie",
            "      users:",
            "        - name: pk_user",
            "          credentials:",
            f"            username: ${{{AUTH_ENV_USERNAME}}}",
            f"            password: ${{{AUTH_ENV_PASSWORD}}}",
        ]
    )
    return lines


def _auth_context_lines(hints: AfWiredHints, base_url: str) -> List[str]:
    """Строки authentication / users / sessionManagement внутри context."""
    kind = hints.auth_type
    if kind in (_NONE, "") or hints.auth_skip_note:
        return []
    details = hints.auth_details

    if kind == _BASIC:
        return _basic_auth_context_lines(details, base_url)

    if kind in (_SSO, _FORM) or "SSO" in kind or "форм" in kind.lower() or "Form" in kind:
        return _browser_auth_context_lines(details, base_url)

    if kind == _FORM or "form" in kind.lower():
        return _form_auth_context_lines(details)

    return []


def _env_vars_lines(hints: AfWiredHints) -> List[str]:
    """env.vars — placeholders для секретов (значения из системного env при runPlan)."""
    kind = hints.auth_type
    if kind in (_NONE, ""):
        return ["  vars: {}"]
    placeholders: Dict[str, str] = {}
    if kind == _BASIC or kind in (_SSO, _FORM) or "форм" in kind.lower():
        placeholders[AUTH_ENV_USERNAME] = ""
        placeholders[AUTH_ENV_PASSWORD] = ""
    if kind == _BEARER:
        placeholders[AUTH_ENV_BEARER] = ""
    if kind == _WEB_COOKIE:
        placeholders[AUTH_ENV_COOKIE] = ""
    if kind == _API_COOKIE:
        header = _detail(hints.auth_details, "Заголовок", "header") or "X-API-Key"
        placeholders[AUTH_ENV_HEADER] = header
        placeholders[AUTH_ENV_HEADER_VALUE] = ""
    if not placeholders:
        return ["  vars: {}"]
    lines = ["  vars:"]
    for key in sorted(placeholders):
        val = placeholders[key]
        if val:
            lines.append(f"    {key}: {_yaml_str(val)}")
        else:
            lines.append(f"    {key}: \"\"")
    return lines


def _af_header_comments(
    profile: str, scan_policy: str, hints: AfWiredHints
) -> List[str]:
    lines = [
        f"# ZAP AF plan — profile={profile} scan_policy={scan_policy}",
        "# Generated by PrettyK gen_af_plan / generate_automation_plan (no autorun).",
    ]
    if hints.openapi_inline_note:
        lines.append(f"# OpenAPI: {hints.openapi_inline_note}")
    if hints.auth_skip_note:
        lines.append(f"# Auth: {hints.auth_skip_note}")
    if hints.use_replacer_auth:
        lines.append(
            "# Auth header/cookie — replacer job + системные env "
            f"({AUTH_ENV_BEARER}/{AUTH_ENV_COOKIE}/…); не коммитьте секреты в YAML."
        )
    return lines


def _af_env_block(ctx: str, url: str, hints: AfWiredHints) -> List[str]:
    include = url + ".*"
    lines = [
        "env:",
        "  contexts:",
        f"    - name: {_yaml_str(ctx)}",
        "      urls:",
        f"        - {_yaml_str(url)}",
        "      includePaths:",
    ]
    for path in [include] + list(hints.extra_include_paths):
        lines.append(f"        - {_yaml_str(path)}")
    lines.append("      excludePaths: []")
    auth_lines = _auth_context_lines(hints, url)
    if auth_lines:
        lines.extend(auth_lines)
    lines.extend(
        [
            "  parameters:",
            "    failOnError: true",
            "    failOnWarning: false",
            "    progressToStdout: true",
        ]
    )
    lines.extend(_env_vars_lines(hints))
    return lines


def _af_setup_jobs(
    ctx: str,
    url: str,
    hints: AfWiredHints,
    *,
    include_alert_filter_job: bool,
    alert_filter_rules: Optional[Sequence[Mapping[str, Any]]] = None,
) -> List[str]:
    lines = [
        "jobs:",
        "  - type: passiveScan-config",
        "    parameters:",
        "      maxAlertsPerRule: 10",
        "      scanOnlyInScope: true",
    ]
    if include_alert_filter_job:
        if alert_filter_rules:
            lines.extend(
                [
                    "  - type: alertFilter",
                    "    parameters:",
                    "      alertFilters:",
                ]
            )
            for rule in alert_filter_rules:
                rule_id = str(rule.get("rule_id", "")).strip()
                new_risk = str(rule.get("newRisk", "False Positive")).strip()
                if rule_id:
                    lines.append(
                        f"        - ruleId: {_yaml_str(rule_id)}"
                    )
                    lines.append(f"          newRisk: {_yaml_str(newRisk)}")
        else:
            lines.extend(["  - type: alertFilter", "    parameters: {}"])
    if hints.use_replacer_auth:
        for rule in hints.replacer_rules:
            lines.extend(
                [
                    "  - type: replacer",
                    "    parameters:",
                    "      rules:",
                    "        - description: "
                    + _yaml_str(rule.get("description", "pk-auth")),
                    "          enabled: true",
                    f"          matchType: {rule.get('matchType', 'REQ_HEADER')}",
                    f"          matchString: {_yaml_str(rule.get('matchString', ''))}",
                    f"          replacement: {_yaml_str(rule.get('replacement', ''))}",
                ]
            )
    if hints.openapi_url or hints.openapi_file:
        lines.extend(
            ["  - type: openapi", "    parameters:", f"      context: {_yaml_str(ctx)}"]
        )
        if hints.openapi_url:
            lines.append(f"      apiUrl: {_yaml_str(hints.openapi_url)}")
        if hints.openapi_file:
            lines.append(f"      apiFile: {_yaml_str(hints.openapi_file)}")
        lines.append(f"      targetUrl: {_yaml_str(url)}")
    if hints.gui_seed_urls:
        lines.extend(["  - type: requestor", "    parameters:", "      requests:"])
        for seed_url in hints.gui_seed_urls[:20]:
            lines.append(f"        - url: {_yaml_str(seed_url)}")
            lines.append("          method: GET")
    return lines


def _af_report_jobs(
    profile: str,
    report_file: str,
    report_template: str,
    *,
    include_sarif_report: bool,
) -> List[str]:
    template_id = normalize_report_template(report_template)
    lines = [
        "  - type: report",
        "    parameters:",
        f"      template: {template_id}",
        "      reportDir: reports/scanner-results",
        f"      reportFile: {_yaml_str(report_file)}",
        f"      reportDescription: PrettyK AF {profile}",
    ]
    if include_sarif_report and template_id != "sarif-json":
        lines.extend(
            [
                "  - type: report",
                "    parameters:",
                "      template: sarif-json",
                "      reportDir: reports/scanner-results",
                f"      reportFile: {_yaml_str(report_file + '-sarif')}",
                f"      reportDescription: PK AF {profile} SARIF",
            ]
        )
    return lines


def build_af_plan(
    *,
    base_url: str,
    context_name: str = DEFAULT_CONTEXT,
    scan_policy: str = "custom_policy",
    report_file: str = "pk-af-plan",
    report_template: str = "traditional-html",
    include_sarif_report: bool = False,
    include_alert_filter_job: bool = False,
    alert_filter_rules: Optional[Sequence[Mapping[str, Any]]] = None,
    logout_avoidance: bool = True,
    har_sequence_name: Optional[str] = None,
    hints: Optional[AfWiredHints] = None,
) -> str:
    """
    Собрать YAML AF как текст.

    Profiles:
      smoke    — spider + ajax [+ spiderClient if SPA] + passive-wait + active short + report
      crawler  — spider + ajax [+ spiderClient] + passive-wait + report (без active)
      active   — spider short + passive-wait + active + report
      api      — openapi (if present) + spider shallow + passive-wait + active short + report
    """
    url = (base_url or "").strip().rstrip("/")
    if not url:
        raise ValueError("base_url пуст — нужен security_configuration.base_url_override")
    ctx = (context_name or DEFAULT_CONTEXT).strip() or DEFAULT_CONTEXT
    profile = profile_for_scan_policy(scan_policy)
    wired_hints = hints or AfWiredHints()
    use_client = _use_client_spider(profile, wired_hints)

    lines: List[str] = []
    lines.extend(_af_header_comments(profile, scan_policy, wired_hints))
    lines.extend(_af_env_block(ctx, url, wired_hints))
    lines.extend(
        _af_setup_jobs(
            ctx, url, wired_hints, include_alert_filter_job=include_alert_filter_job,
            alert_filter_rules=alert_filter_rules,
        )
    )
    lines.extend(
        _jobs_for_profile(
            profile,
            ctx,
            url,
            use_client_spider=use_client,
            logout_avoidance=logout_avoidance,
            depth_spec=depth_spec_for_profile(profile),
            har_sequence_name=har_sequence_name,
        )
    )
    lines.extend(
        _af_report_jobs(
            profile,
            report_file,
            report_template,
            include_sarif_report=include_sarif_report,
        )
    )
    lines.append("")
    return "\n".join(lines)


def _logout_avoidance_lines(enabled: bool) -> List[str]:
    if not enabled:
        return []
    return ["      logoutAvoidance: true"]


def _active_scan_policy_job(depth_spec: Dict[str, Any]) -> List[str]:
    """G-49: activeScan-policy job перед activeScan."""
    name = _yaml_str(depth_spec["policy_name"])
    strength = depth_spec["defaultStrength"]
    threshold = depth_spec["defaultThreshold"]
    return [
        "  - type: activeScan-policy",
        "    parameters:",
        f"      name: {name}",
        "    policyDefinition:",
        f"      defaultStrength: {strength}",
        f"      defaultThreshold: {threshold}",
    ]


def _active_scan_job_lines(
    ctx: str,
    depth_spec: Optional[Dict[str, Any]],
    *,
    fallback_rule_mins: int,
    fallback_scan_mins: int,
) -> List[str]:
    c = _yaml_str(ctx)
    rule_mins = fallback_rule_mins
    scan_mins = fallback_scan_mins
    policy_line: List[str] = []
    if depth_spec:
        rule_mins = int(depth_spec.get("maxRuleDurationInMins", rule_mins))
        scan_mins = int(depth_spec.get("maxScanDurationInMins", scan_mins))
        policy_line = [f"      policy: {_yaml_str(depth_spec['policy_name'])}"]
    lines = [
        "  - type: activeScan",
        "    parameters:",
        f"      context: {c}",
        f"      maxRuleDurationInMins: {rule_mins}",
        f"      maxScanDurationInMins: {scan_mins}",
    ]
    if policy_line:
        lines.extend(policy_line)
    return lines


def _sequence_active_scan_job(
    ctx: str,
    sequence_name: str,
    *,
    policy: str = "Sequence",
) -> List[str]:
    """G-47: AF sequence-activeScan после HAR import (имя sequence = name из import)."""
    return [
        "  - type: sequence-activeScan",
        "    parameters:",
        f"      sequence: {_yaml_str(sequence_name)}",
        f"      context: {_yaml_str(ctx)}",
        f"      policy: {_yaml_str(policy)}",
    ]


def _jobs_for_profile(
    profile: str,
    ctx: str,
    url: str,
    *,
    use_client_spider: bool = False,
    logout_avoidance: bool = True,
    depth_spec: Optional[Dict[str, Any]] = None,
    har_sequence_name: Optional[str] = None,
) -> List[str]:
    c = _yaml_str(ctx)
    u = _yaml_str(url)
    logout_lines = _logout_avoidance_lines(logout_avoidance)
    client_job: List[str] = []
    if use_client_spider:
        client_job = [
            "  - type: spiderClient",
            "    parameters:",
            f"      context: {c}",
            f"      url: {u}",
            "      maxDuration: 3",
            "      maxCrawlDepth: 5",
            "      browserId: firefox-headless",
        ]

    if profile == "crawler":
        out = [
            "  - type: spider",
            "    parameters:",
            f"      context: {c}",
            f"      url: {u}",
            "      maxDuration: 5",
            "      maxDepth: 10",
            *logout_lines,
            "  - type: spiderAjax",
            "    parameters:",
            f"      context: {c}",
            f"      url: {u}",
            "      maxDuration: 5",
            "      inScopeOnly: true",
            *logout_lines,
        ]
        out.extend(client_job)
        out.extend(
            [
                "  - type: passiveScan-wait",
                "    parameters:",
                "      maxDuration: 3",
            ]
        )
        if har_sequence_name:
            out.extend(_sequence_active_scan_job(ctx, har_sequence_name))
        return out
    if profile == "active":
        out = [
            "  - type: spider",
            "    parameters:",
            f"      context: {c}",
            f"      url: {u}",
            "      maxDuration: 2",
            "      maxDepth: 5",
            *logout_lines,
            "  - type: passiveScan-wait",
            "    parameters:",
            "      maxDuration: 2",
        ]
        if depth_spec:
            out.extend(_active_scan_policy_job(depth_spec))
        out.extend(
            _active_scan_job_lines(ctx, depth_spec, fallback_rule_mins=2, fallback_scan_mins=5)
        )
        if har_sequence_name:
            out.extend(_sequence_active_scan_job(ctx, har_sequence_name))
        return out
    if profile == "api":
        out = [
            "  - type: spider",
            "    parameters:",
            f"      context: {c}",
            f"      url: {u}",
            "      maxDuration: 1",
            "      maxDepth: 2",
            *logout_lines,
            "  - type: passiveScan-wait",
            "    parameters:",
            "      maxDuration: 2",
        ]
        if depth_spec:
            out.extend(_active_scan_policy_job(depth_spec))
        out.extend(
            _active_scan_job_lines(ctx, depth_spec, fallback_rule_mins=1, fallback_scan_mins=3)
        )
        if har_sequence_name:
            out.extend(_sequence_active_scan_job(ctx, har_sequence_name))
        return out
    # smoke (default)
    out = [
        "  - type: spider",
        "    parameters:",
        f"      context: {c}",
        f"      url: {u}",
        "      maxDuration: 2",
        "      maxDepth: 5",
        *logout_lines,
        "  - type: spiderAjax",
        "    parameters:",
        f"      context: {c}",
        f"      url: {u}",
        "      maxDuration: 2",
        "      inScopeOnly: true",
        *logout_lines,
    ]
    out.extend(client_job)
    out.extend(
        [
            "  - type: passiveScan-wait",
            "    parameters:",
            "      maxDuration: 2",
        ]
    )
    if depth_spec:
        out.extend(_active_scan_policy_job(depth_spec))
    out.extend(
        _active_scan_job_lines(ctx, depth_spec, fallback_rule_mins=1, fallback_scan_mins=3)
    )
    if har_sequence_name:
        out.extend(_sequence_active_scan_job(ctx, har_sequence_name))
    return out


def plan_from_wired_dict(
    wired: Mapping[str, Any],
    *,
    context_name: str = DEFAULT_CONTEXT,
    report_file: str = "pk-af-plan",
) -> str:
    sec = wired.get("security_configuration") or {}
    if not isinstance(sec, Mapping):
        raise ValueError("security_configuration отсутствует или не объект")
    base_url, _allowed = _scan_urls_from_wired(wired)
    scan_policy = str(sec.get("scan_policy") or "custom_policy")
    hints = hints_from_wired(wired)
    return build_af_plan(
        base_url=base_url,
        context_name=context_name,
        scan_policy=scan_policy,
        report_file=report_file,
        hints=hints,
    )


def write_af_plan(
    output_path: Union[str, Path],
    *,
    base_url: str,
    context_name: str = DEFAULT_CONTEXT,
    scan_policy: str = "custom_policy",
    report_file: str = "pk-af-plan",
    wired: Optional[Mapping[str, Any]] = None,
) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if wired is not None:
        text = plan_from_wired_dict(
            wired,
            context_name=context_name,
            report_file=report_file or path.stem,
        )
    else:
        text = build_af_plan(
            base_url=base_url,
            context_name=context_name,
            scan_policy=scan_policy,
            report_file=report_file or path.stem,
        )
    path.write_text(text, encoding="utf-8")
    return path.resolve()


def safe_context_name(raw: str) -> str:
    name = re.sub(r"[^\w\-]+", "_", (raw or "").strip())[:64]
    return name or DEFAULT_CONTEXT
