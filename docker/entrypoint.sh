#!/usr/bin/env bash
# Entrypoint — เตรียมฐานข้อมูลให้พร้อมก่อนสตาร์ตแอป (v1 test deploy)
# ทำงานทุกครั้งที่ container เริ่ม แต่ทุกขั้นเป็น idempotent:
#   1) prisma migrate deploy  — สร้าง/อัปเดตตารางตาม migration (รวม PostGIS extension)
#   2) seed master data       — เฉพาะเมื่อ SEED_ON_START=true (ปลอดภัยเพราะ seed เป็น upsert)
# แล้วจึง exec คำสั่งจริง (CMD = npm run start)
set -euo pipefail

echo "[entrypoint] prisma migrate deploy ..."
npx prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] seeding master data (idempotent) ..."
  npm run db:seed
fi

echo "[entrypoint] starting: $*"
exec "$@"
