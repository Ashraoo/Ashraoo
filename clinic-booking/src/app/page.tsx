import Link from "next/link";

const FEATURES = [
  { icon: "🔗", title: "رابط حجز خاص بيك", text: "حطه في البايو أو ابعته على واتساب، والمريض يحجز في أقل من دقيقة من غير ما يكلمك." },
  { icon: "🗓️", title: "داشبورد للسكرتارية", text: "مواعيد النهارده، دور الانتظار، الحجز بالتليفون، والكشف من غير ميعاد، وتسجيل الدفع." },
  { icon: "💬", title: "تذكيرات واتساب تلقائية", text: "تأكيد للحجز، وتذكير قبل الميعاد بيوم وبساعتين، فالمرضى اللي بيغيبوا يقلوا." },
  { icon: "🔒", title: "بيانات آمنة", text: "كل عيادة شايفة بياناتها بس، والمريض مش بيشوف أي بيانات غير حجزه." },
];

export default function Home() {
  return (
    <main>
      <section className="bg-gradient-to-bl from-brand-700 to-brand-500 text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <p className="text-brand-100">عيادتي</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">
            حجز مواعيد العيادة أونلاين، وتذكير المرضى على واتساب
          </h1>
          <p className="mt-4 max-w-xl text-lg text-brand-50">
            قلل المرضى اللي بيحجزوا ومابيجوش، ووفر وقت السكرتارية على التليفون.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-white px-5 py-3 font-bold text-brand-700 shadow hover:bg-brand-50">
              ابدأ ببلاش
            </Link>
            <Link href="/login" className="rounded-xl px-5 py-3 font-bold text-white ring-1 ring-white/60 hover:bg-white/10">
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-12 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="text-3xl">{f.icon}</div>
            <h2 className="mt-3 text-lg font-bold">{f.title}</h2>
            <p className="mt-1 text-slate-600">{f.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
