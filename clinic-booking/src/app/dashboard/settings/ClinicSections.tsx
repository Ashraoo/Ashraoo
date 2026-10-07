"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";

function useSaveClinic() {
  const { clinic } = useStaff();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const { error } = await getBrowserClient().from("clinics").update(patch).eq("id", clinic.id);
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: errorMessage(error) });
    setMsg({ kind: "success", text: "اتحفظ ✓" });
    router.refresh(); // reload the server-provided clinic context
  }
  return { busy, msg, save };
}

export function ClinicInfoSection({ readOnly }: { readOnly: boolean }) {
  const { clinic } = useStaff();
  const { busy, msg, save } = useSaveClinic();
  const [f, setF] = useState({
    name: clinic.name,
    doctor_name: clinic.doctor_name ?? "",
    specialty: clinic.specialty ?? "",
    phone: clinic.phone ?? "",
    address: clinic.address ?? "",
    about: clinic.about ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Card>
      <h2 className="mb-4 font-bold">بيانات العيادة</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            name: f.name.trim(),
            doctor_name: f.doctor_name.trim() || null,
            specialty: f.specialty.trim() || null,
            phone: f.phone.trim() || null,
            address: f.address.trim() || null,
            about: f.about.trim() || null,
          });
        }}
      >
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم العيادة" htmlFor="ci-name"><Input id="ci-name" required minLength={2} maxLength={120} value={f.name} onChange={set("name")} /></Field>
          <Field label="اسم الدكتور" htmlFor="ci-doc"><Input id="ci-doc" maxLength={120} value={f.doctor_name} onChange={set("doctor_name")} /></Field>
          <Field label="التخصص" htmlFor="ci-spec"><Input id="ci-spec" maxLength={120} value={f.specialty} onChange={set("specialty")} /></Field>
          <Field label="التليفون" htmlFor="ci-phone"><Input id="ci-phone" dir="ltr" maxLength={30} value={f.phone} onChange={set("phone")} /></Field>
          <div className="sm:col-span-2"><Field label="العنوان" htmlFor="ci-addr"><Input id="ci-addr" maxLength={300} value={f.address} onChange={set("address")} /></Field></div>
          <div className="sm:col-span-2"><Field label="نبذة (بتظهر في صفحة الحجز)" htmlFor="ci-about"><Textarea id="ci-about" rows={3} maxLength={1000} value={f.about} onChange={set("about")} /></Field></div>
        </fieldset>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {!readOnly && <Button type="submit" loading={busy}>حفظ</Button>}
      </form>
    </Card>
  );
}

export function BookingRulesSection({ readOnly }: { readOnly: boolean }) {
  const { clinic } = useStaff();
  const { busy, msg, save } = useSaveClinic();
  const [f, setF] = useState({
    slot_interval_minutes: String(clinic.slot_interval_minutes),
    booking_window_days: String(clinic.booking_window_days),
    min_notice_minutes: String(clinic.min_notice_minutes),
    max_active_bookings_per_phone: String(clinic.max_active_bookings_per_phone),
    is_published: clinic.is_published,
    reminders_enabled: clinic.reminders_enabled,
  });
  const num = (k: "slot_interval_minutes" | "booking_window_days" | "min_notice_minutes" | "max_active_bookings_per_phone") =>
    (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Card>
      <h2 className="mb-4 font-bold">قواعد الحجز والتذكيرات</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            slot_interval_minutes: Number(f.slot_interval_minutes),
            booking_window_days: Number(f.booking_window_days),
            min_notice_minutes: Number(f.min_notice_minutes),
            max_active_bookings_per_phone: Number(f.max_active_bookings_per_phone),
            is_published: f.is_published,
            reminders_enabled: f.reminders_enabled,
          });
        }}
      >
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="المواعيد بتبدأ كل (دقيقة)" htmlFor="br-int" hint="مثلًا 15 يعني 5:00، 5:15، 5:30…">
              <Input id="br-int" type="number" min={5} max={120} required value={f.slot_interval_minutes} onChange={num("slot_interval_minutes")} />
            </Field>
            <Field label="الحجز متاح لكام يوم قدام" htmlFor="br-win">
              <Input id="br-win" type="number" min={1} max={180} required value={f.booking_window_days} onChange={num("booking_window_days")} />
            </Field>
            <Field label="أقل وقت قبل الميعاد للحجز (دقيقة)" htmlFor="br-notice">
              <Input id="br-notice" type="number" min={0} max={10080} required value={f.min_notice_minutes} onChange={num("min_notice_minutes")} />
            </Field>
            <Field label="أقصى عدد حجوزات قائمة لنفس الرقم" htmlFor="br-max">
              <Input id="br-max" type="number" min={1} max={20} required value={f.max_active_bookings_per_phone} onChange={num("max_active_bookings_per_phone")} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-600" checked={f.is_published} onChange={(e) => setF((x) => ({ ...x, is_published: e.target.checked }))} />
            الحجز الأونلاين شغال
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-600" checked={f.reminders_enabled} onChange={(e) => setF((x) => ({ ...x, reminders_enabled: e.target.checked }))} />
            إرسال تأكيد وتذكيرات واتساب للمرضى
          </label>
        </fieldset>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {!readOnly && <Button type="submit" loading={busy}>حفظ</Button>}
      </form>
    </Card>
  );
}
