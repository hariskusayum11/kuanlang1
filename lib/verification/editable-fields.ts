// รายการฟิลด์ที่ Verifier แก้ไขได้ (Slice 2) — pure, ไม่มี server import
// ใช้ร่วมทั้ง core (edit.ts) และ UI (edit-panel.tsx) เพื่อไม่ให้ descriptor หลุดจากกัน

export type EditableKind = "text" | "number" | "phone" | "select";
export type EditableMasterKey = "namePrefixes" | "tambons";

export interface EditableField {
  /** ชื่อคอลัมน์บน Household */
  key: string;
  label: string;
  kind: EditableKind;
  /** เข้ารหัสเมื่อเก็บ (🔒) */
  sensitive?: boolean;
  /** เบอร์โทร — คำนวณ blind index ใหม่ (respondentPhoneIdx) */
  isPhone?: boolean;
  /** select ดึงตัวเลือกจาก master data ตัวใด */
  masterKey?: EditableMasterKey;
  /** number: ค่าสูงสุด */
  max?: number;
}

// Slice 2: ระบุตัวตน + ที่ตั้ง (จุดที่คีย์ผิดบ่อยสุด) — Slice 3 ขยายส่วนที่เหลือ
export const EDITABLE_FIELDS: readonly EditableField[] = [
  { key: "respondentPrefixId", label: "คำนำหน้า (ผู้ให้ข้อมูล)", kind: "select", masterKey: "namePrefixes" },
  { key: "respondentFirstName", label: "ชื่อผู้ให้ข้อมูล", kind: "text", sensitive: true },
  { key: "respondentLastName", label: "นามสกุลผู้ให้ข้อมูล", kind: "text", sensitive: true },
  { key: "respondentPhone", label: "เบอร์โทรผู้ให้ข้อมูล", kind: "phone", sensitive: true, isPhone: true },
  { key: "houseNo", label: "บ้านเลขที่", kind: "text" },
  { key: "mooNo", label: "หมู่", kind: "number", max: 999 },
  { key: "soi", label: "ซอย", kind: "text" },
  { key: "road", label: "ถนน", kind: "text" },
  { key: "tambonId", label: "ตำบล", kind: "select", masterKey: "tambons" },
  { key: "memberCount", label: "จำนวนสมาชิก (คน)", kind: "number", max: 5000 },
] as const;

export const EDITABLE_BY_KEY = new Map(EDITABLE_FIELDS.map((f) => [f.key, f]));
