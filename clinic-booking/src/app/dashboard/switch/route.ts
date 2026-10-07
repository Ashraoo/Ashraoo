import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { ACTIVE_CLINIC_COOKIE } from "@/lib/staff-context";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const clinicId = String(form.get("clinic_id") ?? "");
  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  // Only remember clinics the user actually belongs to (RLS limits the lookup).
  const { data } = await supabase.from("staff").select("clinic_id").eq("user_id", user.id).eq("clinic_id", clinicId).maybeSingle();
  if (data) {
    response.cookies.set(ACTIVE_CLINIC_COOKIE, clinicId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}
