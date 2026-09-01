"use client";

export function ReportActions({
  exportHref,
  vulnerableHref,
  personalHref,
}: {
  exportHref: string;
  vulnerableHref?: string;
  personalHref?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={exportHref} className="btn btn-accent btn-md">ส่งออก CSV</a>
      {vulnerableHref ? (
        <a href={vulnerableHref} className="btn btn-primary btn-md">ดาวน์โหลด Excel กลุ่มเปราะบาง</a>
      ) : null}
      {personalHref ? (
        <a href={personalHref} className="btn btn-primary btn-md">Excel รายบุคคลทุกหมวด</a>
      ) : null}
      <button type="button" onClick={() => window.print()} className="btn btn-secondary btn-md">พิมพ์ / บันทึก PDF</button>
    </div>
  );
}
