import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicClient } from "@/lib/supabase/public";
import type { PublicClinic } from "@/lib/types";
import { BookingFlow } from "./BookingFlow";

export const dynamic = "force-dynamic";

const loadClinic = cache(async (slug: string) => {
  const { data, error } = await getPublicClient().rpc("public_get_clinic", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data as PublicClinic | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const clinic = await loadClinic((await params).slug);
  if (!clinic) return { title: "العيادة غير موجودة" };
  return {
    title: `احجز في ${clinic.name}`,
    description: [clinic.doctor_name, clinic.specialty, clinic.address].filter(Boolean).join(" · "),
  };
}

export default async function ClinicPage({ params }: { params: Promise<{ slug: string }> }) {
  const clinic = await loadClinic((await params).slug);
  if (!clinic) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 rounded-2xl bg-gradient-to-l from-brand-700 to-brand-500 p-6 text-white shadow">
        <h1 className="text-2xl font-extrabold">{clinic.name}</h1>
        {(clinic.doctor_name || clinic.specialty) && (
          <p className="mt-1 text-brand-50">{[clinic.doctor_name, clinic.specialty].filter(Boolean).join(" — ")}</p>
        )}
        <div className="mt-3 space-y-1 text-sm text-brand-50/90">
          {clinic.address && <p>📍 {clinic.address}</p>}
          {clinic.phone && (
            <p>
              📞 <a className="ltr underline" href={`tel:${clinic.phone}`}>{clinic.phone}</a>
            </p>
          )}
        </div>
        {clinic.about && <p className="mt-3 whitespace-pre-line text-sm text-white/90">{clinic.about}</p>}
      </header>

      {clinic.services.length === 0 || clinic.working_days.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
          <p className="font-semibold">الحجز الأونلاين مش متاح حاليًا.</p>
          {clinic.phone && <p className="mt-1 text-sm text-slate-500">للحجز اتصل على <span className="ltr">{clinic.phone}</span></p>}
        </div>
      ) : (
        <BookingFlow clinic={clinic} />
      )}

      <p className="mt-8 text-center text-xs text-slate-400">بيانات حجزك بتوصل للعيادة بس.</p>
    </main>
  );
}
