import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { prisma } from "@/lib/prisma";
import { getPublicEmergencyContacts } from "@/lib/public/stats";
import { PageHero, SectionTitle } from "@/components/layout/page-hero";

export const metadata = { title: "ศูนย์อาสาสมัคร" };
export const dynamic = "force-dynamic";

/**
 * หน้าของอาสาสมัคร (Owner Decision 2026-10-18)
 *
 * เดิมอาสาสมัครมีสิทธิ์ `dashboard.view` จึงเข้ามาเจอ "แดชบอร์ดผู้บริหาร"
 * พร้อมตัวเลขรวมทั้งระบบ ทั้งที่ยังไม่มีโมดูลภารกิจให้ทำอะไร — ขัดกฎใน CLAUDE.md
 * ที่ว่า "Volunteer เห็นเฉพาะข้อมูลที่จำเป็นต่อภารกิจ"
 *
 * หน้านี้จึงแสดงเฉพาะ **ข้อมูลของตัวผู้ใช้เอง** กับ **เบอร์ฉุกเฉินสาธารณะ**
 * ไม่มีข้อมูลครัวเรือน ไม่มีตัวเลขรวมของระบบ
 *
 * เป็นหน้าสื่อสารกับประชาชน จึงใส่มาสคอตได้ตามกฎ F (ต่างจากหน้าหลังบ้าน)
 */
export default async function VolunteerPage() {
  const ctx = await requirePermission(PERMISSIONS.VOLUNTEER_PORTAL_VIEW);

  const [me, contacts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        name: true,
        email: true,
        phone: true,
        registrationRequest: { select: { organization: true, decidedAt: true } },
      },
    }),
    getPublicEmergencyContacts(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <PageHero
        title="ศูนย์อาสาสมัคร"
        tone="brand"
        description="คุณลงทะเบียนเป็นอาสาสมัครของโครงการเรียบร้อยแล้ว เมื่อเกิดเหตุและต้องการกำลังคน ผู้ประสานงานจะติดต่อกลับตามเบอร์ที่ให้ไว้"
        mascotRole="rescue"
        mascotMood="happy"
        badge={<>พร้อมปฏิบัติภารกิจ</>}
      />

      <section className="card p-6">
        <SectionTitle title="ข้อมูลที่ระบบบันทึกไว้" tone="brand" />
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-slate-400">ชื่อ-นามสกุล</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800">{me?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">เบอร์ติดต่อ</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800">
              {me?.phone ?? "ยังไม่ได้ระบุ"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">อีเมล</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800">{me?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">หน่วยงาน/สังกัด</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800">
              {me?.registrationRequest?.organization ?? "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-5 rounded-xl border-2 border-slate-200 bg-mist px-3.5 py-3 text-sm leading-relaxed text-slate-600">
          เบอร์ติดต่อสำคัญมากเวลาเกิดเหตุ — ถ้าเปลี่ยนเบอร์ กรุณาแก้ที่หน้า{" "}
          <Link href="/profile" className="font-bold text-brand-600 hover:underline">
            โปรไฟล์ของฉัน
          </Link>
        </p>
      </section>

      <section className="card p-6">
        <SectionTitle title="เบอร์ติดต่อฉุกเฉิน" tone="sun" />
        {contacts.length === 0 ? (
          <p className="mt-5 text-sm text-slate-400">ยังไม่มีข้อมูลเบอร์ฉุกเฉินในระบบ</p>
        ) : (
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <a
                  href={`tel:${c.phone}`}
                  className="card-interactive flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0 text-sm font-semibold text-slate-700">
                    {c.nameTh}
                  </span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-brand-700">
                    {c.phone}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-mist p-6">
        <SectionTitle title="ระหว่างรอภารกิจ" tone="mint" />
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          ดูจุดอพยพ เบอร์ฉุกเฉิน และวิธีเตรียมตัวรับมือน้ำท่วมได้ที่หน้าสาธารณะของโครงการ
          — เปิดได้โดยไม่ต้องเข้าสู่ระบบ แชร์ต่อให้คนในชุมชนได้เลย
        </p>
        <Link href="/" className="btn btn-accent btn-md mt-5">
          เปิดหน้าสาธารณะ
        </Link>
      </section>
    </div>
  );
}
