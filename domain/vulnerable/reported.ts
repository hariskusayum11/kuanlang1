// คนเปราะบางที่หัวหน้าชุมชน/แอดมินแจ้งเพิ่มหลังการสำรวจ (docs/43) — Pure Function
// แถวเหล่านี้ไม่ได้มาจากกระดาษ จึงใช้ลำดับ (seq) ตั้งแต่ 1001 ขึ้นไป แยกจากแถวกระดาษ (1…)
// CHECK ck_vulnerable_reported_seq ในฐานข้อมูลบังคับกฎเดียวกัน

export const REPORTED_SEQ_START = 1001;

/** ลำดับถัดไปของแถวแจ้งเพิ่มในบ้านหนึ่ง — ไม่ใช้เลขซ้ำแม้แถวเก่าถูกลบไปแล้วบางแถว */
export function nextReportedSeq(existingSeqs: readonly number[]): number {
  const reported = existingSeqs.filter((seq) => seq >= REPORTED_SEQ_START);
  return reported.length === 0 ? REPORTED_SEQ_START : Math.max(...reported) + 1;
}

export function isReportedSeq(seq: number): boolean {
  return seq >= REPORTED_SEQ_START;
}

/** ป้ายแสดงที่มา — ใช้ร่วมทุกหน้าที่แสดงรายชื่อ */
export const REPORTED_LABEL = "หัวหน้าชุมชนแจ้งเพิ่ม";
