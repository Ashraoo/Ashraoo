import Link from "next/link";
import { getStaffContext } from "@/lib/staff-context";
import { StaffProvider } from "@/components/StaffProvider";
import { DashboardNav } from "./DashboardNav";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { owner: "مالك", doctor: "دكتور", receptionist: "سكرتارية" } as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getStaffContext();

  return (
    <StaffProvider value={{ userId: ctx.userId, role: ctx.role, clinic: ctx.clinic }}>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/dashboard" className="text-lg font-extrabold text-brand-700">عيادتي</Link>
            {ctx.clinics.length > 1 ? (
              <form action="/dashboard/switch" method="post" className="flex items-center gap-1">
                <select name="clinic_id" defaultValue={ctx.clinic.id} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                  {ctx.clinics.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button className="rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-brand-50">تبديل</button>
              </form>
            ) : (
              <span className="text-sm font-semibold text-slate-700">{ctx.clinic.name}</span>
            )}
            <DashboardNav isOwner={ctx.role === "owner"} />
            <div className="ms-auto flex items-center gap-3 text-sm">
              <span className="hidden text-slate-500 sm:inline">{ctx.email} · {ROLE_LABEL[ctx.role]}</span>
              <form action="/auth/signout" method="post">
                <button className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100">خروج</button>
              </form>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      </div>
    </StaffProvider>
  );
}
