import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import type { Clinic, StaffRole } from "@/lib/types";

export const ACTIVE_CLINIC_COOKIE = "active_clinic";

export interface StaffContext {
  userId: string;
  email: string | null;
  role: StaffRole;
  clinic: Clinic;
  clinics: { id: string; name: string }[];
}

/** Loads the signed-in staff member and their active clinic, or redirects. */
export const getStaffContext = cache(async (): Promise<StaffContext> => {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Picks up invitations sent to this email before the user signed up.
  await supabase.rpc("accept_invites");

  const { data, error } = await supabase
    .from("staff")
    .select("role, created_at, clinic:clinics(*)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as { role: StaffRole; clinic: Clinic }[];
  if (rows.length === 0) redirect("/onboarding");

  const preferred = (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value;
  const active = rows.find((r) => r.clinic.id === preferred) ?? rows[0];

  return {
    userId: user.id,
    email: user.email ?? null,
    role: active.role,
    clinic: active.clinic,
    clinics: rows.map((r) => ({ id: r.clinic.id, name: r.clinic.name })),
  };
});
