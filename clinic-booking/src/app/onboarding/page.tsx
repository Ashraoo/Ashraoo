import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "إنشاء العيادة" };

export default async function OnboardingPage() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  await supabase.rpc("accept_invites");
  const { count } = await supabase.from("staff").select("clinic_id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) > 0) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-extrabold">أهلًا بيك 👋</h1>
      <p className="mt-1 text-slate-600">خلينا نعمل صفحة الحجز بتاعة عيادتك.</p>
      <p className="mt-1 text-sm text-slate-500">
        لو انت سكرتارية ومستني دعوة من الدكتور، اطلب منه يبعت الدعوة على <span className="ltr font-semibold">{user.email}</span> وبعدين اعمل refresh للصفحة.
      </p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </main>
  );
}
