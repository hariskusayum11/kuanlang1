// การ์ดธงเตือนภัยชุมชน (โดยประมาณ) บนหน้าแรก — Server Component
// บอกชัดเสมอว่า "ไม่ใช่ธงที่ประกาศ" และลิงก์ไปธงจริงของกลุ่มสองคลองควนลัง
import Link from "next/link";
import { COMMUNITY_FLAG_SOURCE, type EstimatedFlag } from "@/domain/water/community-flags";
import { ESTIMATED_FLAG_LABEL, ESTIMATED_FLAG_MEANING, Flag } from "@/components/water/community-flag";
import type { CommunityFlagStatus } from "@/lib/water/community-flag";

const BAND: Record<EstimatedFlag, string> = {
  GREEN: "bg-emerald-400",
  YELLOW: "bg-sun-400",
  RED: "bg-red-600",
  UNKNOWN: "bg-slate-300",
};
const LABEL_TEXT: Record<EstimatedFlag, string> = {
  GREEN: "text-emerald-700",
  YELLOW: "text-sun-800",
  RED: "text-red-600",
  UNKNOWN: "text-slate-500",
};

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CommunityFlagCard({ status }: { status: CommunityFlagStatus }) {
  const { flag, closest } = status;
  // เวลาวัดล่าสุดของสะพานที่มีข้อมูล ("YYYY-MM-DD HH:mm" เรียงตามตัวอักษรได้)
  const latest = Object.values(status.measuredAt).filter((v): v is string => !!v).sort().at(-1) ?? null;

  return (
    <section aria-labelledby="flag-title" className="card relative mt-8 overflow-hidden">
      <span className={`absolute inset-x-0 top-0 h-1.5 ${BAND[flag]}`} aria-hidden="true" />
      <div className="flex flex-col gap-4 p-5 pt-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <Flag level={flag} className="h-12 w-12 sm:h-16 sm:w-16" />
          <div className="min-w-0 flex-1">
            <h2 id="flag-title" className="text-xs font-semibold text-slate-500">
              ธงเตือนภัยชุมชนสองคลอง–ควนลัง <span className="font-normal">(ประเมินจากระดับน้ำ)</span>
            </h2>
            <p className="mt-0.5 text-2xl font-bold leading-tight text-slate-900">
              <span className={LABEL_TEXT[flag]}>{ESTIMATED_FLAG_LABEL[flag]}</span>
              <span className="text-base font-semibold text-slate-600"> · {ESTIMATED_FLAG_MEANING[flag]}</span>
            </p>
            {closest ? (
              <p className="mt-1 text-sm text-slate-600">
                จุดที่ใกล้เกณฑ์ที่สุด: <b className="text-slate-800">{closest.bridge}</b> ต่ำกว่าเกณฑ์
                {closest.next === "YELLOW" ? "ธงเหลือง" : "ธงแดง"} {fmt(closest.meters)} ม.
              </p>
            ) : null}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              ไม่ใช่ธงที่ประกาศ — คำนวณจากเกณฑ์ยกธงของกลุ่มสองคลองควนลังกับระดับน้ำสถานีกรมชลประทานที่สะพานคลองหวะ ม่วงก็อง และบางศาลา
              {latest ? ` · วัดเมื่อ ${latest.split(" ")[1] ?? latest} น.` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
            ดูธงที่ประกาศจริง ↗
          </a>
          <Link href="/lab/song-khlong#flags" className="btn btn-secondary btn-sm">
            เกณฑ์และระดับน้ำรายสะพาน
          </Link>
        </div>
      </div>
    </section>
  );
}
