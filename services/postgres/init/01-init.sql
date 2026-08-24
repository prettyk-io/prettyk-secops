-- PrettyK core schema v1. CANON: sanctuary/pure/infra-stack.md.
-- Выполняется при первом старте PostgreSQL.

BEGIN;

-- ═══════════════════════════════════════════════════
-- 1. Auth & Identity (Better Auth — завтра)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user',
    department  TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address  TEXT,
    user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);

CREATE TABLE IF NOT EXISTS user_capabilities (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability  TEXT NOT NULL,
    PRIMARY KEY (user_id, capability)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    key_prefix  TEXT NOT NULL,           -- pk_live_****
    key_hash    TEXT NOT NULL UNIQUE,    -- SHA-256
    scopes      JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);

-- ═══════════════════════════════════════════════════
-- 2. Checks Registry (бывший checks_registry.json)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS checks (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    check_kind  TEXT NOT NULL DEFAULT 'security',
    status      TEXT NOT NULL DEFAULT 'draft',
    target_url  TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata    JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
CREATE INDEX IF NOT EXISTS idx_checks_kind ON checks(check_kind);

-- ═══════════════════════════════════════════════════
-- 3. Runs (бывший runs_index.ndjson)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS runs (
    id          TEXT PRIMARY KEY,
    check_id    TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    run_dir     TEXT NOT NULL,
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    verdict     TEXT,
    metrics     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_check ON runs(check_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

-- ═══════════════════════════════════════════════════
-- 4. Seed: первый администратор (для dev)
-- ═══════════════════════════════════════════════════

INSERT INTO users (id, email, name, role, department) VALUES
    ('admin-001', 'admin@prettyk.local', 'Администратор', 'admin_sec', 'SecOps')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_capabilities (user_id, capability) VALUES
    ('admin-001', 'admin:access'),
    ('admin-001', 'control:access'),
    ('admin-001', 'checks:create'),
    ('admin-001', 'checks:import'),
    ('admin-001', 'checks:delete'),
    ('admin-001', 'fuzzer:execute'),
    ('admin-001', 'policies:manage'),
    ('admin-001', 'retention:clean'),
    ('admin-001', 'tokens:manage')
ON CONFLICT (user_id, capability) DO NOTHING;

COMMIT;