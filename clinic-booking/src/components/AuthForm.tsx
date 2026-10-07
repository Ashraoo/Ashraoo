"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "الرابط انتهى أو غير صحيح. جرب تاني." : null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && password.length < 8) {
      setError("كلمة السر لازم تكون 8 حروف على الأقل.");
      return;
    }
    setBusy(true);
    const supabase = getBrowserClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
      router.replace(next);
      router.refresh();
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    if (data.session) {
      // email confirmation disabled in the Supabase project
      router.replace(next);
      router.refresh();
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold">افتح الإيميل بتاعك 📩</h1>
        <p className="mt-2 text-slate-600">
          بعتنا رابط تأكيد على <span className="ltr font-semibold">{email}</span>. اضغط عليه عشان تكمل.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-bold">{mode === "login" ? "تسجيل الدخول" : "حساب جديد للعيادة"}</h1>
      <p className="mb-5 text-sm text-slate-500">
        {mode === "login" ? "ادخل على داشبورد العيادة." : "اعمل حساب واعمل صفحة الحجز بتاعتك في دقيقتين."}
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="الإيميل" htmlFor="email">
          <Input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="كلمة السر" htmlFor="password" hint={mode === "signup" ? "8 حروف على الأقل" : undefined}>
          <Input
            id="password"
            type="password"
            dir="ltr"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full">
          {mode === "login" ? "دخول" : "إنشاء الحساب"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>معندكش حساب؟ <Link className="font-semibold text-brand-700" href={`/signup?next=${encodeURIComponent(next)}`}>اعمل حساب</Link></>
        ) : (
          <>عندك حساب؟ <Link className="font-semibold text-brand-700" href={`/login?next=${encodeURIComponent(next)}`}>سجل دخول</Link></>
        )}
      </p>
    </Card>
  );
}
