"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState, type ReactNode } from "react";

export function DriverShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/driver/login") {
    return <div className="min-h-screen bg-zinc-950 text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-100 pb-20 text-zinc-900" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <p className="font-bold">SOKANY — المندوب</p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/driver/login" })}
            className="text-xs font-bold text-red-600"
          >
            خروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg p-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white">
        <div className="mx-auto grid max-w-lg grid-cols-2 text-center text-sm font-bold">
          <Link href="/driver/today" className={`px-4 py-4 ${pathname.startsWith("/driver/today") ? "text-brand-gold" : "text-zinc-600"}`}>
            اليوم
          </Link>
          <Link href="/driver/route" className={`px-4 py-4 ${pathname.startsWith("/driver/route") || pathname.startsWith("/driver/order") ? "text-brand-gold" : "text-zinc-600"}`}>
            المسار
          </Link>
        </div>
      </nav>
    </div>
  );
}

export function DriverLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const result = await signIn("driver-credentials", {
      phone: formData.get("phone"),
      password: formData.get("password"),
      redirect: false,
      callbackUrl: "/driver/today",
    });

    setLoading(false);

    if (result?.error) {
      setError("بيانات الدخول غير صحيحة.");
      return;
    }

    router.push("/driver/today");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-16 grid max-w-md gap-4 rounded-2xl bg-zinc-900 p-6">
      <h1 className="text-2xl font-bold">دخول المندوب</h1>
      <label className="grid gap-2 text-sm font-bold">
        رقم الموبايل
        <input name="phone" required className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-3" dir="ltr" />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        كلمة المرور
        <input name="password" type="password" required className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-3" />
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button type="submit" disabled={loading} className="rounded-xl bg-brand-gold px-4 py-3 font-bold text-black disabled:opacity-60">
        {loading ? "..." : "دخول"}
      </button>
    </form>
  );
}
