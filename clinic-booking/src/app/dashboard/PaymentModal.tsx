"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/StaffProvider";
import type { PaymentMethod, ScheduleRow } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/time";
import { PAYMENT_LABEL } from "@/components/status";
import { Alert, Button, Field, Input, Modal, cx } from "@/components/ui";

export function PaymentModal({ row, onClose, onSaved }: { row: ScheduleRow; onClose: () => void; onSaved: () => void }) {
  const { clinic, userId } = useStaff();
  const remaining = Math.max(0, Number(row.price) - Number(row.paid));
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("اكتب مبلغ صحيح.");
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient().from("payments").insert({
      clinic_id: clinic.id,
      appointment_id: row.id,
      amount: Math.round(value * 100) / 100,
      method,
      note: note.trim() || null,
      received_by: userId,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`تسجيل دفع — ${row.contact_name}`}>
      <p className="mb-4 text-sm text-slate-600">
        سعر الخدمة {formatMoney(row.price)} · اتدفع {formatMoney(row.paid)} · الباقي {formatMoney(remaining)}
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="المبلغ" htmlFor="pay-amount">
          <Input id="pay-amount" type="number" inputMode="decimal" min="0.01" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={cx("rounded-lg py-2 text-sm font-semibold ring-1", method === m ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200")}>
              {PAYMENT_LABEL[m]}
            </button>
          ))}
        </div>
        <Field label="ملاحظة (اختياري)" htmlFor="pay-note">
          <Input id="pay-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full">حفظ</Button>
      </form>
    </Modal>
  );
}
