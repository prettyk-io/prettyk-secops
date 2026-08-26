#!/bin/bash
# AUTH-PROD-2: OpenBao secrets bootstrap.
#
# Запуск: docker exec -it prettyk-openbao sh /vault/config/init-secrets.sh
# Или через docker compose после старта.
set -e

VAULT_ADDR="http://127.0.0.1:8200"
VAULT_TOKEN="${VAULT_TOKEN:-prettyk-bao-root-dev}"

echo "==> Waiting for OpenBao..."
until curl -s -o /dev/null "${VAULT_ADDR}/v1/sys/health"; do
  sleep 2
done
echo "==> OpenBao is ready."

# Enable KV v2 secrets engine
curl -s -X POST \
  -H "X-Vault-Token: ${VAULT_TOKEN}" \
  -H "Content-Type: application/json" \
  "${VAULT_ADDR}/v1/sys/mounts/prettyk" \
  -d '{"type": "kv-v2", "options": {"version": "2"}}' || true

echo "==> KV v2 engine mounted at prettyk/"

# Store auth secrets
curl -s -X POST \
  -H "X-Vault-Token: ${VAULT_TOKEN}" \
  -H "Content-Type: application/json" \
  "${VAULT_ADDR}/v1/prettyk/data/auth" \
  -d '{
    "data": {
      "better_auth_secret": "changeme-better-auth-secret-replace-in-production",
      "session_key": "changeme-session-encryption-key-32bytes",
      "pg_user": "prettyk",
      "pg_password": "prettyk",
      "pg_db": "prettyk",
      "pg_url": "postgresql://prettyk:prettyk@prettyk-postgres:5432/prettyk",
      "admin_email": "admin@prettyk.io",
      "admin_password": "admin123!"
    }
  }' || true

echo "==> Secrets seeded at prettyk/auth"
echo "==> Done. Verify: curl -H 'X-Vault-Token: ${VAULT_TOKEN}' ${VAULT_ADDR}/v1/prettyk/data/auth | jq"