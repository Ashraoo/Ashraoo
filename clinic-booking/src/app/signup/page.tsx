import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "حساب جديد" };

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-2xl font-extrabold text-brand-700">عيادتي</Link>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}
