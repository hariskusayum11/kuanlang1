import type { Metadata } from "next";
import { APP_NAME, APP_DESCRIPTION_TH } from "@/lib/app-config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_DESCRIPTION_TH}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION_TH,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
