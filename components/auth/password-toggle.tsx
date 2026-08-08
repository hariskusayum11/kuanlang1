"use client";

/**
 * ปุ่มสลับแสดง/ซ่อนรหัสผ่าน — วางทับมุมขวาของช่อง input (ต้องอยู่ใน .relative + input pr-11)
 * ใช้ร่วมทั้งหน้า login และ register เพื่อไม่ให้ไอคอน/พฤติกรรมหลุดจากกัน
 */
export function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={shown ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      title={shown ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
    >
      {shown ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
          <path d="M3 3l18 18" strokeLinecap="round" />
          <path d="M10.6 10.6a2 2 0 002.8 2.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4 10 7a13 13 0 01-2.2 3.2M6.2 6.2A13 13 0 002 12c1 3 5 7 10 7a9.5 9.5 0 003.4-.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
