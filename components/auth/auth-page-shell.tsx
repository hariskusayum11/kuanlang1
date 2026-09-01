import type { ReactNode } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/app-config";
import { Mascot } from "@/components/brand/mascot";

export function AuthPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden band-ink px-4 py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(65% 55% at 50% 0%, rgba(37,99,235,0.5), transparent 72%)",
        }}
      />
      <div className="relative w-full max-w-md animate-rise">
        <Link href="/" className="mb-5 flex items-center justify-center gap-3 text-white">
          <Mascot role="field" mood="happy" size={62} decorative />
          <span className="text-2xl font-bold">{APP_NAME}</span>
        </Link>
        <section className="rounded-3xl bg-white p-7 shadow-lg sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
