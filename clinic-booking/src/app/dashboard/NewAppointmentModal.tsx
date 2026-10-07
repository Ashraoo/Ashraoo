"use client";

import { useCallback, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { Service } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { dateIn, formatMoney, scalarRows, zonedToUtc } from "@/lib/time";
import { SlotPicker } from "@/components/SlotPicker";
import { Alert, Button, Field, Input, Modal, Select, Textarea, cx } from "@/components/ui";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface Props {
  services: Service[];
  defaultDate: string;
  today: string;
  onClose: () => void;
  onCreated: (date: string) => void;
}

export function NewAppointmentModal({ services, defaultDate, today, onClose, onCreated }: Props) {
  const { clinic } = useStaff();
  const tz = clinic.timezone;
  const [source, setSource] = useState<"phone" | "walk_in">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [knownPatient, setKnownPatient] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [slot, setSlot] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [customDate, setCustomDate] = useState(defaultDate);
  const [customTime, setCustomTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(
    async (date: string) => {
      if (!serviceId) return [];
      const { data, error } = await getBrowserClient().rpc("staff_available_slots", {
        p_clinic_id: clinic.id,
        p_service_id: serviceId,
        p_date: date,
      });
      if (error) throw error;
      return scalarRows<string>(data, "staff_available_slots");
    },
    [clinic.id, serviceId],
  );

  async function lookupPatient() {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const { data } = await getBrowserClient()
      .from("patients")
      .select("full_name")
      .eq("clinic_id", clinic.id)
      .eq("phone", normalized)
      .maybeSingle();
    if (data) {
      setKnownPatient(true);
      if (!name.trim()) setName(data.full_name);
    } else {
      setKnownPatient(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalizePhone(phone)) return setError("رقم الموبايل غير صحيح.");
    if (name.trim().length < 2) return setError("اكتب اسم المريض.");
    if (!serviceId) return setError("اختار الخدمة.");

    let startsAt: string | null = null;
    if (source === "phone") {
      if (custom) {
        if (!customDate || !customTime) return setError("حدد اليوم والساعة.");
        startsAt = zonedToUtc(customDate, customTime, tz).toISOString();
      } else {
        if (!slot) return setError("اختار ميعاد.");
        startsAt = slot;
      }
    }

    setBusy(true);
    const { data, error } = await getBrowserClient().rpc("staff_create_appointment", {
      p_clinic_id: clinic.id,
      p_full_name: name,
      p_phone: phone,
      p_service_id: serviceId,
      p_source: source,
      p_starts_at: startsAt,
      p_notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onCreated(dateIn((data as { starts_at: string }).starts_at, tz));
  }

  return (
    <Modal open onClose={onClose} title="حجز جديد">
      {services.length === 0 ? (
        <Alert kind="info">ضيف خدمة واحدة على الأقل من الإعدادات الأول.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(["phone", "walk_in"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cx("rounded-lg py-2 text-sm font-semibold", source === s ? "bg-white shadow-sm" : "text-slate-600")}
              >
                {s === "phone" ? "حجز بميعاد (تليفون)" : "كشف دلوقتي (بدون ميعاد)"}
              </button>
            ))}
          </div>

          <Field label="رقم الموبايل" htmlFor="np-phone" hint={knownPatient ? "✓ مريض مسجل قبل كده" : undefined}>
            <Input id="np-phone" type="tel" dir="ltr" placeholder="01012345678" value={phone}
              onChange={(e) => { setPhone(e.target.value); setKnownPatient(false); }} onBlur={lookupPatient} autoFocus />
          </Field>
          <Field label="اسم المريض" htmlFor="np-name">
            <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="الخدمة" htmlFor="np-service">
            <Select id="np-service" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null); }}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.duration_minutes} دقيقة{Number(s.price) > 0 ? ` — ${formatMoney(s.price)}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {source === "phone" && (
            <div className="space-y-3">
              {custom ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="اليوم" htmlFor="np-date">
                    <Input id="np-date" type="date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
                  </Field>
                  <Field label="الساعة" htmlFor="np-time">
                    <Input id="np-time" type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <SlotPicker
                  today={today}
                  windowDays={clinic.booking_window_days}
                  workingDays={ALL_DAYS}
                  timeZone={tz}
                  fetchSlots={fetchSlots}
                  value={slot}
                  onChange={setSlot}
                  initialDate={defaultDate}
                />
              )}
              <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setCustom((c) => !c)}>
                {custom ? "← اختار من المواعيد المتاحة" : "ميعاد خارج المواعيد المتاحة؟"}
              </button>
            </div>
          )}

          <Field label="ملاحظات (اختياري)" htmlFor="np-notes">
            <Textarea id="np-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} className="w-full">
            {source === "phone" ? "تأكيد الحجز" : "إضافة لدور الانتظار"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
