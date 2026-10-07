"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/client";
import type { PublicBooking } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { formatDateLong, formatMoney, formatTime, scalarRows } from "@/lib/time";
import { StatusBadge } from "@/components/status";
import { SlotPicker } from "@/components/SlotPicker";
import { Alert, Button, Card, Modal } from "@/components/ui";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function ManageBooking({ token, initial, justBooked }: { token: string; initial: PublicBooking; justBooked: boolean }) {
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(justBooked ? "تم الحجز بنجاح ✅ هيوصلك تأكيد على واتساب." : null);
  const tz = booking.clinic.timezone;

  const fetchSlots = useCallback(
    async (date: string) => {
      const { data, error } = await getBrowserClient().rpc("public_get_reschedule_slots", { p_token: token, p_date: date });
      if (error) throw error;
      return scalarRows<string>(data, "public_get_reschedule_slots");
    },
    [token],
  );

  async function cancel() {
    setBusy(true);
    setError(null);
    const { data, error } = await getBrowserClient().rpc("public_cancel_booking", { p_token: token, p_reason: null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setBooking(data as PublicBooking);
    setMode("view");
    setNotice("تم إلغاء الحجز.");
  }

  async function reschedule() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const { data, error } = await getBrowserClient().rpc("public_reschedule_booking", { p_token: token, p_starts_at: slot });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setBooking(data as PublicBooking);
    setMode("view");
    setSlot(null);
    setNotice("تم تغيير الميعاد ✅");
  }

  const active = booking.status !== "cancelled" && booking.status !== "no_show";

  return (
    <div className="space-y-4">
      {notice && <Alert kind="success">{notice}</Alert>}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">حجز رقم <span className="ltr font-mono font-bold text-slate-800">{booking.booking_ref}</span></p>
            <h1 className="mt-1 text-xl font-extrabold">{booking.clinic.name}</h1>
            {booking.clinic.doctor_name && <p className="text-slate-600">{booking.clinic.doctor_name}</p>}
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-slate-500">الميعاد</dt>
            <dd className="font-bold">{formatDateLong(booking.starts_at, tz)}</dd>
            <dd className="text-lg font-extrabold text-brand-700">{formatTime(booking.starts_at, tz)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-slate-500">الخدمة</dt>
            <dd className="font-bold">{booking.service_name ?? "—"}</dd>
            {Number(booking.price) > 0 && <dd className="text-slate-600">{formatMoney(booking.price)}</dd>}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-slate-500">باسم</dt>
            <dd className="font-bold">{booking.contact_name}</dd>
          </div>
          {booking.clinic.address && (
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">العنوان</dt>
              <dd className="font-bold">{booking.clinic.address}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {active && (
            <a href={`/b/${token}/calendar.ics`} className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50">
              📅 أضف للتقويم
            </a>
          )}
          {booking.clinic.phone && (
            <a href={`tel:${booking.clinic.phone}`} className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50">
              📞 كلم العيادة
            </a>
          )}
          <Link href={`/c/${booking.clinic.slug}`} className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50">
            حجز جديد
          </Link>
        </div>
      </Card>

      {booking.can_modify && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => { setError(null); setMode("reschedule"); }}>تغيير الميعاد</Button>
          <Button variant="danger" onClick={() => { setError(null); setMode("cancel"); }}>إلغاء الحجز</Button>
        </div>
      )}
      {!booking.can_modify && active && (
        <p className="text-center text-sm text-slate-500">لو محتاج تعدل الحجز ده، كلم العيادة.</p>
      )}

      <Modal open={mode === "cancel"} onClose={() => setMode("view")} title="إلغاء الحجز">
        <p className="text-slate-600">
          متأكد إنك عايز تلغي حجز {formatDateLong(booking.starts_at, tz)} الساعة {formatTime(booking.starts_at, tz)}؟
        </p>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="danger" loading={busy} onClick={cancel}>أيوه، ألغي</Button>
          <Button variant="secondary" onClick={() => setMode("view")}>رجوع</Button>
        </div>
      </Modal>

      <Modal open={mode === "reschedule"} onClose={() => setMode("view")} title="اختار ميعاد جديد">
        <SlotPicker
          today={booking.clinic.today}
          windowDays={booking.clinic.booking_window_days}
          workingDays={ALL_DAYS}
          timeZone={tz}
          fetchSlots={fetchSlots}
          value={slot}
          onChange={setSlot}
          autoAdvance
        />
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        <Button className="mt-5 w-full" disabled={!slot} loading={busy} onClick={reschedule}>
          تأكيد الميعاد الجديد
        </Button>
      </Modal>
    </div>
  );
}
