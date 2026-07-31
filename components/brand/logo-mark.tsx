/**
 * โลโก้ของ SKL-FRIS — บ้านยกพื้นเหนือระดับน้ำ
 *
 * เป็น "เครื่องหมายการค้า" ไม่ใช่ตัวละคร จึงเป็นรูปทรงเรขาคณิตล้วน:
 *  - สื่อสองอย่างที่เป็นแกนของระบบพร้อมกัน — ครัวเรือน (หน่วยข้อมูล) + ระดับน้ำ (ภัย)
 *  - ต้องอ่านออกที่ 16–32px (favicon / sidebar / header) จึงห้ามเติมรายละเอียด
 *  - ใช้ currentColor ทั้งชิ้น เปลี่ยนสีด้วย text-* ของ Tailwind ได้ตรง ๆ
 *  - ไม่มี hook / ไม่มี <defs> → ใช้ได้ทั้ง Server และ Client Component
 */
export function LogoMark({
  size = 32,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  /** ใส่เมื่อโลโก้ยืนเดี่ยวโดยไม่มีข้อความ "SKL-FRIS" กำกับ */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      {...(title ? { role: "img" as const } : { "aria-hidden": true as const })}
    >
      {title && <title>{title}</title>}
      {/* หลังคา */}
      <path d="M16 2 2.6 12.4a1.6 1.6 0 0 0 1 2.9h2.2v-2.6L16 6l10.2 6.7v2.6h2.2a1.6 1.6 0 0 0 1-2.9z" />
      {/* ตัวบ้าน */}
      <path d="M8.4 13.6 16 8.5l7.6 5.1V22H8.4z" />
      {/* เสายกพื้น */}
      <path d="M9.6 22h2.6v4.4H9.6zM19.8 22h2.6v4.4h-2.6z" />
      {/* ระดับน้ำใต้ถุน — สองระลอกให้เห็นว่าเป็นน้ำแม้ตัวเล็ก */}
      <path d="M1.4 24.6c2.4-1.6 4.8-1.6 7.2 0s4.8 1.6 7.2 0 4.8-1.6 7.2 0 4.8 1.6 7.2 0v2.2c-2.4 1.6-4.8 1.6-7.2 0s-4.8-1.6-7.2 0-4.8 1.6-7.2 0-4.8-1.6-7.2 0z" />
      <path
        d="M1.4 28.4c2.4-1.6 4.8-1.6 7.2 0s4.8 1.6 7.2 0 4.8-1.6 7.2 0 4.8 1.6 7.2 0v2.2H1.4z"
        fillOpacity="0.45"
      />
    </svg>
  );
}
