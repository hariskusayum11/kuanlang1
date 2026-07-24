import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldStatusEnum } from "@prisma/client";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  loadHouseholdForReview,
  type ReviewField,
  type ReviewVulnerablePerson,
} from "@/lib/verification/review";
import { loadHouseholdEditable } from "@/lib/verification/edit";
import { VerifyPanel } from "@/components/verification/verify-panel";
import { EditPanel } from "@/components/verification/edit-panel";

export const metadata = { title: "ตรวจสอบใบ" };
export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: FieldStatusEnum }) {
  if (status === FieldStatusEnum.ILLEGIBLE) {
    return <span className="badge badge-warning">อ่านไม่ออก · F2</span>;
  }
  if (status === FieldStatusEnum.BLANK_IN_PAPER) {
    return <span className="badge badge-neutral">ว่างในกระดาษ · F3</span>;
  }
  return null;
}

function FieldRow({ field }: { field: ReviewField }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="flex items-center gap-1.5 text-sm text-slate-500">
        {field.label}
        {field.sensitive && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3 w-3 text-slate-400" aria-label="ข้อมูลอ่อนไหว">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        )}
      </dt>
      <dd className="text-right text-sm font-medium text-slate-900">
        {field.value != null && field.value !== "" ? (
          field.value
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </dd>
    </div>
  );
}

function PersonCard({ person }: { person: ReviewVulnerablePerson }) {
  const display = [person.prefix, person.name].filter(Boolean).join(" ");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
            {person.seq}
          </span>
          {display || <span className="font-normal text-slate-400">— ไม่มีชื่อ —</span>}
          <StatusBadge status={person.nameStatus} />
        </p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            อายุ {person.age ?? "—"}
            <StatusBadge status={person.ageStatus} />
          </span>
          <span className="flex items-center gap-1">
            โทร {person.phone ?? "—"}
            <StatusBadge status={person.phoneStatus} />
          </span>
        </div>
      </div>
      {person.vulnerabilities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {person.vulnerabilities.map((v) => (
            <span key={v} className="badge badge-neutral">
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const ctx = await requirePermission(PERMISSIONS.VERIFICATION_VIEW);
  const review = await loadHouseholdForReview(ctx, householdId);
  if (!review) notFound();

  const isVerified = review.status === "VERIFIED";
  // โหลดค่าที่แก้ได้เฉพาะเมื่อยืนยัน/แก้ได้ (ENTERED_1 และไม่ใช่ผู้คีย์เอง)
  const editable = review.canConfirm ? await loadHouseholdEditable(ctx, householdId) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      {/* หัวเรื่อง + สถานะ */}
      <div>
        <Link
          href="/verification"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          กลับคิวตรวจสอบ
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-mono text-xl font-bold text-slate-900">
              {review.sheetNo}
              {isVerified ? (
                <span className="badge badge-success">ตรวจสอบแล้ว</span>
              ) : (
                <span className="badge badge-brand">รอตรวจสอบ</span>
              )}
              {review.hasDuplicateFlag && (
                <span className="badge badge-warning">⚠ สงสัยซ้ำ</span>
              )}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {review.communityName} · <span className="font-mono">{review.batchCode}</span> ·
              คีย์โดย {review.enteredByName}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              อ่านไม่ออก {review.illegibleCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              ว่าง {review.blankCount}
            </span>
          </div>
        </div>
      </div>

      {/* ส่วนข้อมูล */}
      {review.sections.map((section) => (
        <section key={section.title} className="card p-6">
          <h3 className="mb-1 text-[15px] font-semibold text-slate-900">{section.title}</h3>
          <dl className="divide-y divide-slate-50">
            {section.fields.map((f) => (
              <FieldRow key={f.label} field={f} />
            ))}
          </dl>
        </section>
      ))}

      {/* กลุ่มเปราะบาง */}
      {review.vulnerablePersons.length > 0 && (
        <section className="card p-6">
          <h3 className="mb-3 text-[15px] font-semibold text-slate-900">
            กลุ่มเปราะบาง ({review.vulnerablePersons.length} คน)
          </h3>
          <div className="space-y-3">
            {review.vulnerablePersons.map((p) => (
              <PersonCard key={p.seq} person={p} />
            ))}
          </div>
        </section>
      )}

      {/* แก้ไขข้อมูล (เฉพาะใบ ENTERED_1 ที่ผู้ตรวจไม่ใช่ผู้คีย์) */}
      {editable?.canEdit && (
        <EditPanel
          householdId={review.householdId}
          initialValues={editable.values}
          options={editable.options}
        />
      )}

      {/* แถบยืนยัน */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 px-6 py-4 shadow-md backdrop-blur">
        {isVerified ? (
          <p className="text-sm text-emerald-700">
            ✓ ยืนยันแล้วโดย {review.verifiedByName ?? "—"}
            {review.verifiedAt && ` · ${review.verifiedAt.toLocaleString("th-TH")}`}
          </p>
        ) : review.enteredByMe ? (
          <p className="text-sm text-amber-700">
            คุณเป็นผู้คีย์ใบนี้ — ต้องให้ผู้ตรวจคนอื่นยืนยัน (แยกหน้าที่ผู้คีย์/ผู้ตรวจ)
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            ตรวจข้อมูลข้างต้นเทียบกับกระดาษ เมื่อถูกต้องแล้วจึงยืนยัน
          </p>
        )}
        {review.canConfirm && (
          <VerifyPanel householdId={review.householdId} sheetNo={review.sheetNo} />
        )}
      </div>
    </div>
  );
}
