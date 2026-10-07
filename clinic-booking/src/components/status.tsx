import type { AppointmentSource, AppointmentStatus, PaymentMethod } from "@/lib/types";
import { cx } from "@/components/ui";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "محجوز",
  confirmed: "مؤكد",
  arrived: "وصل",
  in_progress: "في الكشف",
  completed: "خلص",
  cancelled: "ملغي",
  no_show: "ماجاش",
};

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  booked: "bg-slate-100 text-slate-700",
  confirmed: "bg-sky-100 text-sky-800",
  arrived: "bg-amber-100 text-amber-800",
  in_progress: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-zinc-200 text-zinc-700",
};

export const SOURCE_LABEL: Record<AppointmentSource, string> = {
  online: "أونلاين",
  phone: "تليفون",
  walk_in: "بدون ميعاد",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "كاش",
  card: "فيزا",
  instapay: "InstaPay",
  wallet: "محفظة",
  other: "أخرى",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
