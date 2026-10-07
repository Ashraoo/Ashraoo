"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import type { PublicClinic } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { formatDateLong, formatMoney, formatTime, scalarRows } from "@/lib/time";
import { SlotPicker } from "@/components/SlotPicker";
import { Alert, Button, Card, Field, Input, Textarea, cx } from "@/components/ui";

const PHONE_RE = /^(?:\+?\d[\d\s-]{7,16}|[٠-٩\s]{11,16})$/;

export function BookingFlow({ clinic }: { clinic: PublicClinic }) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(clinic.services[0].id);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);

  const service = clinic.services.find((s) => s.id === serviceId)!;

  const fetchSlots = useCallback(
    async (date: string) => {
      void slotsVersion; // re-fetch after a "slot taken" error
      const { data, error } = await getBrowserClient().rpc("public_get_slots", {
        p_slug: clinic.slug,
        p_service_id: serviceId,
        p_date: date,
      });
      if (error) throw error;
      return scalarRows<string>(data, "public_get_slots");
    },
    [clinic.slug, serviceId, slotsVersion],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (website) return; // bots fill hidden fields
    if (!slot) {
      setError("اختار ميعاد الأول.");
      return;
    }
    if (name.trim().length < 2) {
      setError("من فضلك اكتب اسمك.");
      return;
    }
    if (!PHONE_RE.test(phone.trim())) {
      setError("رقم الموبايل غير صحيح. اكتبه بالشكل ده: 01012345678");
      return;
    }
    setSubmitting(true);
    const { data, error } = await getBrowserClient().rpc("public_book", {
      p_slug: clinic.slug,
      p_service_id: serviceId,
      p_starts_at: slot,
      p_full_name: name,
      p_phone: phone,
      p_notes: notes.trim() || null,
    });
    if (error) {
      setSubmitting(false);
      setError(errorMessage(error));
      if (error.message.includes("SLOT_UNAVAILABLE")) {
        setSlot(null);
        setSlotsVersion((v) => v + 1);
      }
      return;
    }
    router.push(`/b/${(data as { manage_token: string }).manage_token}?new=1`);
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card>
        <h2 className="mb-3 font-bold">1. اختار الخدمة</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {clinic.services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setServiceId(s.id);
                setSlot(null);
              }}
              aria-pressed={s.id === serviceId}
              className={cx(
                "rounded-xl p-3 text-start ring-1 transition",
                s.id === serviceId ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-slate-200 hover:ring-brand-500",
              )}
            >
              <span className="block font-semibold">{s.name}</span>
              <span className="text-sm text-slate-500">
                {s.duration_minutes} دقيقة{Number(s.price) > 0 && ` · ${formatMoney(s.price)}`}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">2. اختار اليوم والميعاد</h2>
        <SlotPicker
          today={clinic.today}
          windowDays={clinic.booking_window_days}
          workingDays={clinic.working_days}
          timeZone={clinic.timezone}
          fetchSlots={fetchSlots}
          value={slot}
          onChange={setSlot}
          autoAdvance
        />
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">3. بياناتك</h2>
        <div className="space-y-4">
          <Field label="الاسم" htmlFor="name">
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
          <Field label="رقم الموبايل (واتساب)" htmlFor="phone" hint="هنبعتلك تأكيد الحجز وتذكير بالميعاد على الرقم ده.">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="01012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>
          <Field label="ملاحظات للدكتور (اختياري)" htmlFor="notes">
            <Textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="hidden"
            aria-hidden
          />
        </div>
      </Card>

      {slot && (
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-200">
          {service.name} — {formatDateLong(slot, clinic.timezone)} الساعة {formatTime(slot, clinic.timezone)}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={submitting} className="w-full py-3 text-base">
        تأكيد الحجز
      </Button>
    </form>
  );
}
