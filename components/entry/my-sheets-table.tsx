import Link from "next/link";

interface MySheetRow {
  id: string;
  sheetNo: string;
  communityName: string;
  status: string;
  enteredAt: Date;
  verifiedAt: Date | null;
  illegibleCount: number;
  blankCount: number;
  editing: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** ป้ายสถานะฝั่งผู้คีย์ — ใช้คำที่ผู้คีย์เข้าใจ ไม่ใช่ชื่อสถานะในระบบ */
function statusBadge(row: MySheetRow): { label: string; cls: string } {
  if (row.editing) return { label: "กำลังแก้ไข", cls: "badge-warning" };
  if (row.verifiedAt) return { label: "ตรวจแล้ว", cls: "badge-success" };
  return { label: "รอตรวจ", cls: "badge-neutral" };
}

/**
 * รายการแบบสอบถามที่ผู้คีย์ส่งไปแล้ว — ดูและกดกลับเข้าไปแก้ได้ตลอด (#R7-C)
 * แสดงเฉพาะใบของตัวเอง (กรองด้วย enteredById ฝั่ง server)
 */
export function MySheetsTable({ rows }: { rows: MySheetRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <th className="py-3 pl-6 pr-4">รหัส</th>
            <th className="py-3 pr-4">ชุมชน</th>
            <th className="py-3 pr-4">สถานะ</th>
            <th className="py-3 pr-4 text-right">อ่านไม่ออก</th>
            <th className="py-3 pr-4 text-right">เว้นว่าง</th>
            <th className="py-3 pr-4">คีย์เมื่อ</th>
            <th className="py-3 pr-6"></th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-slate-50">
          {rows.map((row) => {
            const badge = statusBadge(row);
            return (
              <tr key={row.id} className="transition-colors hover:bg-brand-50/40">
                <td className="py-3 pl-6 pr-4 font-mono text-xs font-bold text-slate-700">
                  {row.sheetNo}
                </td>
                <td className="py-3 pr-4 font-medium text-slate-700">
                  {row.communityName}
                </td>
                <td className="py-3 pr-4">
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                  {row.illegibleCount > 0 ? (
                    <span className="font-bold text-sun-700">{row.illegibleCount}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                  {row.blankCount > 0 ? (
                    row.blankCount
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs tabular-nums text-slate-500">
                  {DATE_FMT.format(row.enteredAt)}
                </td>
                <td className="py-3 pr-6 text-right">
                  <Link
                    href={`/surveys/entry/${row.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    {row.editing ? "คีย์ต่อ" : "ดู / แก้ไข"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
