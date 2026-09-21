"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState, type ReactNode } from "react";

export function CsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/cs/login") {
    return (
      <div
        className="min-h-screen text-white"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, #1d4ed8 0%, transparent 40%), radial-gradient(circle at 80% 0%, #0f766e 0%, transparent 35%), linear-gradient(160deg, #0b1220 0%, #102a43 55%, #0f766e 120%)",
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-slate-900"
      dir="rtl"
      style={{
        background:
          "linear-gradient(180deg, #ecfeff 0%, #f0fdf4 40%, #fefce8 100%)",
      }}
    >
      <header
        className="sticky top-0 z-20 border-b border-teal-900/10 px-4 py-3 shadow-md"
        style={{
          background: "linear-gradient(90deg, #0f766e 0%, #0e7490 50%, #1d4ed8 100%)",
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-white">
          <div>
            <p className="text-lg font-extrabold tracking-tight">Tooliano — خدمة العملاء</p>
            <p className="text-xs text-teal-100">تأكيد الطلبات بالمكالمة · سكربت ملون وسريع</p>
          </div>
          <div className="flex items-center gap-3 text-sm font-bold">
            <Link
              href="/cs"
              className={`rounded-full px-3 py-1.5 ${
                pathname === "/cs" ? "bg-brand-gold text-black" : "bg-white/15 hover:bg-white/25"
              }`}
            >
              قائمة الانتظار
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/cs/login" })}
              className="rounded-full bg-red-500/90 px-3 py-1.5 hover:bg-red-500"
            >
              خروج
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
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
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-16 grid max-w-md gap-4 rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-md"
    >
      <div>
        <p className="text-sm font-bold text-brand-gold">Tooliano CS</p>
        <h1 className="mt-1 text-3xl font-extrabold">دخول خدمة العملاء</h1>
        <p className="mt-2 text-sm text-teal-100">سجّل الدخول لبدء تأكيد الطلبات بالمكالمة.</p>
      </div>
      <label className="grid gap-2 text-sm font-bold">
        البريد الإلكتروني
        <input
          name="email"
          type="email"
          required
          className="rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 outline-none ring-brand-gold focus:ring-2"
          dir="ltr"
        />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        كلمة المرور
        <input
          name="password"
          type="password"
          required
          className="rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 outline-none ring-brand-gold focus:ring-2"
        />
      </label>
      {error ? <p className="rounded-xl bg-red-500/25 px-3 py-2 text-sm text-red-100">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-extrabold text-black disabled:opacity-60"
      >
        {loading ? "جاري الدخول..." : "دخول"}
      </button>
    </form>
  );
}
