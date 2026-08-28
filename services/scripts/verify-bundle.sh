#!/usr/bin/env bash
# PrettyK Pure — integrity check for airgap bundle.
#
# Сверяет sha256 контрольные суммы всех файлов с checksums.sha256.
# Запускать на целевой машине ПЕРЕД install.sh.
#
#   ./scripts/verify-bundle.sh
#
# Выход: 0 — целостность подтверждена; 1 — расхождение или ошибка.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKSUM_FILE="$BUNDLE_ROOT/checksums.sha256"

if [ ! -f "$CHECKSUM_FILE" ]; then
    echo "FAIL: checksums.sha256 not found in bundle root"
    exit 1
fi

cd "$BUNDLE_ROOT"

echo "=== PrettyK Pure Bundle Integrity Check ==="

FAIL_COUNT=0
MATCH_COUNT=0

while IFS= read -r line; do
    # Пропустить пустые строки.
    [ -z "$line" ] && continue

    expected_hash="${line:0:64}"
    expected_path="${line:66}"

    if [ ! -f "$expected_path" ]; then
        echo "MISSING: $expected_path"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi

    if command -v sha256sum >/dev/null 2>&1; then
        actual_hash=$(sha256sum "$expected_path" | cut -d' ' -f1)
    elif command -v shasum >/dev/null 2>&1; then
        actual_hash=$(shasum -a 256 "$expected_path" | cut -d' ' -f1)
    else
        echo "ERROR: neither sha256sum nor shasum found"
        exit 1
    fi

    if [ "$expected_hash" = "$actual_hash" ]; then
        MATCH_COUNT=$((MATCH_COUNT + 1))
    else
        echo "MISMATCH: $expected_path (expected $expected_hash, got $actual_hash)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done < "$CHECKSUM_FILE"

echo "---"
echo "Matched: $MATCH_COUNT  Failed: $FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi

echo "=== integrity OK ==="