"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, formatDay, formatTime, weekdayOf } from "@/lib/time";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, EmptyState, Spinner, cx } from "@/components/ui";

interface Props {
  today: string;
  windowDays: number;
  workingDays: number[];
  timeZone: string;
  /** Changing this identity re-fetches the slots (e.g. when the service changes). */
  fetchSlots: (date: string) => Promise<string[]>;
  value: string | null;
  onChange: (slot: string | null) => void;
  /** Day selected initially (defaults to the first working day). */
  initialDate?: string;
  /** Notified when the selected day changes. */
  onDateChange?: (date: string) => void;
  /** Until the user picks a day, skip forward past days with no free slots. */
  autoAdvance?: boolean;
}

const AUTO_ADVANCE_DAYS = 14;

const PAGE = 14;

export function SlotPicker({ today, windowDays, workingDays, timeZone, fetchSlots, value, onChange, initialDate, onDateChange, autoAdvance }: Props) {
  const days = useMemo(
    () => Array.from({ length: windowDays + 1 }, (_, i) => addDays(today, i)),
    [today, windowDays],
  );
  const firstOpen = days.find((d) => workingDays.includes(weekdayOf(d))) ?? today;
  const [date, setDate] = useState(initialDate && days.includes(initialDate) ? initialDate : firstOpen);
  const [visible, setVisible] = useState(Math.max(PAGE, days.indexOf(date) + 1));

  useEffect(() => {
    onDateChange?.(date);
  }, [date, onDateChange]);
  // Slots are stored with the day they belong to, so a stale list is never read for a new day.
  const [loaded, setLoaded] = useState<{ date: string; slots: string[] } | null>(null);
  const slots = loaded?.date === date ? loaded.slots : null;
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [userPicked, setUserPicked] = useState(false);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    fetchSlots(date)
      .then((s) => !cancelled && setLoaded({ date, slots: s }))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [date, fetchSlots, reloadKey]);

  useEffect(() => {
    if (!autoAdvance || userPicked || slots === null || slots.length > 0 || skipped >= AUTO_ADVANCE_DAYS) return;
    const next = days.slice(days.indexOf(date) + 1).find((d) => workingDays.includes(weekdayOf(d)));
    if (!next) return;
    setSkipped((n) => n + 1);
    setVisible((v) => Math.max(v, days.indexOf(next) + 1));
    setDate(next);
  }, [autoAdvance, userPicked, slots, skipped, days, date, workingDays]);

  // Drop a selection that is no longer offered.
  useEffect(() => {
    if (value && slots && !slots.includes(value)) onChange(null);
  }, [slots, value, onChange]);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="الأيام" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {days.slice(0, visible).map((d) => {
          const open = workingDays.includes(weekdayOf(d));
          const active = d === date;
          return (
            <button
              key={d}
              type="button"
              disabled={!open}
              onClick={() => {
                setUserPicked(true);
                setDate(d);
                onChange(null);
              }}
              aria-pressed={active}
              className={cx(
                "flex min-w-[4.5rem] snap-start flex-col items-center rounded-xl px-2 py-2 text-sm ring-1 transition",
                active
                  ? "bg-brand-600 text-white ring-brand-600"
                  : open
                    ? "bg-white text-slate-800 ring-slate-200 hover:ring-brand-500"
                    : "cursor-not-allowed bg-slate-50 text-slate-300 ring-slate-100",
              )}
            >
              <span className="text-xs">{d === today ? "النهارده" : formatDay(d, { weekday: "short" })}</span>
              <span className="text-lg font-bold">{formatDay(d, { day: "numeric" })}</span>
              <span className="text-xs">{formatDay(d, { month: "short" })}</span>
            </button>
          );
        })}
        {visible < days.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="min-w-[4.5rem] rounded-xl bg-white px-2 text-sm text-brand-700 ring-1 ring-slate-200"
          >
            أيام أكتر
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-600">{formatDay(date)}</p>
        {error ? (
          <div className="space-y-2">
            <Alert>{error}</Alert>
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              حاول تاني
            </Button>
          </div>
        ) : slots === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Spinner /> بنحمّل المواعيد…
          </div>
        ) : slots.length === 0 ? (
          <EmptyState title="مفيش مواعيد متاحة في اليوم ده">جرّب يوم تاني.</EmptyState>
        ) : (
          <div role="group" aria-label="المواعيد المتاحة" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange(s)}
                aria-pressed={value === s}
                className={cx(
                  "rounded-lg px-2 py-2.5 text-sm font-semibold ring-1 transition",
                  value === s
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-slate-800 ring-slate-200 hover:ring-brand-500",
                )}
              >
                {formatTime(s, timeZone)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
