"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function DashboardNav({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/dashboard", label: "المواعيد" },
    { href: "/dashboard/patients", label: "المرضى" },
    { href: "/dashboard/settings", label: isOwner ? "الإعدادات" : "بيانات العيادة" },
  ];
  return (
    <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cx(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold",
            path === i.href ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
