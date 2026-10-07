"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { AppointmentStatus, Patient } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { displayPhone, normalizePhone, whatsappLink } from "@/lib/phone";
import { formatDateLong, formatMoney, formatTime } from "@/lib/time";
import { StatusBadge } from "@/components/status";
import { Alert, Button, Card, EmptyState, Input, Spinner, Textarea, cx } from "@/components/ui";

interface HistoryRow {
  id: string;
  starts_at: string;
  status: AppointmentStatus;
  price: number;
  notes: string | null;
  patient_notes: string | null;
  service: { name: string } | null;
  payments: { amount: number }[];
}

const PAGE_SIZE = 30;

export function PatientsView() {
  const { clinic } = useStaff();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Patient | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      let q = getBrowserClient()
        .from("patients")
        .select("id, full_name, phone, notes, created_at")
        .eq("clinic_id", clinic.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const term = query.trim();
      if (term) {
        const phone = normalizePhone(term);
        const digits = term.replace(/\D/g, "");
        if (phone) q = q.eq("phone", phone);
        else if (digits.length >= 4 && digits.length === term.replace(/[\s+-]/g, "").length) q = q.ilike("phone", `%${digits.replace(/^0/, "")}%`);
        else q = q.ilike("full_name", `%${term.replace(/[%_,()]/g, "")}%`);
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) setError(errorMessage(error));
      else {
        setError(null);
        setPatients((data ?? []) as Patient[]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clinic.id, query]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-3">
        <h1 className="text-xl font-extrabold">المرضى</h1>
        <Input placeholder="ابحث بالاسم أو رقم الموبايل" value={query} onChange={(e) => setQuery(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Card className="p-0">
          {patients === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : patients.length === 0 ? (
            <div className="p-4"><EmptyState title={query ? "مفيش نتائج" : "لسه مفيش مرضى"} /></div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {patients.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelected(p)}
                    className={cx("flex w-full items-center justify-between px-4 py-3 text-start hover:bg-slate-50", selected?.id === p.id && "bg-brand-50")}
                  >
                    <span className="font-semibold">{p.full_name}</span>
                    <span className="ltr text-sm text-slate-500">{displayPhone(p.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {patients?.length === PAGE_SIZE && (
            <p className="border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-500">بيظهر آخر {PAGE_SIZE} مريض. استخدم البحث للوصول لأي مريض.</p>
          )}
        </Card>
      </div>
      <div>
        {selected ? (
          <PatientDetail
            key={selected.id}
            patient={selected}
            onUpdated={(p) => {
              setSelected(p);
              setPatients((list) => list?.map((x) => (x.id === p.id ? p : x)) ?? null);
            }}
          />
        ) : (
          <div className="hidden lg:block"><EmptyState title="اختار مريض عشان تشوف ملفه" /></div>
        )}
      </div>
    </div>
  );
}

function PatientDetail({ patient, onUpdated }: { patient: Patient; onUpdated: (p: Patient) => void }) {
  const { clinic } = useStaff();
  const tz = clinic.timezone;
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(patient.full_name);
  const [notes, setNotes] = useState(patient.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getBrowserClient()
      .from("appointments")
      .select("id, starts_at, status, price, notes, patient_notes, service:services(name), payments(amount)")
      .eq("patient_id", patient.id)
      .order("starts_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        else setHistory((data ?? []) as unknown as HistoryRow[]);
      });
  }, [patient.id]);

  async function save() {
    if (name.trim().length < 2) return setError("الاسم قصير.");
    setSaving(true);
    setSaved(false);
    setError(null);
    const { data, error } = await getBrowserClient()
      .from("patients")
      .update({ full_name: name.trim(), notes: notes.trim() || null })
      .eq("id", patient.id)
      .select("id, full_name, phone, notes, created_at")
      .single();
    setSaving(false);
    if (error) return setError(errorMessage(error));
    setSaved(true);
    onUpdated(data as Patient);
  }

  const visits = history?.filter((h) => h.status === "completed").length ?? 0;
  const noShows = history?.filter((h) => h.status === "no_show").length ?? 0;
  const paid = history?.reduce((s, h) => s + h.payments.reduce((a, p) => a + Number(p.amount), 0), 0) ?? 0;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{patient.full_name}</h2>
        <a href={`tel:${patient.phone}`} className="ltr text-slate-600">{displayPhone(patient.phone)}</a>
        <a href={whatsappLink(patient.phone)} target="_blank" rel="noreferrer" className="text-sm text-emerald-700 hover:underline">واتساب</a>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">زيارات</p><p className="text-lg font-bold">{visits}</p></div>
        <div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">غياب</p><p className="text-lg font-bold">{noShows}</p></div>
        <div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">مدفوع</p><p className="text-lg font-bold">{formatMoney(paid)}</p></div>
      </div>
      <div className="space-y-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="اسم المريض" />
        <Textarea rows={3} maxLength={2000} placeholder="ملاحظات عن المريض (حساسية، أمراض مزمنة…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex items-center gap-2">
          <Button size="sm" loading={saving} onClick={save}>حفظ</Button>
          {saved && <span className="text-sm text-emerald-700">اتحفظ ✓</span>}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <div>
        <h3 className="mb-2 font-bold">سجل الزيارات</h3>
        {history === null ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : history.length === 0 ? (
          <EmptyState title="مفيش زيارات" />
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{formatDateLong(h.starts_at, tz)} {formatTime(h.starts_at, tz)}</span>
                  <StatusBadge status={h.status} />
                  <span className="text-slate-500">{h.service?.name}</span>
                  <span className="ms-auto text-slate-500">
                    {formatMoney(h.payments.reduce((a, p) => a + Number(p.amount), 0))} / {formatMoney(h.price)}
                  </span>
                </div>
                {(h.patient_notes || h.notes) && <p className="mt-1 text-slate-500">{[h.patient_notes, h.notes].filter(Boolean).join(" — ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
