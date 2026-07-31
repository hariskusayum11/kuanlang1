import Link from "next/link";
import { EmptyState } from "@/components/layout/page-hero";

export default function ReviewNotFound() {
  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <div className="card">
        <EmptyState
          mood="sleep"
          tone="sun"
          title="ไม่พบใบนี้"
          description="ใบนี้อาจไม่มีอยู่ หรืออยู่นอกขอบเขตชุมชนที่คุณเข้าถึงได้"
          action={
            <Link href="/verification" className="btn btn-primary btn-md">
              กลับคิวตรวจสอบ
            </Link>
          }
        />
      </div>
    </div>
  );
}
