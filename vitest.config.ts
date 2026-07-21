import { defineConfig } from "vitest/config";

// Config หลัก = unit tests เท่านั้น (รันขนานตาม default ได้ ไม่แตะ DB)
// integration tests แยกไปที่ vitest.integration.config.ts ซึ่งบังคับรันทีละไฟล์
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
