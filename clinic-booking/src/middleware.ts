import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only routes that need the staff session; public booking pages stay fast.
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login", "/signup", "/auth/:path*"],
};
