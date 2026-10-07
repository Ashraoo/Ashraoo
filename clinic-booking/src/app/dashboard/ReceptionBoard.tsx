"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { AppointmentStatus, ScheduleRow, Service } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { addDays, formatDay, formatMoney, formatTime, todayIn } from "@/lib/time";
import { displayPhone, whatsappLink } from "@/lib/phone";
import { SOURCE_LABEL, StatusBadge } from "@/components/status";
import { Alert, Button, Card, EmptyState, Input, Spinner } from "@/components/ui";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { PaymentModal } from "./PaymentModal";
import { CancelModal, RescheduleModal } from "./AppointmentModals";

type Action = { label: string; to: AppointmentStatus; variant?: "primary" | "secondary" | "danger" | "ghost" };

const ACTIONS: Partial<Record<AppointmentStatus, Action[]>> = {
  booked: [
    { label: "وصل", to: "arrived" },
    { label: "تأكيد", to: "confirmed", variant: "secondary" },
    { label: "ماجاش", to: "no_show", variant: "ghost" },
  ],
  confirmed: [
    { label: "وصل", to: "arrived" },
    { label: "ماجاش", to: "no_show", variant: "ghost" },
  ],
  arrived: [
    { label: "دخل الكشف", to: "in_progress" },
    { label: "خلص", to: "completed", variant: "secondary" },
    { label: "تراجع", to: "booked", variant: "ghost" },
  ],
  in_progress: [
    { label: "خلص", to: "completed" },
    { label: "تراجع", to: "arrived", variant: "ghost" },
  ],
  completed: [{ label: "تراجع", to: "in_progress", variant: "ghost" }],
  no_show: [{ label: "تراجع", to: "booked", variant: "ghost" }],
};

export function ReceptionBoard() {
  const { clinic } = useStaff();
  const tz = clinic.timezone;
  const [today, setToday] = useState(() => todayIn(tz));
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [modal, setModal] = useState<
    | { kind: "new" }
    | { kind: "pay"; row: ScheduleRow }
    | { kind: "cancel"; row: ScheduleRow }
    | { kind: "reschedule"; row: ScheduleRow }
    | null
  >(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const { data, error } = await getBrowserClient().rpc("staff_day_schedule", { p_clinic_id: clinic.id, p_date: date });
    if (id !== requestId.current) return; // a newer request superseded this one
    if (error) {
      setError(errorMessage(error));
      return;
    }
    setError(null);
    setRows((data ?? []) as ScheduleRow[]);
  }, [clinic.id, date]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  useEffect(() => {
    getBrowserClient()
      .from("services")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setServices((data ?? []) as Service[]));
  }, [clinic.id]);

  // Live updates (online bookings, other receptionists) + periodic fallback.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`appointments:${clinic.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` },
        () => void load(),
      )
      .subscribe();
    const interval = setInterval(() => {
      setToday(todayIn(tz));
      void load();
    }, 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [clinic.id, load, tz]);

  async function setStatus(row: ScheduleRow, to: AppointmentStatus) {
    setPending(row.id);
    setActionError(null);
    const { error } = await getBrowserClient().from("appointments").update({ status: to }).eq("id", row.id);
    setPending(null);
    if (error) setActionError(errorMessage(error));
    await load();
  }

  const stats = useMemo(() => {
    const r = rows ?? [];
    const active = r.filter((x) => x.status !== "cancelled");
    return {
      total: active.length,
      waiting: r.filter((x) => x.status === "arrived").length,
      done: r.filter((x) => x.status === "completed").length,
      noShow: r.filter((x) => x.status === "no_show").length,
      collected: r.reduce((s, x) => s + Number(x.paid), 0),
    };
  }, [rows]);

  const queue = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.status === "arrived" || r.status === "in_progress")
        .sort((a, b) =>
          a.status === b.status
            ? (a.arrived_at ?? a.starts_at).localeCompare(b.arrived_at ?? b.starts_at)
            : a.status === "in_progress" ? -1 : 1,
        ),
    [rows],
  );

  const visibleRows = (rows ?? []).filter((r) => showCancelled || r.status !== "cancelled");
  const cancelledCount = (rows ?? []).length - (rows ?? []).filter((r) => r.status !== "cancelled").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-xl font-extrabold">
          {date === today ? "مواعيد النهارده" : "المواعيد"} <span className="text-base font-semibold text-slate-500">— {formatDay(date)}</span>
        </h1>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="اليوم اللي قبله">→</Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40 py-1.5" />
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="اليوم اللي بعده">←</Button>
          {date !== today && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>النهارده</Button>}
        </div>
        <Button onClick={() => setModal({ kind: "new" })}>+ حجز جديد</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="إجمالي الحجوزات" value={stats.total} />
        <Stat label="مستنيين" value={stats.waiting} tone="amber" />
        <Stat label="خلصوا" value={stats.done} tone="emerald" />
        <Stat label="ماجوش" value={stats.noShow} tone="zinc" />
        <Stat label="المدفوع" value={formatMoney(stats.collected)} />
      </div>

      {actionError && <Alert>{actionError}</Alert>}
      {error && (
        <Alert>
          {error} <button className="font-semibold underline" onClick={() => void load()}>حاول تاني</button>
        </Alert>
      )}

      {queue.length > 0 && (
        <Card className="border-s-4 border-amber-400">
          <h2 className="mb-3 font-bold">دور الانتظار</h2>
          <ol className="space-y-2">
            {queue.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-white font-bold ring-1 ring-slate-200">
                  {r.status === "in_progress" ? "▶" : i + 1 - queue.filter((q) => q.status === "in_progress").length}
                </span>
                <span className="font-semibold">{r.contact_name}</span>
                <StatusBadge status={r.status} />
                {r.source === "walk_in" && <span className="text-xs text-slate-500">بدون ميعاد</span>}
                {r.arrived_at && <span className="text-xs text-slate-500">وصل {formatTime(r.arrived_at, tz)}</span>}
                <div className="ms-auto flex gap-1">
                  {r.status === "arrived" && (
                    <Button size="sm" loading={pending === r.id} onClick={() => setStatus(r, "in_progress")}>دخّل</Button>
                  )}
                  {r.status === "in_progress" && (
                    <Button size="sm" loading={pending === r.id} onClick={() => setStatus(r, "completed")}>خلص</Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="p-0">
        {rows === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Spinner /> بنحمّل…</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="مفيش حجوزات في اليوم ده">
              ابعت رابط الحجز للمرضى: <span className="ltr font-mono">/c/{clinic.slug}</span>
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleRows.map((r) => (
              <li key={r.id} className={r.status === "cancelled" ? "px-4 py-3 opacity-60" : "px-4 py-3"}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="w-16 shrink-0">
                    <p className="font-bold">{formatTime(r.starts_at, tz)}</p>
                    <p className="text-xs text-slate-400">{formatTime(r.ends_at, tz)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.contact_name}</span>
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-slate-400">{SOURCE_LABEL[r.source]} · #{r.booking_ref}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-600">
                      <a href={`tel:${r.patient_phone}`} className="ltr hover:text-brand-700">{displayPhone(r.patient_phone)}</a>
                      <a href={whatsappLink(r.patient_phone)} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">واتساب</a>
                      {r.service_name && <span>{r.service_name}</span>}
                      <span className={Number(r.paid) >= Number(r.price) && Number(r.price) > 0 ? "text-emerald-700" : ""}>
                        دفع {formatMoney(r.paid)} من {formatMoney(r.price)}
                      </span>
                    </div>
                    {(r.patient_notes || r.notes) && (
                      <p className="mt-1 text-sm text-slate-500">
                        {r.patient_notes && <>📝 {r.patient_notes} </>}
                        {r.notes && <>🗒️ {r.notes}</>}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap gap-1 sm:w-auto">
                    {(ACTIONS[r.status] ?? []).map((a) => (
                      <Button key={a.to} size="sm" variant={a.variant ?? "primary"} disabled={pending === r.id} onClick={() => setStatus(r, a.to)}>
                        {a.label}
                      </Button>
                    ))}
                    {r.status !== "cancelled" && r.status !== "no_show" && (
                      <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "pay", row: r })}>دفع</Button>
                    )}
                    {(r.status === "booked" || r.status === "confirmed") && r.source !== "walk_in" && (
                      <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "reschedule", row: r })}>تغيير الميعاد</Button>
                    )}
                    {["booked", "confirmed", "arrived"].includes(r.status) && (
                      <Button size="sm" variant="danger" onClick={() => setModal({ kind: "cancel", row: r })}>إلغاء</Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cancelledCount > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setShowCancelled((v) => !v)}>
              {showCancelled ? "إخفاء الملغي" : `عرض الملغي (${cancelledCount})`}
            </button>
          </div>
        )}
      </Card>

      {modal?.kind === "new" && (
        <NewAppointmentModal
          services={services}
          defaultDate={date < today ? today : date}
          today={today}
          onClose={() => setModal(null)}
          onCreated={(createdDate) => {
            setModal(null);
            if (createdDate !== date) setDate(createdDate);
            else void load();
          }}
        />
      )}
      {modal?.kind === "pay" && (
        <PaymentModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} />
      )}
      {modal?.kind === "cancel" && (
        <CancelModal row={modal.row} onClose={() => setModal(null)} onDone={() => { setModal(null); void load(); }} />
      )}
      {modal?.kind === "reschedule" && (
        <RescheduleModal
          row={modal.row}
          today={today}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); void load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "amber" | "emerald" | "zinc" }) {
  const color = { amber: "text-amber-700", emerald: "text-emerald-700", zinc: "text-zinc-600" }[tone ?? "amber"];
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${tone ? color : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
