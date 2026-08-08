# SKL-FRIS — Production image (v1 test deploy)
# Build:  docker build -t <user>/skl-fris:v1 .
# ใช้ base เดียวกันทั้ง build/run เพื่อให้ Prisma engine (glibc/openssl) ตรงกัน
# ใช้ bookworm-slim (glibc) แทน alpine (musl) — เสถียรกว่ากับ Prisma 5

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV TZ=Asia/Bangkok
# openssl จำเป็นต่อ Prisma engine · ca-certificates สำหรับ TLS ตอน build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && ln -snf /usr/share/zoneinfo/Asia/Bangkok /etc/localtime \
  && echo "Asia/Bangkok" > /etc/timezone

# ติดตั้ง dependency ก่อน (cache layer) — ต้องได้ devDependencies ครบเพื่อ build
# จึงไม่ตั้ง NODE_ENV=production ในสเตจนี้ (มิฉะนั้น npm ci จะข้าม devDeps เช่น prisma/tailwind/tsx)
COPY package.json package-lock.json ./
RUN npm ci

# คัดลอกซอร์สทั้งหมด (ยกเว้นที่อยู่ใน .dockerignore) แล้ว generate client + build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- Runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# เขตเวลาประเทศไทย — server components แสดงเวลา/วันที่ให้ตรงกับผู้ใช้
ENV TZ=Asia/Bangkok
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && ln -snf /usr/share/zoneinfo/Asia/Bangkok /etc/localtime \
  && echo "Asia/Bangkok" > /etc/timezone

# คัดลอกทั้งแอปจากสเตจ build (มี node_modules ครบ รวม prisma CLI + tsx ที่ entrypoint/seed ต้องใช้)
# ทำให้ image ใหญ่กว่าแบบ standalone แต่ตรงไปตรงมาและกู้ปัญหาง่ายสำหรับ deploy รอบทดสอบ
COPY --from=build /app ./
RUN chmod +x /app/docker/entrypoint.sh

# รันด้วย user ที่ไม่ใช่ root (node มากับ base image)
USER node

EXPOSE 3000
# entrypoint รัน `prisma migrate deploy` (+ seed เมื่อ SEED_ON_START=true) ก่อนสตาร์ตเซิร์ฟเวอร์
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["npm", "run", "start"]
