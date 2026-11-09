// เนื้อหาป๊อปอัปของช่องความรุนแรงน้ำท่วม (docs/39) — ใช้ร่วมกันระหว่างแผนที่หน้าแรก (Leaflet) และหน้าต้นแบบ (MapLibre)
// ค่าทั้งหมดเป็นตัวเลขสรุปของช่องที่ server คำนวณแล้ว (ไม่มีข้อความจากผู้ใช้) จึงประกอบเป็น HTML ได้
import { GRID_MIN_HOUSEHOLDS, type FloodGridCell } from "@/domain/geo/flood-grid";

export function gridPopup(cell: FloodGridCell): string {
  const depth = cell.avgDepthCm == null ? "ไม่มีคำตอบ" : `${(cell.avgDepthCm / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ม. <span class="text-slate-400">(ตอบ ${cell.depthAnswered} หลัง)</span>`;
  const floor = cell.belowRoadPercent == null ? "ไม่มีคำตอบ" : `${cell.belowRoadPercent}% <span class="text-slate-400">(ตอบ ${cell.floorAnswered} หลัง)</span>`;
  const duration = cell.avgDurationDays == null ? "ไม่มีคำตอบ" : `${cell.avgDurationDays.toLocaleString("th-TH")} วัน <span class="text-slate-400">(ตอบ ${cell.durationAnswered} หลัง)</span>`;
  return `<div class="w-[230px] font-sans text-xs leading-relaxed text-slate-700">
    <div class="font-bold text-ink-900">พื้นที่ประมาณ 200 × 200 ม.</div>
    <div class="text-slate-500">ครัวเรือนที่สำรวจในช่องนี้ ${cell.households.toLocaleString("th-TH")} หลัง</div>
    <div class="mt-1.5"><span class="font-semibold text-slate-500">ระดับน้ำเฉลี่ยที่เคยท่วม:</span> ${depth}</div>
    <div><span class="font-semibold text-slate-500">บ้านพื้นต่ำกว่าถนน:</span> ${floor}</div>
    <div><span class="font-semibold text-slate-500">ท่วมนานเฉลี่ย:</span> ${duration}</div>
    <div class="mt-1.5 text-[11px] text-slate-400">ค่าเฉลี่ยจากคำบอกเล่าของครัวเรือน ไม่ใช่แบบจำลองน้ำท่วมทางวิศวกรรม · ไม่แสดงช่องที่มีน้อยกว่า ${GRID_MIN_HOUSEHOLDS} หลัง</div>
  </div>`;
}
