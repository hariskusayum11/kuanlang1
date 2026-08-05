import { redirect } from "next/navigation";

// เมนู "จัดการผู้ใช้งาน" ชี้มาที่ /admin — ส่งต่อไปหน้าเริ่มต้นของกลุ่ม
// การตรวจสิทธิ์ทำที่หน้าปลายทาง (/admin/users → user.manage)
export default function AdminIndexPage() {
  redirect("/admin/users");
}
