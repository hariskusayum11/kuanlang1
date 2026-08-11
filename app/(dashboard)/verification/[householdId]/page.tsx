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
import { EditPanelFull } from "@/components/verification/edit-panel-full";
import { DeleteHouseholdButton } from "@/components/admin/delete-household-button";
import { SectionTitle } from "@/components/layout/page-hero";
import { DuplicateResolutionPanel } from "@/components/verification/duplicate-resolution-panel";

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
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-slate-50 py-2.5">
      <dt className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        {field.label}
        {field.sensitive && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3 w-3 text-slate-400" aria-label="ข้อมูลอ่อนไหว">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        )}
      </dt>
      <dd className="flex items-center gap-2 text-right text-sm font-semibold text-slate-900">
        {/* ป้าย F2/F3 ของช่อง (ถ้ามี) — ให้ผู้ตรวจเห็นทันทีว่าช่องไหนกระดาษอ่านไม่ออก/ว่าง
            จะได้เพ่งเทียบกับกระดาษตรงจุดนั้นก่อน */}
        {field.status && <StatusBadge status={field.status} />}
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
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-alert-100 text-[11px] font-bold text-alert-700">
            {person.seq}
          </span>
          {display || <span className="font-normal text-slate-400">— ไม่มีชื่อ —</span>}
          <StatusBadge status={person.nameStatus} />
        </p>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
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
  searchParams,
}: {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<{ mode?: string; deleted?: string }>;
}) {
  const { householdId } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(PERMISSIONS.VERIFICATION_VIEW);
  const review = await loadHouseholdForReview(ctx, householdId, {
    includeDeleted: sp.deleted === "1",
  });
  if (!review) notFound();

  const isVerified = review.status === "VERIFIED";
  // โหลดค่าที่แก้ได้เสมอ — loadHouseholdEditable ตัดสิน canEdit เอง
  // (ADMIN แก้ได้ทุกใบ/ทุกสถานะ · ผู้ตรวจทั่วไปเฉพาะ ENTERED_1 ที่ไม่ใช่ใบตัวเอง)
  const editable = await loadHouseholdEditable(ctx, householdId);
  const showEdit = sp.mode === "edit" && editable?.canEdit === true;
  const backHref = review.deletedAt ? "/admin/sheets" : "/verification";

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* หัวเรื่อง + สถานะ */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {review.deletedAt ? "กลับรายการที่ถูกลบ" : "กลับคิวตรวจสอบ"}
        </Link>
        <div className="animate-slide-up mt-3 flex flex-wrap items-center justify-between gap-4 rounded-3xl band-ink px-6 py-6 md:px-8">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-mono text-2xl font-bold text-white">
              {review.sheetNo}
              {isVerified ? (
                <span className="badge badge-success">ตรวจสอบแล้ว</span>
              ) : (
                <span className="badge bg-white/20 text-white">รอตรวจสอบ</span>
              )}
              {review.deletedAt && <span className="badge badge-danger">ถูกลบ</span>}
              {review.duplicateResolution === "CONFIRMED_DUPLICATE" ? (
                <span className="badge badge-danger">ยืนยันว่าซ้ำจริง</span>
              ) : review.duplicateResolution === "NOT_DUPLICATE" ? (
                <span className="badge badge-success">ตรวจแล้วว่าไม่ซ้ำ</span>
              ) : review.hasDuplicateFlag ? (
                <span className="badge badge-warning">⚠ สงสัยซ้ำ · รอตัดสิน</span>
              ) : null}
            </h2>
            <p className="mt-1.5 text-sm font-medium text-brand-100">
              {review.communityName} · คีย์โดย {review.enteredByName}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs font-bold">
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-sun-100">
                <span className="h-2 w-2 rounded-full bg-sun-400" />
                อ่านไม่ออก {review.illegibleCount}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                ว่าง {review.blankCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* แถบเครื่องมือ — ปุ่มลบให้เห็นชัดด้านบน (เฉพาะ ADMIN) */}
      {ctx.roles.includes("ADMIN") && !review.deletedAt && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-5 py-3">
          <span className="text-sm font-semibold text-slate-500">เครื่องมือ:</span>
          {editable?.canEdit && !showEdit && (
            <Link href={`/verification/${review.householdId}?mode=edit`} className="btn btn-primary btn-sm">
              แก้ไข
            </Link>
          )}
          {showEdit && (
            <Link href={`/verification/${review.householdId}?mode=view`} className="btn btn-secondary btn-sm">
              ดูอย่างเดียว
            </Link>
          )}
          <DeleteHouseholdButton householdId={review.householdId} sheetNo={review.sheetNo} redirectTo="/verification" />
        </div>
      )}

      {review.hasDuplicateFlag && review.duplicateResolution === null && (
        <DuplicateResolutionPanel
          householdId={review.householdId}
          candidates={review.duplicateCandidates}
          canResolve={review.canResolveDuplicate}
        />
      )}

      {review.duplicateResolution !== null && (
        <div className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-sm">
          <span className="font-bold text-slate-800">
            ผลตรวจข้อมูลซ้ำ: {review.duplicateResolution === "CONFIRMED_DUPLICATE" ? "ซ้ำจริง" : "ไม่ซ้ำ"}
          </span>
          <span className="ml-2 text-slate-500">
            โดย {review.duplicateResolvedByName ?? "—"}
            {review.duplicateResolvedAt && ` · ${review.duplicateResolvedAt.toLocaleString("th-TH")}`}
          </span>
        </div>
      )}

      {/* อ่าน + แก้ไขในหน้าเดียว — ถ้าแก้ได้ แสดงฟอร์มแก้ไข (มีค่าเดิม) แทนตารางอ่านอย่างเดียว */}
      {showEdit && editable ? (
        <EditPanelFull
          key={review.householdId}
          householdId={review.householdId}
          initialValues={editable.values}
          initialFieldMarks={editable.fieldMarks}
          vulnerablePersons={editable.vulnerablePersons}
          options={editable.options}
        />
      ) : (
        review.sections.map((section) => (
          <section key={section.title} className="card p-6">
            <SectionTitle title={section.title} tone="brand" />
            <dl className="mt-2 grid gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
              {section.fields.map((f) => (
                <FieldRow key={f.label} field={f} />
              ))}
            </dl>
          </section>
        ))
      )}

      {/* กลุ่มเปราะบาง */}
      {review.vulnerablePersons.length > 0 && (
        <section className="card p-6">
          <SectionTitle
            title="กลุ่มเปราะบาง"
            tone="alert"
            aside={<span className="badge badge-neutral">{review.vulnerablePersons.length} คน</span>}
          />
          <div className="mt-3 space-y-3">
            {review.vulnerablePersons.map((p) => (
              <PersonCard key={p.seq} person={p} />
            ))}
          </div>
        </section>
      )}

      {/* แถบยืนยัน */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white/95 px-6 py-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          {review.deletedAt ? (
            <p className="text-sm font-bold text-red-700">ใบนี้ถูกลบแบบ Soft Delete — ดูได้อย่างเดียวและกู้คืนจากหน้าผู้ดูแลระบบ</p>
          ) : isVerified ? (
            <p className="text-sm font-bold text-emerald-700">
              ✓ ยืนยันแล้วโดย {review.verifiedByName ?? "—"}
              {review.verifiedAt && ` · ${review.verifiedAt.toLocaleString("th-TH")}`}
            </p>
          ) : review.enteredByMe ? (
            <p className="text-sm font-semibold text-sun-800">
              คุณเป็นผู้คีย์ใบนี้ — ต้องให้ผู้ตรวจคนอื่นยืนยัน (แยกหน้าที่ผู้คีย์/ผู้ตรวจ)
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-600">
              ตรวจข้อมูลข้างต้นเทียบกับกระดาษ เมื่อถูกต้องแล้วจึงยืนยัน
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {review.canConfirm && (
            <VerifyPanel householdId={review.householdId} sheetNo={review.sheetNo} />
          )}
        </div>
      </div>
    </div>
  );
}
