# Deploy v1 (ทดสอบขึ้น Server จริง) — DockerHub + VPS

คู่มือนี้พาขึ้นระบบ SKL-FRIS รอบทดสอบ (v1) แบบ **ทำครั้งเดียวจบ**
สถาปัตยกรรม: build image → push ขึ้น DockerHub → VPS pull มารันคู่กับ PostGIS ผ่าน Docker Compose

```
[เครื่อง dev]  docker build → docker push ─────────────┐
                                                        ▼
[DockerHub]  your-user/skl-fris:v1  ◀── docker pull ──  [VPS]
                                                        │
                                          docker compose up -d
                                          ├── db  (postgis/postgis:16-3.4)
                                          └── app (image ข้างบน) :3000
                                              └ entrypoint: prisma migrate deploy (+seed)
```

---

## สิ่งที่ต้องมีก่อน

- บัญชี DockerHub + `docker login` บนเครื่อง dev
- VPS (Ubuntu 22.04+) ที่ติดตั้ง **Docker + Docker Compose plugin** แล้ว
- เปิด firewall port **3000** (หรือทำ reverse proxy ทีหลัง)

---

## ขั้นที่ 1 — เตรียม secret (ทำครั้งเดียว)

สร้างค่า secret 3 ชุดบนเครื่องที่มี Node:

```bash
# BETTER_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# DATA_ENCRYPTION_KEY และ SEARCH_HASH_KEY (รันสองครั้ง ได้คนละค่า)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> ⚠️ `DATA_ENCRYPTION_KEY` / `SEARCH_HASH_KEY` หาย = ข้อมูลที่เข้ารหัสไว้กู้ไม่ได้ถาวร
> เก็บสำเนา offline อย่างน้อย 2 ชุด ก่อนเริ่มคีย์ข้อมูลจริง

---

## ขั้นที่ 2 — Build + Push image (บนเครื่อง dev)

```bash
docker build -t your-dockerhub-user/skl-fris:v1 .
docker push your-dockerhub-user/skl-fris:v1
```

image นี้รวม migration + seed + prisma CLI ไว้แล้ว (ตอนสตาร์ตจะ migrate ให้อัตโนมัติ)

---

## ขั้นที่ 3 — เตรียมไฟล์บน VPS

สร้างโฟลเดอร์แล้ววาง 2 ไฟล์: `docker-compose.prod.yml` (คัดจาก repo) และ `.env.production`

```bash
mkdir -p ~/skl && cd ~/skl
# คัดลอก docker-compose.prod.yml จาก repo มาไว้ที่นี่ (scp / vim วาง)
# สร้าง .env.production จากตัวอย่างใน repo (.env.production.example) แล้วเติมค่าจริง
```

ค่าที่ **ต้องแก้** ใน `.env.production`:

| ตัวแปร | ใส่อะไร |
| --- | --- |
| `IMAGE` | `your-dockerhub-user/skl-fris:v1` |
| `POSTGRES_PASSWORD` | รหัส DB ที่ตั้งเอง |
| `DATABASE_URL` | ใส่รหัสเดียวกับ `POSTGRES_PASSWORD` · host ต้องเป็น `db` ไม่ใช่ localhost |
| `BETTER_AUTH_SECRET` | ค่าจากขั้นที่ 1 |
| `BETTER_AUTH_URL` | `http://<VPS_IP>:3000` (ต้องตรงกับ URL ที่เปิดจริง) |
| `DATA_ENCRYPTION_KEY` / `SEARCH_HASH_KEY` | ค่าจากขั้นที่ 1 |
| `SEED_ON_START` | `true` (รอบแรก — seed ข้อมูลหลักให้อัตโนมัติ) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | ผู้ดูแลระบบคนแรก (รหัส ≥ 12 ตัว) |

---

## ขั้นที่ 4 — สตาร์ตระบบ

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f app
```

รอจน log ขึ้น `prisma migrate deploy` สำเร็จ + seed เสร็จ แล้วเซิร์ฟเวอร์ฟังที่ :3000
(ครั้งแรก db ต้อง init สักครู่ — app มี `depends_on: service_healthy` รอ db พร้อมก่อน)

---

## ขั้นที่ 5 — สร้าง Admin คนแรก (ครั้งเดียว)

ยังไม่มีใคร login ได้จนกว่าจะมี Admin (ที่จะไปอนุมัติคำขอสมัครของคนอื่น)

ส่งค่า `ADMIN_*` ตอน exec โดยตรง (ไม่ฝังไว้ใน container ถาวร — ปลอดภัยกว่า):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec \
  -e ADMIN_EMAIL='admin@example.org' \
  -e ADMIN_PASSWORD='รหัสผ่านอย่างน้อย12ตัว' \
  -e ADMIN_NAME='ผู้ดูแลระบบ' \
  app npm run admin:create
```

สคริปต์สร้างบัญชี ADMIN + activate (idempotent — รันซ้ำได้ ไม่สร้างซ้ำ)
> หมายเหตุ: `docker compose exec` ไม่สืบทอด env จาก `.env.production` จึงต้องส่ง `-e` เอง
> (ค่า `ADMIN_*` ใน `.env.production.example` มีไว้เป็น checklist ให้จำ ไม่ได้ถูก compose อ่าน)

จากนั้นเปิด `http://<VPS_IP>:3000/login` เข้าด้วยบัญชี Admin นี้ได้เลย

---

## Flow ทดสอบระบบ (สรุป)

1. Admin login → ไปหน้า `/admin` อนุมัติคำขอสมัคร (หรือสร้างผู้ใช้)
2. คนอื่นสมัครที่ `/register` (ขอบทบาท: อาสาสมัคร / เจ้าหน้าที่คีย์ข้อมูล) → Admin อนุมัติ
3. เจ้าหน้าที่คีย์ login → `/surveys` เลือกชุมชน → "เพิ่มแบบสอบถาม" → ระบบออกรหัส SK-xxxxxx → คีย์
4. Verifier ตรวจ/แก้ → ข้อมูล VERIFIED

---

## อัปเดตเวอร์ชันใหม่ทีหลัง

```bash
# เครื่อง dev
docker build -t your-dockerhub-user/skl-fris:v2 . && docker push your-dockerhub-user/skl-fris:v2
# VPS: แก้ IMAGE ใน .env.production เป็น :v2 แล้ว
docker compose -f docker-compose.prod.yml --env-file .env.production pull app
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

migration ใหม่จะถูก apply อัตโนมัติตอน container สตาร์ต (entrypoint) — ข้อมูลเดิมใน volume `skl_db_data` ไม่หาย

---

## หมายเหตุความปลอดภัย (รอบทดสอบ → ก่อน production จริง)

- ยังเป็น HTTP + IP: เหมาะกับ **ทดสอบ** เท่านั้น ก่อนใช้จริงควรมีโดเมน + HTTPS
  (เช่น Caddy/Nginx reverse proxy หน้าพอร์ต 3000 แล้วออก cert อัตโนมัติ) และตั้ง
  `BETTER_AUTH_URL` เป็น `https://<domain>`
- `db` ไม่ publish port ออก host แล้ว (เข้าได้เฉพาะ network ภายใน) — อย่าเปิดออกเน็ต
- อย่า commit `.env.production` (มี secret จริง — `.gitignore` กัน `.env.*` ให้แล้ว)
- Rate limit ของ Better Auth เป็น in-memory ต่อ instance — พอสำหรับรอบทดสอบ instance เดียว
