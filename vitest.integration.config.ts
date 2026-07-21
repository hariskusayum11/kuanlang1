import { defineConfig } from "vitest/config";

// Integration tests ทุกไฟล์ใช้ Development DB ชุดเดียวกัน — ต้องรันทีละไฟล์
// (fileParallelism ระดับ root config เท่านั้นที่บังคับได้จริงใน vitest 2.x —
// ตั้งใน workspace project ไม่ถูกบังคับ ทำให้ fixture ข้ามไฟล์ชนกัน เช่น
// community fixtures ของ db.test.ts ทำให้ global counts ใน rbac.test.ts เพี้ยน)
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
});
