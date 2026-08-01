import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getSheetForEntry } from "@/lib/entry/claim";
import { loadDraftPayload } from "@/lib/entry/save";
import { getEntryMasterData } from "@/lib/entry/master-data";
import { EntryWizard } from "@/components/entry/entry-wizard";
import { SheetGate } from "@/components/entry/sheet-gate";

export const metadata = { title: "คีย์แบบสอบถาม" };
export const dynamic = "force-dynamic";

const WRONG_STATUS_LABEL: Record<string, string> = {
  ENTERED_1: "ใบนี้คีย์เสร็จแล้ว — รอผู้ตรวจยืนยันความถูกต้อง",
  ENTERED_2: "ใบนี้คีย์ครบสองรอบแล้ว (รอเปรียบเทียบ)",
  DISCREPANCY: "ใบนี้อยู่ระหว่างการตัดสินข้อมูลไม่ตรงกัน",
  NEEDS_FIELD_QUERY: "ใบนี้รอคำตอบจากภาคสนาม",
  VERIFIED: "ใบนี้ยืนยันข้อมูลแล้ว",
  UNRESOLVABLE: "ใบนี้ถูกปิดเนื่องจากแก้ไขไม่ได้",
  SHEET_LOST: "ใบนี้ถูกบันทึกว่ากระดาษสูญหาย",
  MERGED_INTO: "ใบนี้ถูกรวมเข้ากับใบอื่นแล้ว",
};

// Server-side guard ทุก request — ตรวจ session, permission, scope, เจ้าของ lock
export default async function EntrySheetPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const { sheetId } = await params;
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  if (!hasPermission(ctx, PERMISSIONS.SURVEY_ENTRY)) redirect("/access-denied");

  const access = await getSheetForEntry(ctx, sheetId);

  switch (access.kind) {
    case "NOT_FOUND":
      // รวมกรณีนอก community scope — ไม่เปิดเผยว่าใบมีอยู่จริง (กัน IDOR)
      notFound();
      break;
    case "NOT_OWNER":
      return (
        <GateMessage
          variant="locked"
          title="ใบนี้ถูกผู้อื่นใช้งานอยู่"
          detail="มีเจ้าหน้าที่ท่านอื่นกำลังคีย์ใบนี้ — หยิบใบถัดไปที่ถืออยู่แล้วคีย์ต่อได้เลย"
        />
      );
    case "WRONG_STATUS":
      return (
        <GateMessage
          variant="info"
          title="ใบนี้ไม่ได้อยู่ในขั้นตอนคีย์รอบที่ 1"
          detail={WRONG_STATUS_LABEL[access.status] ?? `สถานะปัจจุบัน: ${access.status}`}
        />
      );
    case "NOT_LOCKED":
    case "LOCK_EXPIRED":
      // ใบว่าง/ล็อกของตนหมดอายุ — ให้กดหยิบ (claim) ก่อนเข้าฟอร์ม
      return (
        <SheetGate
          sheetId={sheetId}
          expired={access.kind === "LOCK_EXPIRED"}
        />
      );
    case "OK":
      break;
  }

  // โหลดร่างที่ค้างไว้ (ถอดรหัสฝั่ง server หลังยืนยันเจ้าของ lock แล้ว)
  const [master, initialDraft] = await Promise.all([
    getEntryMasterData(access.sheet.communityId),
    loadDraftPayload(ctx, sheetId),
  ]);
  const lockExpiry = access.sheet.lockExpiresAt ?? new Date();

  return (
    <EntryWizard
      sheet={{
        id: access.sheet.id,
        sheetNo: access.sheet.sheetNo,
        batchCode: access.sheet.batchCode,
        communityName: access.sheet.communityName,
      }}
      master={master}
      lockExpiresAt={lockExpiry.toISOString()}
      initialRemainingMs={Math.max(0, lockExpiry.getTime() - Date.now())}
      initialDraft={initialDraft}
    />
  );
}

function GateMessage({
  variant,
  title,
  detail,
}: {
  variant: "locked" | "info";
  title: string;
  detail: string;
}) {
  const tone =
    variant === "locked" ? "bg-slate-100 text-slate-500" : "bg-brand-50 text-brand-600";
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md animate-rise rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-md">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
          {variant === "locked" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
              <path d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1z" strokeLinejoin="round" />
              <path d="M9 9h6M9 13h4" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{detail}</p>
        <Link href="/surveys" className="btn btn-primary btn-md mt-7">
          กลับหน้าคีย์แบบสอบถาม
        </Link>
      </div>
    </main>
  );
}
