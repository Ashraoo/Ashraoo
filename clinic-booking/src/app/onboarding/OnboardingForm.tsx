"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function OnboardingForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", doctor: "", specialty: "", phone: "", slug: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const slug = form.slug.trim().toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError("اكتب اسم العيادة.");
    if (!SLUG_RE.test(slug)) return setError("الرابط لازم يكون من 3 لـ 40 حرف إنجليزي صغير أو رقم أو شرطة (-)، ومايبدأش أو يخلصش بشرطة.");
    setBusy(true);
    const { error } = await getBrowserClient().rpc("create_clinic", {
      p_name: form.name,
      p_slug: slug,
      p_doctor_name: form.doctor || null,
      p_specialty: form.specialty || null,
      p_phone: form.phone || null,
      p_timezone: "Africa/Cairo",
    });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    router.replace("/dashboard/settings?welcome=1");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم العيادة" htmlFor="name">
          <Input id="name" required value={form.name} onChange={set("name")} placeholder="عيادة د. أحمد للباطنة" />
        </Field>
        <Field label="اسم الدكتور" htmlFor="doctor">
          <Input id="doctor" value={form.doctor} onChange={set("doctor")} placeholder="د. أحمد محمود" />
        </Field>
        <Field label="التخصص" htmlFor="specialty">
          <Input id="specialty" value={form.specialty} onChange={set("specialty")} placeholder="باطنة وجهاز هضمي" />
        </Field>
        <Field label="تليفون العيادة" htmlFor="phone">
          <Input id="phone" type="tel" dir="ltr" value={form.phone} onChange={set("phone")} placeholder="01012345678" />
        </Field>
        <Field label="رابط الحجز" htmlFor="slug" hint="حروف إنجليزي صغيرة وأرقام وشرطة. مثال: dr-ahmed">
          <div className="flex items-center gap-2" dir="ltr">
            <span className="shrink-0 text-sm text-slate-500">/c/</span>
            <Input id="slug" required value={form.slug} onChange={set("slug")} placeholder="dr-ahmed" autoCapitalize="off" />
          </div>
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full">إنشاء العيادة</Button>
      </form>
    </Card>
  );
}
