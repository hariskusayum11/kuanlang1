// ตัวช่วยจัดรูปแบบ/จำกัดค่าที่พิมพ์ในฟอร์มคีย์ — ให้กรอกง่ายและผิดยากขึ้น
// pure ล้วน (ใช้ได้ทั้ง client component และเทสต์) — ไม่แตะ DOM/crypto/prisma

/** เบอร์โทร: รับเฉพาะตัวเลข ตัดที่ 10 หลัก (เบอร์ไทยยาวสุด 10 หลัก) */
export function sanitizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

/** จำนวนเต็มไม่ติดลบ (string สำหรับ controlled input) — clamp ด้วย max ถ้ากำหนด */
export function sanitizeIntString(input: string, max?: number): string {
  const digits = input.replace(/\D/g, "");
  if (digits === "") return "";
  let n = Number.parseInt(digits, 10);
  if (typeof max === "number" && n > max) n = max;
  return String(n);
}

/**
 * มาสก์วันที่แบบ วว/ดด/ปปปป — ใส่ "/" ให้อัตโนมัติระหว่างพิมพ์
 * รับเฉพาะตัวเลข สูงสุด 8 หลัก (2+2+4)
 */
export function maskThaiDate(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [d.slice(0, 2)];
  if (d.length > 2) parts.push(d.slice(2, 4));
  if (d.length > 4) parts.push(d.slice(4, 8));
  return parts.filter((p) => p !== "").join("/");
}
