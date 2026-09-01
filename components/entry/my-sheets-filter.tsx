"use client";

import { ThaiDateRangeFields } from "@/components/report/thai-date-range-filter";

type CommunityOption = { id: string; nameTh: string };

export function MySheetsFilter({
  query = "",
  communityId = "",
  status = "ALL",
  from = "",
  to = "",
  communities,
}: {
  query?: string;
  communityId?: string;
  status?: string;
  from?: string;
  to?: string;
  communities: CommunityOption[];
}) {
  return (
    <form method="get" className="border-b-2 border-slate-100 bg-white px-6 py-4">
      <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.3fr)_minmax(170px,1fr)_160px_180px_180px_auto]">
        <label className="text-xs font-bold text-slate-600">
          ค้นหา
          <input
            name="q"
            defaultValue={query}
            maxLength={80}
            className="field mt-1 min-h-11 w-full"
            placeholder="รหัสใบ หรือบ้านเลขที่"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          ชุมชน
          <select name="community" defaultValue={communityId} className="field mt-1 min-h-11 w-full">
            <option value="">ทุกชุมชน</option>
            {communities.map((community) => (
              <option key={community.id} value={community.id}>{community.nameTh}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          สถานะ
          <select name="status" defaultValue={status} className="field mt-1 min-h-11 w-full">
            <option value="ALL">ทุกสถานะ</option>
            <option value="PENDING">รอตรวจ</option>
            <option value="EDITING">กำลังแก้ไข</option>
            <option value="VERIFIED">ตรวจแล้ว</option>
          </select>
        </label>
        <ThaiDateRangeFields from={from} to={to} fromLabel="ส่งตั้งแต่วันที่" toLabel="ถึงวันที่" />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary min-h-11 flex-1">ค้นหา</button>
          <a href="/surveys" className="btn btn-secondary min-h-11">ล้าง</a>
        </div>
      </div>
    </form>
  );
}
