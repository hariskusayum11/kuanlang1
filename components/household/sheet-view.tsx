import { FieldStatusEnum } from "@prisma/client";
import { SectionTitle } from "@/components/layout/page-hero";
import type { HouseholdReview, ReviewField, ReviewVulnerablePerson } from "@/lib/verification/review";

/**
 * ตัวแสดงใบแบบสอบถามแบบอ่านอย่างเดียว — ใช้ร่วมกันระหว่างหน้าตรวจ (/verification/[id])
 * และหน้าดูใบของผู้มีสิทธิ์ดูข้อมูลครัวเรือน (/households/[id] · docs/43)
 */
export function StatusBadge({ status }: { status: FieldStatusEnum }) {
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
    <div className={`rounded-2xl border-2 p-4 ${person.inactiveLabel ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-alert-100 text-[11px] font-bold text-alert-700">
            {person.seq}
          </span>
          {display || <span className="font-normal text-slate-400">— ไม่มีชื่อ —</span>}
          <StatusBadge status={person.nameStatus} />
          {person.inactiveLabel ? <span className="badge badge-neutral">{person.inactiveLabel}</span> : null}
          {person.reportedLabel ? <span className="badge badge-brand" title="ไม่ได้มาจากแบบสอบถามกระดาษ">{person.reportedLabel}</span> : null}
        </p>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-1">
            อายุ {person.ageMonths != null ? `${person.ageMonths} เดือน` : person.age != null ? `${person.age} ปี` : "—"}
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

export function SheetSections({ sections }: { sections: HouseholdReview["sections"] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.title} className="card p-6">
          <SectionTitle title={section.title} tone="brand" />
          <dl className="mt-2 grid gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((f) => (
              <FieldRow key={f.label} field={f} />
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}

export function VulnerablePeopleSection({ people }: { people: ReviewVulnerablePerson[] }) {
  if (people.length === 0) return null;
  return (
    <section className="card p-6">
      <SectionTitle
        title="กลุ่มเปราะบาง"
        tone="alert"
        aside={<span className="badge badge-neutral">{people.length} คน</span>}
      />
      <div className="mt-3 space-y-3">
        {people.map((p) => (
          <PersonCard key={p.seq} person={p} />
        ))}
      </div>
    </section>
  );
}
