"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { Invite, StaffMember, StaffRole } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Card, Input, Select, Spinner } from "@/components/ui";

const ROLE: Record<StaffRole, string> = { owner: "مالك", doctor: "دكتور", receptionist: "سكرتارية" };

export function StaffSection() {
  const { clinic, userId } = useStaff();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"receptionist" | "doctor">("receptionist");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    const [s, i] = await Promise.all([
      supabase.from("staff").select("clinic_id, user_id, role, display_name").eq("clinic_id", clinic.id).order("created_at"),
      supabase.from("clinic_invites").select("id, email, role, accepted_at, created_at").eq("clinic_id", clinic.id).is("accepted_at", null).order("created_at"),
    ]);
    if (s.error || i.error) return setError(errorMessage(s.error ?? i.error));
    setStaff((s.data ?? []) as StaffMember[]);
    setInvites((i.data ?? []) as Invite[]);
  }, [clinic.id]);
  useEffect(() => void load(), [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return setError("الإيميل غير صحيح.");
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await getBrowserClient().from("clinic_invites").insert({ clinic_id: clinic.id, email: value, role, invited_by: userId });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEmail("");
    setInfo(`تمام. خلّي ${value} يعمل حساب (أو يسجل دخول) من ${window.location.origin}/signup بنفس الإيميل، وهيدخل على العيادة على طول.`);
    await load();
  }

  async function removeInvite(id: string) {
    const { error } = await getBrowserClient().from("clinic_invites").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  async function removeStaff(m: StaffMember) {
    if (!window.confirm(`حذف ${m.display_name ?? "العضو"} من العيادة؟`)) return;
    const { error } = await getBrowserClient().from("staff").delete().eq("clinic_id", clinic.id).eq("user_id", m.user_id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  async function changeRole(m: StaffMember, next: StaffRole) {
    const { error } = await getBrowserClient().from("staff").update({ role: next }).eq("clinic_id", clinic.id).eq("user_id", m.user_id);
    if (error) setError(errorMessage(error));
    await load();
  }

  return (
    <Card>
      <h2 className="mb-4 font-bold">فريق العيادة</h2>
      {staff === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <ul className="space-y-2">
          {staff.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold">{m.display_name ?? "—"}</span>
              {m.user_id === userId && <span className="text-xs text-slate-500">(انت)</span>}
              <Select className="ms-auto w-auto py-1" value={m.role} onChange={(e) => changeRole(m, e.target.value as StaffRole)} aria-label="الدور">
                {(Object.keys(ROLE) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
              </Select>
              {m.user_id !== userId && <Button size="sm" variant="danger" onClick={() => removeStaff(m)}>حذف</Button>}
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm">
              <span className="ltr">{i.email}</span>
              <span className="text-xs text-amber-700">دعوة مستنية · {ROLE[i.role]}</span>
              <Button size="sm" variant="ghost" className="ms-auto" onClick={() => removeInvite(i.id)}>إلغاء الدعوة</Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={invite} className="mt-4 flex flex-wrap gap-2">
        <Input type="email" dir="ltr" placeholder="email@example.com" className="min-w-0 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="إيميل العضو" />
        <Select className="w-auto" value={role} onChange={(e) => setRole(e.target.value as "receptionist" | "doctor")} aria-label="الدور">
          <option value="receptionist">سكرتارية</option>
          <option value="doctor">دكتور</option>
        </Select>
        <Button type="submit" loading={busy}>دعوة</Button>
      </form>
      {info && <div className="mt-3"><Alert kind="success">{info}</Alert></div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}
