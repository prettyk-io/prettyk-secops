import os

__all__ = ["pk_env", "pk_env_flag", "pk_env_int", "pk_env_name"]


def pk_env(name: str, default: str = "") -> str:
    """PK_{name} env. SCN-R2: read PK_SCANNER_*, fallback to PK_scanner_*.

    Например pk_env("SCANNER_MODE") читает PK_SCANNER_MODE,
    при пустом — PK_scanner_MODE (обратная совместимость).
    """
    new_key = f"PK_{name}"
    result = os.environ.get(new_key)
    if result is not None:
        return result
    # read-both fallback: PK_SCANNER_* → PK_scanner_*
    if name.startswith("SCANNER_"):
        old_name = "scanner" + name[7:]  # SCANNER_MODE → scanner_MODE
        old_key = f"PK_{old_name}"
        return os.environ.get(old_key, default)
    return default


def pk_env_name(name: str, default: str = "") -> str:
    """PK_* for a name.

    ``pk_env_name("PK_GATE_SEVERITY")`` → ``PK_GATE_SEVERITY``.
    """
    base = name[3:] if name.startswith("PK_") else name
    return os.environ.get(f"PK_{base}", default)


def pk_env_flag(name: str, default: str = "1") -> bool:
    """PK_{name}=1|true|yes → bool."""
    raw = pk_env(name, default).strip().lower()
    return raw in {"1", "true", "yes", "y", "on"}


def pk_env_int(name: str, default: str = "0") -> int:
    """PK_{name} → int."""
    return int(pk_env(name, default).strip() or default)