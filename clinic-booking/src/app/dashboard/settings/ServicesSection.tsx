"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { Service } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/time";
import { Alert, Button, Card, EmptyState, Input, Spinner } from "@/components/ui";

type Draft = { name: string; duration: string; price: string; is_active: boolean; is_public: boolean };
const toDraft = (s?: Service): Draft => ({
  name: s?.name ?? "",
  duration: String(s?.duration_minutes ?? 20),
  price: String(s?.price ?? 0),
  is_active: s?.is_active ?? true,
  is_public: s?.is_public ?? true,
});

export function ServicesSection({ readOnly }: { readOnly: boolean }) {
  const { clinic } = useStaff();
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getBrowserClient().from("services").select("*").eq("clinic_id", clinic.id).order("sort_order").order("name");
    if (error) setError(errorMessage(error));
    else setServices((data ?? []) as Service[]);
  }, [clinic.id]);
  useEffect(() => void load(), [load]);

  function start(s?: Service) {
    setError(null);
    setDraft(toDraft(s));
    setEditing(s?.id ?? "new");
  }

  async function save() {
    const duration = Number(draft.duration);
    const price = Number(draft.price);
    if (!draft.name.trim()) return setError("اكتب اسم الخدمة.");
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) return setError("المدة لازم تكون بين 5 و480 دقيقة.");
    if (!Number.isFinite(price) || price < 0) return setError("السعر غير صحيح.");
    setBusy(true);
    setError(null);
    const row = { name: draft.name.trim(), duration_minutes: duration, price, is_active: draft.is_active, is_public: draft.is_public };
    const supabase = getBrowserClient();
    const { error } =
      editing === "new"
        ? await supabase.from("services").insert({ ...row, clinic_id: clinic.id, sort_order: services?.length ?? 0 })
        : await supabase.from("services").update(row).eq("id", editing!);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEditing(null);
    await load();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">الخدمات</h2>
        {!readOnly && editing === null && <Button size="sm" variant="secondary" onClick={() => start()}>+ خدمة</Button>}
      </div>
      {services === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <ul className="space-y-2">
          {services.length === 0 && editing !== "new" && <EmptyState title="مفيش خدمات">ضيف خدمة عشان المرضى يقدروا يحجزوا.</EmptyState>}
          {services.map((s) =>
            editing === s.id ? (
              <li key={s.id}><Editor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} busy={busy} /></li>
            ) : (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span className="font-semibold">{s.name}</span>
                <span className="text-sm text-slate-500">{s.duration_minutes} دقيقة · {formatMoney(s.price)}</span>
                {!s.is_active && <span className="rounded bg-zinc-200 px-1.5 text-xs">متوقفة</span>}
                {s.is_active && !s.is_public && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">للعيادة بس</span>}
                {!readOnly && editing === null && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => start(s)}>تعديل</Button>}
              </li>
            ),
          )}
          {editing === "new" && <li><Editor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} busy={busy} /></li>}
        </ul>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}

function Editor({ draft, setDraft, onSave, onCancel, busy }: {
  draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl p-3 ring-1 ring-brand-200">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Input placeholder="اسم الخدمة" aria-label="اسم الخدمة" maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <Input type="number" min={5} max={480} aria-label="المدة بالدقائق" placeholder="المدة (دقيقة)" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} />
        <Input type="number" min={0} step="0.01" aria-label="السعر" placeholder="السعر" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> مفعّلة</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={draft.is_public} onChange={(e) => setDraft({ ...draft, is_public: e.target.checked })} /> تظهر في صفحة الحجز</label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={onSave}>حفظ</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}
