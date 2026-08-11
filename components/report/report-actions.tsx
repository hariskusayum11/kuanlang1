"use client";

export function ReportActions({ exportHref }: { exportHref: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={exportHref} className="btn btn-accent btn-md">ส่งออก CSV</a>
      <button type="button" onClick={() => window.print()} className="btn btn-secondary btn-md">พิมพ์ / บันทึก PDF</button>
    </div>
  );
}

