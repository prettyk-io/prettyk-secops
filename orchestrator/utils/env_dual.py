import os

__all__ = ["pk_env", "pk_env_flag", "pk_env_int"]


def pk_env(name: str, default: str = "") -> str:
    """PK_{name} with KDT_{name} fallback."""
    return os.environ.get(f"PK_{name}") or os.environ.get(f"KDT_{name}", default)


def pk_env_flag(name: str, default: str = "1") -> bool:
    """PK_{name}=1|true|yes or KDT_{name} fallback → bool."""
    raw = pk_env(name, default).strip().lower()
    return raw in {"1", "true", "yes", "y", "on"}


def pk_env_int(name: str, default: str = "0") -> int:
    """PK_{name} or KDT_{name} fallback → int."""
    return int(pk_env(name, default).strip() or default)