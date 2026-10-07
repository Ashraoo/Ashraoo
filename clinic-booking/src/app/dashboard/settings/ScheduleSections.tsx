"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { TimeOff, WorkingHour } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { WEEKDAYS_AR, addDays, formatDateLong, formatTime, todayIn, trimSeconds, zonedToUtc } from "@/lib/time";
import { Alert, Button, Card, EmptyState, Field, Input, Spinner } from "@/components/ui";

// Saturday-first week, as used in Egypt.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function HoursSection({ readOnly }: { readOnly: boolean }) {
  const { clinic } = useStaff();
  const [hours, setHours] = useState<WorkingHour[] | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("22:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getBrowserClient().from("working_hours").select("*").eq("clinic_id", clinic.id).order("start_time");
    if (error) setError(errorMessage(error));
    else setHours((data ?? []) as WorkingHour[]);
  }, [clinic.id]);
  useEffect(() => void load(), [load]);

  async function add(weekday: number) {
    if (!start || !end || start >= end) return setError("وقت النهاية لازم يكون بعد وقت البداية (الفترة لازم تخلص قبل نص الليل).");
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient().from("working_hours").insert({ clinic_id: clinic.id, weekday, start_time: start, end_time: end });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setAdding(null);
    await load();
  }

  async function remove(id: string) {
    setError(null);
    const { error } = await getBrowserClient().from("working_hours").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  async function copyToAll(weekday: number) {
    if (!hours) return;
    const source = hours.filter((h) => h.weekday === weekday);
    if (!window.confirm(`نسخ مواعيد يوم ${WEEKDAYS_AR[weekday]} لكل الأيام اللي فيها شغل؟`)) return;
    const targets = [...new Set(hours.map((h) => h.weekday))].filter((d) => d !== weekday);
    setBusy(true);
    setError(null);
    const supabase = getBrowserClient();
    const { error: delErr } = await supabase.from("working_hours").delete().eq("clinic_id", clinic.id).in("weekday", targets);
    const { error: insErr } = delErr
      ? { error: delErr }
      : await supabase.from("working_hours").insert(
          targets.flatMap((d) => source.map((s) => ({ clinic_id: clinic.id, weekday: d, start_time: s.start_time, end_time: s.end_time }))),
        );
    setBusy(false);
    if (insErr) setError(errorMessage(insErr));
    await load();
  }

  return (
    <Card>
      <h2 className="mb-1 font-bold">مواعيد العمل</h2>
      <p className="mb-4 text-sm text-slate-500">ممكن تضيف أكتر من فترة في اليوم (مثلًا صباحي ومسائي).</p>
      {hours === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {WEEK_ORDER.map((d) => {
            const day = hours.filter((h) => h.weekday === d);
            return (
              <li key={d} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="w-20 font-semibold">{WEEKDAYS_AR[d]}</span>
                {day.length === 0 && <span className="text-sm text-slate-400">إجازة</span>}
                {day.map((h) => (
                  <span key={h.id} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-sm text-brand-900">
                    <span className="ltr">{trimSeconds(h.start_time)} – {trimSeconds(h.end_time)}</span>
                    {!readOnly && (
                      <button className="text-brand-700 hover:text-red-600" onClick={() => remove(h.id)} aria-label="حذف الفترة">✕</button>
                    )}
                  </span>
                ))}
                {!readOnly && adding !== d && (
                  <div className="ms-auto flex gap-1">
                    {day.length > 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => copyToAll(d)}>نسخ للكل</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { setAdding(d); setError(null); }}>+ فترة</Button>
                  </div>
                )}
                {adding === d && (
                  <div className="flex w-full flex-wrap items-center gap-2" dir="ltr">
                    <Input type="time" className="w-32" value={start} onChange={(e) => setStart(e.target.value)} aria-label="من" />
                    <span>→</span>
                    <Input type="time" className="w-32" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="إلى" />
                    <Button size="sm" loading={busy} onClick={() => add(d)}>إضافة</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>إلغاء</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}

export function TimeOffSection({ readOnly }: { readOnly: boolean }) {
  const { clinic } = useStaff();
  const tz = clinic.timezone;
  const today = todayIn(tz);
  const [items, setItems] = useState<TimeOff[] | null>(null);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [fullDay, setFullDay] = useState(true);
  const [fromTime, setFromTime] = useState("17:00");
  const [toTime, setToTime] = useState("22:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getBrowserClient()
      .from("time_off")
      .select("*")
      .eq("clinic_id", clinic.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at");
    if (error) setError(errorMessage(error));
    else setItems((data ?? []) as TimeOff[]);
  }, [clinic.id]);
  useEffect(() => void load(), [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const startsAt = zonedToUtc(fromDate, fullDay ? "00:00" : fromTime, tz);
    const endsAt = fullDay ? zonedToUtc(addDays(toDate, 1), "00:00", tz) : zonedToUtc(toDate, toTime, tz);
    if (!(startsAt < endsAt)) return setError("النهاية لازم تكون بعد البداية.");
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient().from("time_off").insert({
      clinic_id: clinic.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setReason("");
    await load();
  }

  async function remove(id: string) {
    const { error } = await getBrowserClient().from("time_off").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  return (
    <Card>
      <h2 className="mb-1 font-bold">الإجازات والأوقات المقفولة</h2>
      <p className="mb-4 text-sm text-slate-500">المواعيد دي مش هتظهر للحجز. الحجوزات الموجودة فيها مش بتتلغي تلقائي.</p>
      {items === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState title="مفيش إجازات جاية" />
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span>من {formatDateLong(t.starts_at, tz)} {formatTime(t.starts_at, tz)}</span>
              <span>إلى {formatDateLong(t.ends_at, tz)} {formatTime(t.ends_at, tz)}</span>
              {t.reason && <span className="text-slate-500">— {t.reason}</span>}
              {!readOnly && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => remove(t.id)}>حذف</Button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form onSubmit={add} className="mt-4 space-y-3 rounded-xl p-3 ring-1 ring-slate-200">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-600" checked={fullDay} onChange={(e) => setFullDay(e.target.checked)} /> أيام كاملة
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="من" htmlFor="to-from">
              <div className="flex gap-2">
                <Input id="to-from" type="date" min={today} value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }} />
                {!fullDay && <Input type="time" aria-label="وقت البداية" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />}
              </div>
            </Field>
            <Field label="إلى" htmlFor="to-to">
              <div className="flex gap-2">
                <Input id="to-to" type="date" min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} />
                {!fullDay && <Input type="time" aria-label="وقت النهاية" value={toTime} onChange={(e) => setToTime(e.target.value)} />}
              </div>
            </Field>
          </div>
          <Input placeholder="السبب (اختياري)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" type="submit" loading={busy}>إضافة إجازة</Button>
        </form>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}
