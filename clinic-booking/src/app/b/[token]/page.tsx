import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicClient } from "@/lib/supabase/public";
import type { PublicBooking } from "@/lib/types";
import { ManageBooking } from "./ManageBooking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "حجزك", robots: { index: false, follow: false } };

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f]{40}$/.test(token)) notFound();

  const { data, error } = await getPublicClient().rpc("public_get_booking", { p_token: token });
  if (error) throw new Error(error.message);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      <ManageBooking token={token} initial={data as PublicBooking} justBooked={isNew === "1"} />
    </main>
  );
}
