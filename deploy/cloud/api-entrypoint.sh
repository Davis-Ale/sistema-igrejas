#!/bin/sh
set -eu

test -n "${APP_DIR:-}"
test -n "${JWT_SECRET:-}"
test -n "${DATABASE_URL:-}"
test -n "${REDIS_URL:-}"
test -n "${API_PUBLIC_HOST:-}"

case "${API_PUBLIC_HOST}" in
  *trycloudflare*|*cfargotunnel*|*railway*|*localhost*|*[/:]* )
    echo API_PUBLIC_HOST_NOT_FIXED_HTTPS >&2
    exit 1
    ;;
esac

case "${EVENTS_TEST_PAYMENT_MODE:-}" in
  auto|pending)
    echo PAYMENT_TEST_MODE_FORBIDDEN >&2
    exit 1
    ;;
esac

if [ "${POSTGRES_PASSWORD:-}" = "postgres" ]; then
  echo POSTGRES_PASSWORD_NOT_COMMERCIAL >&2
  exit 1
fi

case "${POSTGRES_PASSWORD:-}" in
  *[:@/?#]*)
    echo POSTGRES_PASSWORD_UNSAFE_FOR_URL >&2
    exit 1
    ;;
esac

case "${CHECKOUT_REDIS_RUNTIME_PASSWORD:-}" in
  *[:@/?#]*)
    echo REDIS_PASSWORD_UNSAFE_FOR_URL >&2
    exit 1
    ;;
esac

cd "/app/apps/${APP_DIR}"
exec pnpm exec tsx src/server.ts
