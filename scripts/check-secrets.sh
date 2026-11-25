#!/usr/bin/env bash
# Escáner de secretos sin dependencias externas (CI y local).
#   bash scripts/check-secrets.sh            → archivos trackeados actuales
#   bash scripts/check-secrets.sh --history  → además, todo el historial de Git
# Sale con código 1 si encuentra algo. Nunca imprime el secreto completo.
set -euo pipefail

FAIL=0
SCAN_HISTORY="${1:-}"

# JWT (Supabase anon/service_role), tokens de Mercado Pago, claves de Supabase,
# claves privadas y URLs de Postgres con contraseña embebida.
PATTERN='eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|APP_USR-[0-9]{6,}-[0-9]{6}-[0-9a-f]{20,}|TEST-[0-9]{10,}-[0-9]{6}-[0-9a-f]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]]+@'

redact() { sed -E 's/(eyJ[A-Za-z0-9_-]{4}|APP_USR-|TEST-|sb_secret_|:\/\/[^:]+:)[^"'"'"'[:space:]]*/\1…[REDACTED]/g' | cut -c1-200; }

echo "▶ 1/3 Archivos .env trackeados"
ENV_FILES=$(git ls-files | grep -E '(^|/)\.env($|\.)|\.env$' | grep -vE '(^|/)\.env\.example$' || true)
if [ -n "$ENV_FILES" ]; then
  echo "✖ Archivos de entorno versionados:"; echo "$ENV_FILES"; FAIL=1
else
  echo "✔ Ninguno"
fi

echo "▶ 2/3 Patrones de secretos en archivos trackeados"
HITS=$(git grep -nIE "$PATTERN" -- . ':!package-lock.json' ':!scripts/check-secrets.sh' || true)
if [ -n "$HITS" ]; then
  echo "✖ Posibles secretos:"; echo "$HITS" | redact; FAIL=1
else
  echo "✔ Sin coincidencias"
fi

if [ "$SCAN_HISTORY" = "--history" ]; then
  echo "▶ 3/3 Historial completo de Git"
  ENV_HIST=$(git log --all --pretty=format: --name-only | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' | sort -u || true)
  if [ -n "$ENV_HIST" ]; then
    echo "✖ Archivos .env presentes en el historial:"; echo "$ENV_HIST"; FAIL=1
  fi
  HIST_HITS=$(git log --all -p --no-color -- . ':!package-lock.json' ':!scripts/check-secrets.sh' | grep -nE "^\+.*($PATTERN)" || true)
  if [ -n "$HIST_HITS" ]; then
    echo "✖ Secretos en el historial:"; echo "$HIST_HITS" | redact; FAIL=1
  fi
  [ -z "$ENV_HIST$HIST_HITS" ] && echo "✔ Historial limpio"
else
  echo "▶ 3/3 Historial: omitido (usar --history)"
fi

exit $FAIL
