#!/bin/sh
set -e

echo "[keystone] applying database migrations..."
bunx prisma migrate deploy

echo "[keystone] starting Next.js on port ${PORT:-3000}..."
exec "$@"
