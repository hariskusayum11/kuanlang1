// Entry Console — โหมดเต็มจอ ไร้ sidebar (โฟกัสความเร็วในการคีย์ต่อใบ)
// การตรวจสิทธิ์อยู่ที่ page (server) — layout นี้จัดหน้าตาเท่านั้น
export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100">{children}</div>;
}
