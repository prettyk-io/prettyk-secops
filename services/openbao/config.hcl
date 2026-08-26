# OpenBao Server Configuration
# CANON: sanctuary/pure/infra-stack.md
#
# Режим: dev (single node, in-memory storage — для разработки).
# Production: использовать integrated storage (raft) + TLS.

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

# API: отключаем ml_block на dev (не нужен)
api_addr = "http://0.0.0.0:8200"
cluster_addr = "http://0.0.0.0:8201"

disable_mlock = false
ui = true
log_level = "info"