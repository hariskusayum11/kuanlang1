import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./prisma";

/** Session ดิบจาก Better Auth (ฝั่ง Server) — null เมื่อไม่ได้ Login */
export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type ActiveSessionUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * ผู้ใช้ที่ Login แล้วและยัง active — ตรวจ isActive กับ DB ทุกครั้ง
 * (กันกรณีถูกปิดใช้งานหลังจากมี session ค้างอยู่)
 * คืน null เมื่อไม่มี session หรือผู้ใช้ inactive → caller ต้อง redirect /login
 */
export async function getActiveSessionUser(): Promise<ActiveSessionUser | null> {
  const session = await getServerSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return { id: user.id, name: user.name, email: user.email };
}
