"use client";

import { useActionState, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { ImportantSitePoint } from "@/lib/geo/important-sites";
import {
  deleteImportantSiteAction,
  saveImportantSiteAction,
  type ImportantSiteActionState,
} from "@/lib/geo/important-site-actions";
import { SITE_STYLE, siteTypeKey } from "./household-layer-map";

type Option = { id: string; label: string };
type SiteTypeOption = { value: string; label: string };
export type SiteManagerResult = { tone: "success" | "warning" | "error"; text: string };

/**
 * หน้าต่างจัดการจุดสำคัญ (เปิดจากปุ่มลอยบนแผนที่) — แสดงเฉพาะผู้ที่ canManageImportantSites
 *
 * การซ่อนปุ่มไม่ใช่ Authorization: saveImportantSite/deleteImportantSite ตรวจสิทธิ์ ADMIN
 * ฝั่ง server ซ้ำทุกครั้ง · เรนเดอร์ผ่าน Modal (Portal) เพราะหน้าแผนที่มีชั้นซ้อนหลายระดับ
 */
export function ImportantSiteManager({
  open,
  onClose,
  onResult,
  sites,
  siteTypes,
  communities,
  defaultCommunityId,
  mapCenter,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (result: SiteManagerResult) => void;
  sites: ImportantSitePoint[];
  siteTypes: SiteTypeOption[];
  communities: Option[];
  defaultCommunityId?: string;
  /** กึ่งกลางแผนที่ขณะเปิดหน้าต่าง ใช้เป็นพิกัดเริ่มต้นของจุดใหม่ */
  mapCenter: { lat: number; lng: number } | null;
}) {
  const [tab, setTab] = useState<"add" | "list">("add");
  const done = (result: SiteManagerResult) => {
    onResult(result);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="site-manager-title" size="lg">
      <div className="card overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b-2 border-slate-100 bg-mist px-5 py-4">
          <div>
            <h2 id="site-manager-title" className="text-lg font-bold text-slate-900">จัดการจุดสำคัญบนแผนที่</h2>
            <p className="mt-0.5 text-xs text-slate-500">โรงเรียน วัด/มัสยิด ศูนย์อพยพ และพื้นที่สำคัญอื่น · เฉพาะผู้ดูแลระบบ</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="ปิดหน้าต่าง">✕</button>
        </div>
        <div className="flex gap-1 border-b-2 border-slate-100 px-5 pt-3" role="tablist">
          <TabButton active={tab === "add"} onClick={() => setTab("add")}>เพิ่มจุดใหม่</TabButton>
          <TabButton active={tab === "list"} onClick={() => setTab("list")}>
            จุดที่มีอยู่ <span className="ml-1 tabular-nums text-slate-400">({sites.length.toLocaleString("th-TH")})</span>
          </TabButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {tab === "add" ? (
            <AddSiteForm
              siteTypes={siteTypes}
              communities={communities}
              defaultCommunityId={defaultCommunityId}
              mapCenter={mapCenter}
              onDone={done}
            />
          ) : (
            <SiteList sites={sites} siteTypes={siteTypes} communities={communities} onDone={done} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-0.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-bold transition-colors ${
        active ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

type SiteServerAction = (previous: ImportantSiteActionState, formData: FormData) => Promise<ImportantSiteActionState>;

/**
 * เรียก server action แล้วแจ้งผลสำเร็จขึ้นไปที่แผนที่ · ผลผิดพลาดค้างไว้ในหน้าต่างเพื่อไม่ให้ข้อมูลที่กรอกหาย
 *
 * แจ้งจากในตัว action ไม่ใช่ useEffect: ตอนลบ revalidatePath ทำให้รายการ (และคอมโพเนนต์นี้)
 * หายไปก่อน effect จะทำงาน — เจอจริงตอนทดสอบ หน้าต่างค้างและไม่มีข้อความยืนยัน
 */
function useSiteAction(serverAction: SiteServerAction, onDone: (result: SiteManagerResult) => void, tone: SiteManagerResult["tone"]) {
  const [state, action, pending] = useActionState<ImportantSiteActionState, FormData>(async (previous, formData) => {
    const result = await serverAction(previous, formData);
    if (result?.ok) onDone({ tone, text: result.message });
    return result;
  }, null);
  return { action, pending, error: state && !state.ok ? state.error : null };
}

function AddSiteForm({
  siteTypes,
  communities,
  defaultCommunityId,
  mapCenter,
  onDone,
}: {
  siteTypes: SiteTypeOption[];
  communities: Option[];
  defaultCommunityId?: string;
  mapCenter: { lat: number; lng: number } | null;
  onDone: (result: SiteManagerResult) => void;
}) {
  const { action, pending, error } = useSiteAction(saveImportantSiteAction, onDone, "success");
  return (
    <form action={action}>
      {mapCenter ? (
        <p className="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-800">
          พิกัดเริ่มต้นคือ <b>จุดกึ่งกลางแผนที่ขณะนี้</b> — เลื่อนแผนที่ให้กึ่งกลางอยู่ที่ตำแหน่งจริงก่อนเปิดหน้าต่างนี้ หรือพิมพ์พิกัดเองได้
        </p>
      ) : null}
      <SiteFields
        siteTypes={siteTypes}
        communities={communities}
        defaults={{
          communityId: defaultCommunityId,
          lat: mapCenter ? Number(mapCenter.lat.toFixed(6)) : undefined,
          lng: mapCenter ? Number(mapCenter.lng.toFixed(6)) : undefined,
        }}
      />
      {error ? <FormError>{error}</FormError> : null}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4 w-full">
        {pending ? "กำลังบันทึก…" : "เพิ่มจุดบนแผนที่"}
      </button>
    </form>
  );
}

function SiteList({
  sites,
  siteTypes,
  communities,
  onDone,
}: {
  sites: ImportantSitePoint[];
  siteTypes: SiteTypeOption[];
  communities: Option[];
  onDone: (result: SiteManagerResult) => void;
}) {
  const [query, setQuery] = useState("");
  const labels = useMemo(() => Object.fromEntries(siteTypes.map((type) => [type.value, type.label])), [siteTypes]);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return sites;
    return sites.filter((site) => `${site.name} ${site.communityName} ${labels[siteTypeKey(site)] ?? ""}`.toLowerCase().includes(text));
  }, [sites, query, labels]);

  if (!sites.length) {
    return <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">ยังไม่มีจุดสำคัญในพื้นที่ที่เลือก</p>;
  }
  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="ค้นหาชื่อจุด ชุมชน หรือประเภท"
        aria-label="ค้นหาจุดสำคัญ"
        className="field mb-3"
      />
      {filtered.length ? (
        <div className="space-y-2">
          {filtered.map((site) => {
            const type = siteTypeKey(site);
            const style = SITE_STYLE[type] ?? SITE_STYLE.OTHER;
            return (
              <details key={site.id} className="rounded-xl border-2 border-slate-100 bg-white open:border-brand-200">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                  <SiteSymbol color={style.color} symbol={style.symbol} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{site.name}</span>
                    <span className="block truncate text-xs text-slate-500">{labels[type] ?? "จุดสำคัญ"} · {site.communityName}</span>
                  </span>
                  <span className="text-xs font-semibold text-brand-700">แก้ไข</span>
                </summary>
                <div className="border-t-2 border-slate-100 p-4">
                  <EditSiteForm site={site} siteTypes={siteTypes} communities={communities} onDone={onDone} />
                  <DeleteSiteButton site={site} onDone={onDone} />
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">ไม่พบจุดที่ตรงกับ “{query}”</p>
      )}
    </div>
  );
}

function EditSiteForm({
  site,
  siteTypes,
  communities,
  onDone,
}: {
  site: ImportantSitePoint;
  siteTypes: SiteTypeOption[];
  communities: Option[];
  onDone: (result: SiteManagerResult) => void;
}) {
  const { action, pending, error } = useSiteAction(saveImportantSiteAction, onDone, "success");
  return (
    <form action={action}>
      <input type="hidden" name="id" value={site.id} />
      <SiteFields siteTypes={siteTypes} communities={communities} site={site} />
      {error ? <FormError>{error}</FormError> : null}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
      </button>
    </form>
  );
}

/** ลบแบบสองจังหวะในหน้าต่างเดิม — ไม่ซ้อน modal และไม่พึ่ง window.confirm */
function DeleteSiteButton({ site, onDone }: { site: ImportantSitePoint; onDone: (result: SiteManagerResult) => void }) {
  const [confirming, setConfirming] = useState(false);
  const { action, pending, error } = useSiteAction(deleteImportantSiteAction, onDone, "warning");
  return (
    <form action={action} className="mt-4 border-t-2 border-slate-100 pt-4">
      <input type="hidden" name="id" value={site.id} />
      {confirming ? (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">ยืนยันลบ “{site.name}” ออกจากระบบถาวร? กู้คืนจากหน้านี้ไม่ได้</p>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={pending} className="btn btn-danger btn-sm">{pending ? "กำลังลบ…" : "ยืนยันลบถาวร"}</button>
            <button type="button" onClick={() => setConfirming(false)} className="btn btn-secondary btn-sm">ยกเลิก</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn btn-ghost btn-sm text-red-700">ลบจุดนี้…</button>
      )}
      {error ? <FormError>{error}</FormError> : null}
    </form>
  );
}

function SiteFields({
  siteTypes,
  communities,
  site,
  defaults,
}: {
  siteTypes: SiteTypeOption[];
  communities: Option[];
  site?: ImportantSitePoint;
  defaults?: { communityId?: string; lat?: number; lng?: number };
}) {
  const label = "text-xs font-bold text-slate-600";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={label}>ชื่อจุด
        <input required maxLength={150} name="name" defaultValue={site?.name} className="field mt-1" placeholder="เช่น โรงเรียนบ้านคลอง" />
      </label>
      <label className={label}>ประเภท
        <select required name="type" defaultValue={site?.type ?? "SCHOOL"} className="field mt-1">
          {siteTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>
      <label className={label}>ชุมชน
        <select required name="communityId" defaultValue={site?.communityId ?? defaults?.communityId ?? ""} className="field mt-1">
          <option value="" disabled>เลือกชุมชน</option>
          {communities.map((community) => <option key={community.id} value={community.id}>{community.label}</option>)}
        </select>
      </label>
      <label className={label}>ความจุ (คน)
        <input min={0} step={1} type="number" name="capacity" defaultValue={site?.capacity ?? ""} className="field mt-1" />
      </label>
      <label className={label}>ละติจูด
        <input required step="any" min={-90} max={90} type="number" name="latitude" defaultValue={site?.lat ?? defaults?.lat} className="field mt-1 tabular-nums" placeholder="7.0075" />
      </label>
      <label className={label}>ลองจิจูด
        <input required step="any" min={-180} max={180} type="number" name="longitude" defaultValue={site?.lng ?? defaults?.lng} className="field mt-1 tabular-nums" placeholder="100.4200" />
      </label>
      <label className={`${label} sm:col-span-2`}>ที่อยู่/รายละเอียด
        <input maxLength={500} name="address" defaultValue={site?.address ?? ""} className="field mt-1" />
      </label>
    </div>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{children}</p>;
}

export function SiteSymbol({ color, symbol, size = "md" }: { color: string; symbol: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-md text-white ${size === "sm" ? "h-5 w-5 text-[11px]" : "h-7 w-7 text-sm"}`}
      // สีตรงกับหมุดจุดสำคัญบนแผนที่ (SITE_STYLE)
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {symbol}
    </span>
  );
}
