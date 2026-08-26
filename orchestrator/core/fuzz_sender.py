# -*- coding: utf-8 -*-
"""Генерация HttpSender: маска в запросе → значение ScriptVars.

Не UI Fuzzer ZAP. Скрипт в daemon подменяет mask на global ScriptVar
в sendingRequest. Цикл пейлоадов — снаружи (ДляКаждого / ПейлоадПодмены).
"""
from __future__ import annotations

DEFAULT_VAR_KEY = "fuzz_payload"


def _js_string(value: str) -> str:
    """Экранирование в двойные кавычки JS (Graal.js)."""
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    return f'"{escaped}"'


def render_mask_httpsender(
    mask: str,
    var_key: str = DEFAULT_VAR_KEY,
) -> str:
    """Graal.js httpsender: mask в URI/body/headers → ScriptVars[var_key]."""
    if not isinstance(mask, str) or not mask:
        raise ValueError("mask: нужна непустая строка-маркер подмены")
    key = (var_key or DEFAULT_VAR_KEY).strip() or DEFAULT_VAR_KEY
    mask_lit = _js_string(mask)
    key_lit = _js_string(key)
    return f"""// mask → ScriptVars (httpsender)
var MASK = {mask_lit};
var VAR_KEY = {key_lit};

function replaceAll(text, from, to) {{
	if (text === null || text === undefined) {{
		return text;
	}}
	var s = String(text);
	if (from === "" || s.indexOf(from) === -1) {{
		return s;
	}}
	return s.split(from).join(to);
}}

function sendingRequest(msg, initiator, helper) {{
	var payload = org.zaproxy.zap.extension.script.ScriptVars.getGlobalVar(VAR_KEY);
	if (payload === null || payload === undefined) {{
		return;
	}}
	payload = String(payload);

	var uri = msg.getRequestHeader().getURI().toString();
	if (uri.indexOf(MASK) !== -1) {{
		var newUri = replaceAll(uri, MASK, payload);
		msg.getRequestHeader().setURI(
			new org.apache.commons.httpclient.URI(newUri, false)
		);
	}}

	var body = msg.getRequestBody().toString();
	if (body.indexOf(MASK) !== -1) {{
		var newBody = replaceAll(body, MASK, payload);
		msg.setRequestBody(newBody);
		msg.getRequestHeader().setContentLength(msg.getRequestBody().length());
	}}

	var headers = msg.getRequestHeader().getHeaders();
	if (headers !== null) {{
		for (var i = 0; i < headers.size(); i++) {{
			var h = headers.get(i);
			var name = h.getName();
			var value = h.getValue();
			if (value !== null && String(value).indexOf(MASK) !== -1) {{
				msg.getRequestHeader().setHeader(
					name,
					replaceAll(String(value), MASK, payload)
				);
			}}
		}}
	}}
}}

function responseReceived(msg, initiator, helper) {{
}}
"""
