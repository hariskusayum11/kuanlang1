import { PasswordChangeForm } from "@/components/profile/password-change-form";

/**
 * หน้ากั้นบังคับเปลี่ยนรหัสผ่าน — แสดงแทนเนื้อหาทุกหน้าใน (dashboard)
 * เมื่อ `User.mustChangePassword = true` (ADMIN เพิ่งตั้งรหัสชั่วคราวให้)
 *
 * ทำไมเป็น "หน้ากั้น" ไม่ใช่ redirect:
 * หน้าโปรไฟล์อยู่ใน route group เดียวกัน การ redirect จาก layout ไป /profile
 * จะวิ่งกลับเข้า layout เดิมซ้ำไม่รู้จบ — การเรนเดอร์ทับจึงปลอดภัยกว่าและ
 * ครอบคลุมทุกเส้นทางโดยไม่ต้องรู้ pathname ฝั่ง server
 *
 * ไม่ใส่มาสคอต: เป็นหน้าหลังบ้านเชิงความปลอดภัย ไม่ใช่หน้าสื่อสารกับประชาชน (กฎ F)
 */
export function PasswordChangeGate() {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-6 animate-fade-in">
      <div className="card border-sun-300 p-6">
        <span className="eyebrow text-sun-700">ต้องดำเนินการก่อนใช้งาน</span>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          กรุณาตั้งรหัสผ่านใหม่
        </h1>
        <p className="mt-3 rounded-xl border-2 border-sun-200 bg-sun-50 px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-700">
          รหัสผ่านที่คุณใช้อยู่เป็น<strong>รหัสชั่วคราว</strong>ที่ผู้ดูแลระบบตั้งให้
          และมีผู้อื่นทราบค่านี้
          <br />
          <span className="text-slate-500">
            กรุณาตั้งรหัสใหม่ที่มีเพียงคุณคนเดียวที่รู้ จึงจะใช้งานระบบต่อได้
          </span>
        </p>

        <div className="mt-6">
          <PasswordChangeForm redirectOnSuccess="/dashboard" />
        </div>

        <p className="mt-5 text-xs leading-relaxed text-slate-400">
          ช่อง &ldquo;รหัสผ่านปัจจุบัน&rdquo; ให้กรอกรหัสชั่วคราวที่ผู้ดูแลระบบแจ้งมา ·
          เมื่อเปลี่ยนสำเร็จ อุปกรณ์อื่นที่เข้าสู่ระบบไว้จะถูกออกจากระบบทั้งหมด
        </p>
      </div>
    </div>
  );
}
