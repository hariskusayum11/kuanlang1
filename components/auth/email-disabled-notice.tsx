import Link from "next/link";

/**
 * แสดงแทนฟอร์มที่ต้องพึ่งอีเมล เมื่อระบบอีเมลถูกปิด (EMAIL_ENABLED=false)
 *
 * ต้องบอก "ทางออกที่ใช้ได้จริง" ไม่ใช่แค่บอกว่าใช้ไม่ได้ — ผู้ใช้ที่เข้าระบบไม่ได้
 * และไม่รู้ว่าต้องทำอะไรต่อ จะโทรหาผู้ดูแลระบบโดยไม่รู้ว่าต้องขออะไร
 */
export function EmailDisabledNotice({ action }: { action: "reset" | "verify" }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border-2 border-sun-300 bg-sun-50 px-4 py-3.5 text-sm font-medium leading-relaxed text-slate-800">
        {action === "reset" ? (
          <>
            ขณะนี้ระบบ<strong>ยังส่งอีเมลไม่ได้</strong> จึงตั้งรหัสผ่านใหม่ด้วยตนเองไม่ได้
            <br />
            <span className="text-slate-600">
              กรุณาติดต่อผู้ดูแลระบบเพื่อขอ &ldquo;รหัสผ่านชั่วคราว&rdquo;
              จากนั้นเข้าสู่ระบบแล้วตั้งรหัสใหม่ของคุณเองได้ทันที
            </span>
          </>
        ) : (
          <>
            ขณะนี้ระบบ<strong>ยังส่งอีเมลไม่ได้</strong> จึงไม่มีลิงก์ยืนยันอีเมลส่งออกไป
            <br />
            <span className="text-slate-600">
              คำขอสมัครของคุณถูกบันทึกไว้เรียบร้อยแล้ว
              ผู้ดูแลระบบจะตรวจสอบและติดต่อกลับเพื่อเปิดใช้งานบัญชีให้
            </span>
          </>
        )}
      </div>

      <Link href="/login" className="btn btn-primary btn-lg w-full">
        กลับหน้าเข้าสู่ระบบ
      </Link>
    </div>
  );
}
