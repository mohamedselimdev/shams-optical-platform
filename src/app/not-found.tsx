import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="font-display text-6xl font-bold text-sun-400">٤٠٤</p>
      <h1 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h1>
      <Link href="/" className="mt-6 rounded-md bg-ink px-4 py-2 text-sm text-surface">العودة للرئيسية</Link>
    </main>
  );
}
