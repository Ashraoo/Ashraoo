"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStaff } from "@/components/StaffProvider";
import { Alert, Button, Card } from "@/components/ui";
import { ClinicInfoSection, BookingRulesSection } from "./ClinicSections";
import { ServicesSection } from "./ServicesSection";
import { HoursSection, TimeOffSection } from "./ScheduleSections";
import { StaffSection } from "./StaffSection";

export function SettingsView() {
  const { clinic, role } = useStaff();
  const welcome = useSearchParams().get("welcome") === "1";
  const isOwner = role === "owner";
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/c/${clinic.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-xl font-extrabold">{isOwner ? "الإعدادات" : "بيانات العيادة"}</h1>
      {welcome && (
        <Alert kind="success">
          العيادة اتعملت 🎉 ضبطنا مواعيد مبدئية (من السبت للخميس، من 5 لـ 10 بالليل) وخدمتين. عدّلهم تحت، وبعدين ابعت رابط الحجز للمرضى.
        </Alert>
      )}
      <Card>
        <h2 className="mb-2 font-bold">رابط الحجز</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="ltr min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm">{link}</code>
          <Button variant="secondary" size="sm" onClick={copy}>{copied ? "اتنسخ ✓" : "نسخ"}</Button>
          <a href={`/c/${clinic.slug}`} target="_blank" rel="noreferrer" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">فتح</a>
        </div>
        {!clinic.is_published && <p className="mt-2 text-sm text-amber-700">⚠️ الحجز الأونلاين متوقف حاليًا.</p>}
      </Card>
      {!isOwner && <Alert kind="info">التعديل على الإعدادات متاح لمالك العيادة بس.</Alert>}
      <ClinicInfoSection readOnly={!isOwner} />
      <ServicesSection readOnly={!isOwner} />
      <HoursSection readOnly={!isOwner} />
      <TimeOffSection readOnly={role === "receptionist"} />
      <BookingRulesSection readOnly={!isOwner} />
      {isOwner && <StaffSection />}
    </div>
  );
}
