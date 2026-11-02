// เกณฑ์ธงเตือนภัยของกลุ่มสองคลองควนลัง — ข้อมูลอ้างอิง (หน้าต้นแบบ /lab/song-khlong)
// -----------------------------------------------------------------------------
// ที่มา: "แนวปฏิบัติระดับชุมชนเพื่อรับมืออุทกภัย กลุ่มสองคลองควนลัง" ข้อ 5 และรูปความหมายของธง
// ที่ https://hatyaicityclimate.org/zone/kuanlang (CC BY-SA 3.0) · คัดลอกเมื่อ 2026-11-02
// ต้นฉบับระบุว่า "อาจมีการปรับเปลี่ยนในแต่ละปี" — ถ้านำไปใช้จริงควรย้ายไปเก็บในฐานข้อมูลพร้อมปีที่ใช้
//
// ⚠️ ระบบนี้ "ไม่คำนวณสีธง" จากข้อมูลนี้: เกณฑ์วัดจากระยะผิวน้ำถึงท้องสะพาน (ดูผ่าน CCTV)
// แต่ข้อมูลสถานีของ ThaiWater เป็น ม.รทก. เทียบตลิ่ง — ต้องได้ระดับท้องสะพาน (ม.รทก.) ก่อน

export type FlagLevel = "GREEN" | "YELLOW" | "RED" | "RED_SIREN";

export const COMMUNITY_FLAG_SOURCE = {
  publisher: "กลุ่มสองคลองควนลัง · Hatyai City Climate",
  url: "https://hatyaicityclimate.org/zone/kuanlang",
  license: "CC BY-SA 3.0",
  copiedOn: "2026-11-02",
} as const;

export const COMMUNITY_FLAGS: ReadonlyArray<{ level: FlagLevel; title: string; action: string }> = [
  { level: "GREEN", title: "สถานการณ์ปกติ", action: "ยังไม่มีผลกระทบในพื้นที่ ติดตามข้อมูลต่อเนื่อง" },
  { level: "YELLOW", title: "เฝ้าระวัง", action: "ติดตามข้อมูลอย่างใกล้ชิด เตรียมพร้อม 100% อพยพผู้ป่วยติดเตียงและผู้ฟอกไต" },
  { level: "RED", title: "ฝนตกหนัก เกิดอุทกภัย", action: "อพยพประชาชนกลุ่มเปราะบางและกลุ่มเสี่ยง" },
  { level: "RED_SIREN", title: "เกิดอุทกภัย", action: "ประชาชนอยู่ในที่สูง ไม่ควรออกจากพื้นที่" },
];

/** เกณฑ์ยกธง — ระยะผิวน้ำต่ำกว่าท้องสะพาน (ม.) · `0` = น้ำถึง/จมสะพาน */
export const FLAG_BRIDGE_CRITERIA: ReadonlyArray<{ bridge: string; yellowBelowDeckM: number; redBelowDeckM: number }> = [
  { bridge: "สะพานบ้านคลองหวะ", yellowBelowDeckM: 4, redBelowDeckM: 3 },
  { bridge: "สะพานม่วงก็อง", yellowBelowDeckM: 1, redBelowDeckM: 0 },
  { bridge: "สะพานบางศาลา", yellowBelowDeckM: 3, redBelowDeckM: 2 },
];
