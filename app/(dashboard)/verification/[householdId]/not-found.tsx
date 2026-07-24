import Link from "next/link";

export default function ReviewNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
          <path d="M12 9v4M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="mt-5 text-xl font-bold text-slate-900">ไม่พบใบนี้</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
        ใบนี้อาจไม่มีอยู่ หรืออยู่นอกขอบเขตชุมชนที่คุณเข้าถึงได้
      </p>
      <Link href="/verification" className="btn btn-primary btn-md mt-7">
        กลับคิวตรวจสอบ
      </Link>
    </div>
  );
}
