import { redirect } from "next/navigation";

// หน้าต้นแบบ "สองคลอง" ย้ายไปเป็นหน้าแรกแล้ว (Owner Decision 2026-11-09 · docs/44) — ลิงก์เดิมพาไปหน้าแรก
export default function SongKhlongLabRedirect() {
  redirect("/");
}
