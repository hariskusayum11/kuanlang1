# docs/28 — Encryption & Key Management

> Owner Decision R5 (อนุมัติ 2026-07-23): แนวทาง A — App-layer AES-256-GCM
> ปลดล็อกข้อจำกัด docs/16 §7 ข้อ 14 ("ห้าม implement จนกว่ามี Key Management")

## 1. คำตัดสินใจ (สรุป)

| ประเด็น | คำตัดสิน |
|---|---|
| วิธีเข้ารหัส | **App-layer AES-256-GCM** — เข้ารหัสในแอปก่อนเขียน DB เสมอ (`lib/crypto/encryption.ts`) |
| Key Management | Key อยู่ใน server env (`DATA_ENCRYPTION_KEY`) — ออกแบบ format เผื่อย้าย Cloud KMS ภายหลัง |
| พิกัดครัวเรือน (lat/lng) | **เก็บตรง ไม่เข้ารหัส** — จำเป็นต่อ PostGIS/แผนที่/คำนวณความเสี่ยง; คุมด้วย RBAC + Audit + ห้ามโผล่ public (บังคับอยู่แล้ว) |
| Blind Index | **ทำเลย** — HMAC-SHA256 ของเบอร์โทร (normalize แล้ว) ด้วย key แยก (`SEARCH_HASH_KEY`) สำหรับจับใบซ้ำโดยไม่ต้องถอดรหัส |

## 2. รูปแบบ ciphertext

```
v1:<iv base64>:<ciphertext base64>:<authTag base64>
```

- `v1` = key version — rotate key ได้โดยเพิ่ม `v2` ใน keyring แล้ว re-encrypt ทีละ record; ข้อมูลเก่ายังถอดได้ระหว่างเปลี่ยนผ่าน
- IV สุ่มใหม่ทุกครั้ง (12 bytes) — plaintext เดียวกันได้ ciphertext ต่างกันเสมอ
- GCM auth tag — ข้อมูลถูกแก้/สลับ record → ถอดรหัสล้มเหลวทันที (`EncryptionError`)
- ตรวจว่าเป็น ciphertext ด้วย `isEncrypted()` — ใช้กันการเขียน plaintext ลงคอลัมน์เข้ารหัสโดยพลาด

## 3. ขอบเขตข้อมูลที่ต้องเข้ารหัส

| ข้อมูล | วิธี |
|---|---|
| `EntryAttempt.payload` (คำตอบทั้งฟอร์ม) | `encryptJson()` ทั้งก้อน เก็บเป็น `{ enc: "v1:..." }` |
| Household: `respondentName`, `respondentPhone` | `encryptText()` รายฟิลด์ |
| VulnerablePerson: ชื่อ/เบอร์/รายละเอียดสุขภาพ | `encryptText()` รายฟิลด์ |
| `Discrepancy.value1/value2/resolvedValue`, `FieldQuery.answer` (เมื่อเปิดใช้) | `encryptText()` |
| เบอร์โทรผู้ให้ข้อมูล (สำหรับจับใบซ้ำ) | เพิ่มคอลัมน์ blind index (HMAC hex) ตอน implement entry-save |
| พิกัด lat/lng/location | **ไม่เข้ารหัส** (คำตัดสินข้อ 1) — L3 access control + audit |

กติกา: ฟิลด์ 🔒 ใน schema ต้องไม่ถูกเขียนเป็น plaintext อีกต่อไปนับจาก R5 — code review ต้องตรวจทุก write path

## 4. Environment Variables

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `DATA_ENCRYPTION_KEY` | base64 ของ 32 bytes — AES-256-GCM (v1) |
| `SEARCH_HASH_KEY` | base64 ของ 32 bytes — HMAC blind index (**คนละค่ากับตัวบนเสมอ**) |

สร้างค่า: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## 5. ⚠️ ขั้นตอนสำรอง Key (สำคัญที่สุดในเอกสารนี้)

**Key หาย = ข้อมูลที่เข้ารหัสทั้งหมดกู้ไม่ได้ถาวร** — ไม่มีทางลัด ไม่มี backdoor

ต้องทำทันทีที่ตั้ง key production:

1. พิมพ์/เขียนค่า key ทั้งสองตัวลงกระดาษ + ระบุวันที่และเวอร์ชัน (`v1`)
2. ใส่ซองปิดผนึก **2 ชุด** เก็บแยกสถานที่ (เช่น ตู้เซฟหน่วยงาน + ผู้รับผิดชอบโครงการ)
3. บันทึกใน ทะเบียนคุมกุญแจ: ใครถือซองไหน เมื่อไหร่ (ห้ามบันทึกตัว key ลงระบบใด ๆ ที่ sync ออนไลน์)
4. ทดสอบกู้จริง 1 ครั้ง: นำค่าจากซองมาตั้ง env ในเครื่องทดสอบ แล้วถอดรหัสข้อมูลตัวอย่างสำเร็จ
5. ทุกครั้งที่ rotate key → ทำซ้ำข้อ 1-4 กับ key ใหม่ และ **ห้ามทำลายซอง key เก่า** จนกว่า re-encrypt ครบ 100% และตรวจแล้ว

ห้ามเด็ดขาด: commit key ลง git, ส่ง key ทาง LINE/email, เก็บ key ใน DB, ใช้ key เดียวกันทั้ง dev และ production

## 6. กติกาการใช้งานในโค้ด

- Encrypt/decrypt เป็น **pure functions** (`lib/crypto/encryption.ts`) — รับ key เป็นพารามิเตอร์, unit test ครบ (`tests/unit/crypto.test.ts`)
- โหลด key ผ่าน `lib/crypto/keys.ts` เท่านั้น (server-only) — อย่า `process.env` ตรงในโค้ดอื่น
- ถอดรหัสเฉพาะหลังผ่าน RBAC + community scope แล้วเท่านั้น และการเปิดดูข้อมูลอ่อนไหวต้องเขียน AuditLog (กติกา CLAUDE.md เดิม)
- ห้าม log ค่า plaintext ที่ถอดแล้ว และห้ามส่ง ciphertext ไป client (ถอดฝั่ง server แล้วส่งเฉพาะฟิลด์ที่ role นั้นเห็นได้)
- Dev/Prod ใช้ key คนละชุดเสมอ — ข้อมูล dev เป็น synthetic จึง rotate ทิ้งได้อิสระ

## 7. เส้นทางอัปเกรดในอนาคต (ไม่บล็อกตอนนี้)

- **Cloud KMS**: เปลี่ยน `lib/crypto/keys.ts` ให้ดึง key จาก KMS แทน env — format ciphertext ไม่ต้องเปลี่ยน
- **Envelope encryption ต่อ record**: เพิ่มเวอร์ชัน `v2` ที่ห่อ DEK — โครงสร้าง prefix รองรับอยู่แล้ว
- **Re-encrypt job**: อ่านทีละ batch → decrypt ด้วย key เก่า → encrypt ด้วย key ใหม่ → เขียนกลับใน transaction
