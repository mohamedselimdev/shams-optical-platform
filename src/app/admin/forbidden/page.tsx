import Link from "next/link";
import { PERMISSIONS, isPermission } from "@/server/rbac/permissions";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="num font-display text-5xl font-bold text-sun-500">403</p>
        <h1 className="mt-3 font-display text-xl font-semibold">ليس لديك صلاحية للوصول</h1>
        {p && isPermission(p) ? <p className="mt-2 text-sm text-ink-muted">الصلاحية المطلوبة: {PERMISSIONS[p]}</p> : null}
        <Link href="/admin" className="mt-6 inline-block text-sm text-sun-700 underline">العودة للوحة التحكم</Link>
      </div>
    </main>
  );
}
