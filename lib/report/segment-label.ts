// แปลง segment → ป้ายชื่อภาษาไทยที่อ่านง่าย (typed segment ต้อง lookup master data)
import { prisma } from "../prisma";
import type { SegmentDescriptor } from "./segments";

const VEHICLE_LABEL: Record<string, string> = {
  CAR: "รถยนต์",
  MOTORCYCLE: "มอเตอร์ไซค์",
  BOAT: "เรือ",
  OTHER: "อื่น ๆ",
};

async function lookupTypeName(prefix: string, id: string): Promise<string | null> {
  switch (prefix) {
    case "assistance":
      return (await prisma.assistanceNeedType.findUnique({ where: { id }, select: { nameTh: true } }))?.nameTh ?? null;
    case "alert":
      return (await prisma.alertChannel.findUnique({ where: { id }, select: { nameTh: true } }))?.nameTh ?? null;
    case "skill":
      return (await prisma.volunteerSkillType.findUnique({ where: { id }, select: { nameTh: true } }))?.nameTh ?? null;
    case "vuln":
      return (await prisma.vulnerabilityType.findUnique({ where: { id }, select: { nameTh: true } }))?.nameTh ?? null;
    default:
      return null;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  assistance: "ความช่วยเหลือ",
  alert: "ช่องทางข่าว",
  skill: "ทักษะอาสา",
  vuln: "ความเปราะบาง",
};

export async function resolveSegmentLabel(seg: SegmentDescriptor): Promise<string> {
  const sep = seg.id.indexOf(":");
  if (sep <= 0) return seg.label;
  const prefix = seg.id.slice(0, sep);
  const value = seg.id.slice(sep + 1);
  if (prefix === "triage") return seg.label;
  if (prefix === "vehicle") return `ยานพาหนะ: ${VEHICLE_LABEL[value] ?? value}`;
  const nameTh = await lookupTypeName(prefix, value);
  const category = CATEGORY_LABEL[prefix] ?? seg.label;
  return nameTh ? `${category}: ${nameTh}` : seg.label;
}
