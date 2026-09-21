"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState, type ReactNode } from "react";

export function CsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/cs/login") {
    return <div className="min-h-screen bg-slate-950 text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="font-bold">Tooliano — خدمة العملاء</p>
            <p className="text-xs text-slate-500">تأكيد الطلبات بالمكالمة</p>
          </div>
          <div className="flex items-center gap-3 text-sm font-bold">
            <Link href="/cs" className={pathname === "/cs" ? "text-brand-gold" : "text-slate-600"}>
              قائمة الانتظار
            </Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/cs/login" })} className="text-red-600">
              خروج
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
    </div>
  );
}

export function CsLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const result = await signIn("cs-credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      callbackUrl: "/cs",
    });

    setLoading(false);

    if (result?.error) {
      setError("بيانات الدخول غير صحيحة.");
      return;
    }

    router.push("/cs");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-16 grid max-w-md gap-4 rounded-2xl bg-slate-900 p-6">
      <h1 className="text-2xl font-bold">دخول خدمة العملاء</h1>
      <label className="grid gap-2 text-sm font-bold">
        البريد الإلكتروني
        <input name="email" type="email" required className="rounded-xl border border-white/10 bg-slate-800 px-4 py-3" dir="ltr" />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        كلمة المرور
        <input name="password" type="password" required className="rounded-xl border border-white/10 bg-slate-800 px-4 py-3" />
      </label>
      {error ? <p className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-60"
      >
        {loading ? "جاري الدخول..." : "دخول"}
      </button>
    </form>
  );
}
