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

/**
 * ทศนิยม (พิกัด GPS): รับตัวเลข จุดทศนิยมจุดเดียว และเครื่องหมายลบนำหน้า
 * จำกัดตำแหน่งหลังจุดไม่เกิน maxDecimals — พิกัด 6 ตำแหน่งพอ (~0.11 ม.)
 * paper-first: ไม่เติม 0/ไม่ปัดค่า แค่กันพิมพ์เกินหลักที่ระบบใช้จริง (Decimal 10,7)
 */
export function sanitizeDecimal(input: string, maxDecimals = 6): string {
  const neg = input.trimStart().startsWith("-");
  const cleaned = input.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  let out: string;
  if (dot === -1) {
    out = cleaned;
  } else {
    const intPart = cleaned.slice(0, dot);
    const decPart = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals);
    out = `${intPart}.${decPart}`;
  }
  return (neg ? "-" : "") + out;
}

/** วว/ดด/ปปปป(พ.ศ.) → ISO "YYYY-MM-DD"(ค.ศ.) สำหรับ input[type=date] — parse ไม่ได้คืน "" */
export function thaiDateToISO(masked: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(masked.trim());
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
  if (year < 1900 || year > 2200) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ""; // วันที่เกินจริง เช่น 31/02
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** ISO "YYYY-MM-DD"(ค.ศ.) จากปฏิทิน → วว/ดด/ปปปป(พ.ศ.) — input ผิดรูปคืน "" */
export function isoToThaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
}
