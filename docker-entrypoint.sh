#!/bin/sh
set -e

echo "[keystone] applying database migrations..."
(cd /migrator && bunx prisma migrate deploy)

echo "[keystone] starting Next.js on port ${PORT:-3000}..."
exec "$@"
