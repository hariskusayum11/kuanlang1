import type { NextConfig } from "next";

// ตั้งเขตเวลาเป็นเวลาประเทศไทยก่อน Next/แอปใช้ Date ใด ๆ
// (ถ้าไม่มี หน้าต่างๆ ที่ render ฝั่ง server จะแสดงเวลา UTC อ่อนไป 7 ชม.
// ครอบคลุมทั้ง dev บน Windows และ prod ใน Docker)
process.env.TZ = "Asia/Bangkok";

const nextConfig: NextConfig = {};

export default nextConfig;
