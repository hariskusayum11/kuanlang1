"use client";

import { deleteImportantSiteAction } from "@/lib/geo/important-site-actions";

export function DeleteImportantSiteForm({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteImportantSiteAction}
      className="mt-3 border-t border-slate-100 pt-3"
      onSubmit={(event) => {
        if (!window.confirm(`ยืนยันลบ “${name}” ออกจากระบบถาวร?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700">ลบจุดนี้ถาวร</button>
    </form>
  );
}
