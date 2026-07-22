import Link from "next/link";

export default function EntrySheetNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md animate-rise rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
            <path d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1z" strokeLinejoin="round" />
            <path d="M12 9v4M12 16h.01" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">ไม่พบใบงานนี้</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          ใบงานนี้อาจไม่มีอยู่ หรืออยู่นอกขอบเขตชุมชนที่คุณเข้าถึงได้
        </p>
        <Link href="/surveys" className="btn btn-primary btn-md mt-7">
          กลับหน้าคีย์แบบสอบถาม
        </Link>
      </div>
    </main>
  );
}
