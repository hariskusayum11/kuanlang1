import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { APP_NAME, APP_DESCRIPTION_TH } from "@/lib/app-config";
import "./globals.css";

// ฟอนต์ระดับ enterprise — self-host ตอน build (ไม่มี runtime request ออกภายนอก)
const ibmThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_DESCRIPTION_TH}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION_TH,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={ibmThai.variable}>
      {/* suppressHydrationWarning: ส่วนขยายเบราว์เซอร์ (เช่น Grammarly) เติม data-gr-* ลง body
          หลัง SSR ทำให้ attribute ฝั่ง client ไม่ตรง server — ไม่ใช่บั๊กแอป ปิด warning เฉพาะจุดนี้ */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
