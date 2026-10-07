import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-bold">العيادة دي مش موجودة</h1>
      <p className="mt-2 text-slate-500">اتأكد من الرابط، أو اسأل العيادة عن رابط الحجز الصحيح.</p>
      <Link href="/" className="mt-6 inline-block text-brand-700 underline">الصفحة الرئيسية</Link>
    </main>
  );
}
