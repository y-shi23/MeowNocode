#!/bin/sh
set -e

DB_PATH="${SQLITE_DB_PATH:-/data/meownocode.db}"
DB_DIR="$(dirname "$DB_PATH")"

if [ ! -d "$DB_DIR" ]; then
  mkdir -p "$DB_DIR"
fi

if [ "$(id -u)" -eq 0 ]; then
  chown -R appuser:appgroup "$DB_DIR"
  exec su-exec appuser "$@"
fi

exec "$@"
