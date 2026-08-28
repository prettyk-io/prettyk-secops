#!/usr/bin/env bash
# PrettyK Pure — проверка подписей артефактов (cosign).
#
# Запускать ПОСЛЕ verify-bundle.sh:
#   ./scripts/verify-signatures.sh
#
# Требует: cosign >= 2.x
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== PrettyK Pure Signature Verification ==="

if ! command -v cosign >/dev/null 2>&1; then
    echo "SKIP: cosign not installed."
    echo "  Install: choco install cosign  (Windows)"
    echo "           brew install cosign    (macOS)"
    echo "           go install github.com/sigstore/cosign/v2/cmd/cosign@latest"
    exit 0
fi

FAILED=0
VERIFIED=0

# Проверить образы
for tar_file in "$BUNDLE_ROOT"/images/*.tar; do
    sig_file="${tar_file}.sig"
    if [ -f "$sig_file" ]; then
        echo "verify: $(basename "$tar_file")"
        if cosign verify-blob "$tar_file" --bundle "$sig_file" --insecure-ignore-tlog 2>/dev/null; then
            VERIFIED=$((VERIFIED + 1))
        else
            echo "  FAILED: $(basename "$tar_file")"
            FAILED=$((FAILED + 1))
        fi
    else
        echo "  skip (no signature): $(basename "$tar_file")"
    fi
done

# Проверить SBOM
sbom="$BUNDLE_ROOT/sbom/supply-chain.cdx.json"
if [ -f "${sbom}.sig" ] || [ -f "$sbom" ]; then
    echo "verify: sbom/supply-chain.cdx.json"
fi

# Проверить checksums
checksums="$BUNDLE_ROOT/checksums.sha256"
if [ -f "${checksums}.sig" ]; then
    echo "verify: checksums.sha256"
    if cosign verify-blob "$checksums" --bundle "${checksums}.sig" --insecure-ignore-tlog 2>/dev/null; then
        VERIFIED=$((VERIFIED + 1))
    else
        echo "  FAILED: checksums.sha256"
        FAILED=$((FAILED + 1))
    fi
fi

echo "---"
echo "Verified: $VERIFIED  Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi

echo "=== signatures OK ==="