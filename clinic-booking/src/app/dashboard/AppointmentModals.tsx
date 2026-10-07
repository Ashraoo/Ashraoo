"use client";

import { useCallback, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { ScheduleRow } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { dateIn, formatDateLong, formatTime, scalarRows, zonedToUtc } from "@/lib/time";
import { SlotPicker } from "@/components/SlotPicker";
import { Alert, Button, Field, Input, Modal } from "@/components/ui";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function CancelModal({ row, onClose, onDone }: { row: ScheduleRow; onClose: () => void; onDone: () => void }) {
  const { clinic } = useStaff();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient()
      .from("appointments")
      .update({ status: "cancelled", cancel_reason: reason.trim() || "ألغته العيادة" })
      .eq("id", row.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  return (
    <Modal open onClose={onClose} title="إلغاء الحجز">
      <p className="text-slate-600">
        إلغاء حجز <b>{row.contact_name}</b> — {formatDateLong(row.starts_at, clinic.timezone)} {formatTime(row.starts_at, clinic.timezone)}.
        {clinic.reminders_enabled && row.source !== "walk_in" && " هيوصل للمريض رسالة بالإلغاء على واتساب."}
      </p>
      <div className="mt-4">
        <Field label="السبب (اختياري)" htmlFor="cancel-reason">
          <Input id="cancel-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="danger" loading={busy} onClick={confirm}>إلغاء الحجز</Button>
        <Button variant="secondary" onClick={onClose}>رجوع</Button>
      </div>
    </Modal>
  );
}

export function RescheduleModal({ row, today, onClose, onDone }: { row: ScheduleRow; today: string; onClose: () => void; onDone: () => void }) {
  const { clinic } = useStaff();
  const tz = clinic.timezone;
  const [slot, setSlot] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [customDate, setCustomDate] = useState(dateIn(row.starts_at, tz));
  const [customTime, setCustomTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(
    async (date: string) => {
      if (!row.service_id) return [];
      const { data, error } = await getBrowserClient().rpc("staff_available_slots", {
        p_clinic_id: clinic.id,
        p_service_id: row.service_id,
        p_date: date,
      });
      if (error) throw error;
      return scalarRows<string>(data, "staff_available_slots");
    },
    [clinic.id, row.service_id],
  );

  async function save() {
    let startsAt: string;
    if (custom) {
      if (!customDate || !customTime) return setError("حدد اليوم والساعة.");
      startsAt = zonedToUtc(customDate, customTime, tz).toISOString();
    } else {
      if (!slot) return setError("اختار ميعاد.");
      startsAt = slot;
    }
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient().from("appointments").update({ starts_at: startsAt }).eq("id", row.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  return (
    <Modal open onClose={onClose} title={`تغيير ميعاد ${row.contact_name}`}>
      <p className="mb-4 text-sm text-slate-600">الميعاد الحالي: {formatDateLong(row.starts_at, tz)} {formatTime(row.starts_at, tz)}</p>
      {custom ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="اليوم" htmlFor="rs-date">
            <Input id="rs-date" type="date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          </Field>
          <Field label="الساعة" htmlFor="rs-time">
            <Input id="rs-time" type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
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
          initialDate={dateIn(row.starts_at, tz)}
        />
      )}
      <button type="button" className="mt-3 text-sm font-semibold text-brand-700" onClick={() => setCustom((c) => !c)}>
        {custom ? "← اختار من المواعيد المتاحة" : "ميعاد خارج المواعيد المتاحة؟"}
      </button>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Button className="mt-5 w-full" loading={busy} onClick={save}>حفظ الميعاد الجديد</Button>
    </Modal>
  );
}
