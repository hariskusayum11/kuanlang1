import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";

export default function EntrySheetNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-8 text-center shadow-lg">
        <div className="animate-drop-in">
          <Mascot role="verify" mood="sleep" tone="sun" motion="float" size={104} decorative className="mx-auto" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">ไม่พบใบงานนี้</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          ใบงานนี้อาจไม่มีอยู่ หรืออยู่นอกขอบเขตชุมชนที่คุณเข้าถึงได้
        </p>
        <Link href="/surveys" className="btn btn-primary btn-lg mt-7">
          กลับหน้าคีย์แบบสอบถาม
        </Link>
      </div>
    </main>
  );
}
