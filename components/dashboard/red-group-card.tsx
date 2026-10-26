import { RED_GROUP_LABELS, RED_GROUP_NO, RED_GROUP_RULES, RED_GROUPS, type RedGroup, type RedGroupTally } from "@/domain/vulnerable/red-group";

const nf = (value: number) => value.toLocaleString("th-TH");

const GROUP_HINT: Record<RedGroup, string> = {
  BEDRIDDEN: "ทุกคน · ระบุบ้านที่ต้องขนอุปกรณ์การแพทย์",
  DIALYSIS: "ต้องฟอกไตตามนัด",
  MATERNAL_NEWBORN: `ครรภ์ ≥ ${RED_GROUP_RULES.nearTermWeeks} สัปดาห์ · ทารก ≤ ${RED_GROUP_RULES.newbornMaxMonths} เดือน`,
  ELDERLY_BEDRIDDEN: `อายุ ${RED_GROUP_RULES.elderlyAge}+ ที่ติดเตียง`,
};

/**
 * เมนูลัด "กลุ่มเปราะบางสีแดง" บนหน้าแรกหลังเข้าระบบ (docs/42)
 * ตัวเลขรวมเท่านั้น — รายชื่ออยู่ในไฟล์ดาวน์โหลด (server ตรวจสิทธิ์ + ขอบเขต + Audit ทุกครั้ง)
 * สีแดงใช้ได้ที่นี่เพราะเป็นกลุ่มวิกฤตจริง (กฎ red = Critical)
 */
export function RedGroupCard({
  tally,
  communityCount,
  isGlobalScope,
  canOpenMap,
}: {
  tally: RedGroupTally;
  communityCount: number;
  isGlobalScope: boolean;
  canOpenMap: boolean;
}) {
  const noCommunity = !isGlobalScope && communityCount === 0;
  return (
    <section className="card overflow-hidden border-l-4 border-l-red-600 animate-rise" aria-labelledby="red-group-title">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div className="min-w-0">
          <p className="eyebrow text-red-700">เมนูลัด</p>
          <h2 id="red-group-title" className="mt-1 text-lg font-bold text-slate-900">
            กลุ่มเปราะบางสีแดง
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            ต้องเคลื่อนย้ายไปจุดอพยพเมื่อได้รับสัญญาณ เช่น ธงส้ม · นับเฉพาะแบบสอบถามที่ตรวจแล้ว
            ไม่รวมคนที่บันทึกว่าเสียชีวิต/ย้ายออก ·{" "}
            {isGlobalScope ? "ทุกชุมชน" : `เฉพาะชุมชนที่คุณดูแล (${nf(communityCount)} ชุมชน)`}
          </p>
        </div>
        {noCommunity ? null : (
          <div className="flex flex-wrap gap-2">
            {/* ลิงก์ธรรมดา — route ตรวจสิทธิ์/ขอบเขตเองทุกครั้ง การซ่อนปุ่มไม่ใช่การอนุญาต */}
            <a href="/red-group/export" download className="btn btn-accent btn-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ดาวน์โหลดรายชื่อ (Excel)
            </a>
            {canOpenMap ? (
              <a href="/map?red=on" className="btn btn-secondary btn-md">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" strokeLinejoin="round" />
                  <circle cx="12" cy="11" r="2.2" />
                </svg>
                ดูหมุดบนแผนที่
              </a>
            ) : null}
          </div>
        )}
      </div>

      {noCommunity ? (
        <p className="border-t-2 border-slate-100 px-6 py-5 text-sm font-semibold text-sun-900">
          บัญชีนี้ยังไม่ได้กำหนดชุมชนที่ดูแล จึงยังไม่เห็นรายชื่อ — ติดต่อผู้ดูแลระบบให้กำหนดชุมชน
        </p>
      ) : (
        <div className="border-t-2 border-slate-100 bg-mist/60 px-5 py-4 md:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {RED_GROUPS.map((group) => {
              const count = tally.byGroup[group];
              return (
                <div key={group} className="rounded-xl border-2 border-slate-100 bg-white px-4 py-3">
                  <p className="text-xs font-bold text-slate-600">
                    {RED_GROUP_NO[group]}. {RED_GROUP_LABELS[group]}
                  </p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${count > 0 ? "text-red-700" : "text-slate-300"}`}>
                    {nf(count)} <span className="text-xs font-semibold text-slate-400">คน</span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{GROUP_HINT[group]}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            รวม <b className="tabular-nums text-slate-900">{nf(tally.people)}</b> คน จาก{" "}
            <b className="tabular-nums text-slate-900">{nf(tally.households)}</b> หลัง
            {tally.needsCheck > 0 ? (
              <>
                {" "}· <span className="font-semibold text-sun-800">ควรโทรยืนยัน {nf(tally.needsCheck)} คน</span>{" "}
                (พบจากข้อความในกระดาษหรืออ่านอายุไม่ได้)
              </>
            ) : null}
            {" "}· หนึ่งคนอยู่ได้หลายกลุ่ม ยอดรายกลุ่มจึงรวมเกินจำนวนคนได้
          </p>
        </div>
      )}
    </section>
  );
}
