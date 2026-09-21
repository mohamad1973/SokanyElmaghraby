"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState, type ReactNode } from "react";

function CsHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const agentName = session?.user?.name?.trim() || "وكيلة خدمة العملاء";

  return (
    <header
      className="sticky top-0 z-20 border-b border-teal-900/10 px-4 py-3 shadow-md"
      style={{
        background: "linear-gradient(90deg, #0f766e 0%, #0e7490 50%, #1d4ed8 100%)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-white">
        <div>
          <p className="text-lg font-extrabold tracking-tight">مرحباً، {agentName}</p>
          <p className="text-xs text-teal-100">خدمة العملاء · تأكيد الطلبات بالمكالمة</p>
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
            {session?.user?.csIsSupervisor ? (
              <Link
                href="/cs/assign"
                className={`rounded-full px-3 py-1.5 ${
                  pathname.startsWith("/cs/assign") ? "bg-brand-gold text-black" : "bg-white/15 hover:bg-white/25"
                }`}
              >
                توزيع
              </Link>
            ) : null}
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
  );
}

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
    <SessionProvider>
      <div
        className="min-h-screen text-slate-900"
        dir="rtl"
        style={{
          background: "linear-gradient(180deg, #ecfeff 0%, #f0fdf4 40%, #fefce8 100%)",
        }}
      >
        <CsHeader />
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </SessionProvider>
  );
}

export function CsLoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
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

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (password !== confirm) {
      setLoading(false);
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    const res = await fetch("/api/cs/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setLoading(false);
      setError(data.message || "تعذر إنشاء الحساب.");
      return;
    }

    const result = await signIn("cs-credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/cs",
    });

    setLoading(false);

    if (result?.error) {
      setError("تم إنشاء الحساب لكن فشل الدخول. جرّبي تبويب الدخول.");
      setMode("login");
      return;
    }

    router.push("/cs");
    router.refresh();
  }

  const inputClass =
    "rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 outline-none ring-brand-gold focus:ring-2";

  return (
    <div className="mx-auto mt-12 w-full max-w-md px-4">
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/10 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`rounded-xl px-3 py-2 text-sm font-extrabold ${
            mode === "login" ? "bg-brand-gold text-black" : "text-white/80"
          }`}
        >
          دخول
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError("");
          }}
          className={`rounded-xl px-3 py-2 text-sm font-extrabold ${
            mode === "register" ? "bg-brand-gold text-black" : "text-white/80"
          }`}
        >
          إنشاء حساب
        </button>
      </div>

      {mode === "login" ? (
        <form
          onSubmit={handleLogin}
          className="grid gap-4 rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-md"
        >
          <div>
            <p className="text-sm font-bold text-brand-gold">Tooliano CS</p>
            <h1 className="mt-1 text-3xl font-extrabold">دخول خدمة العملاء</h1>
            <p className="mt-2 text-sm text-teal-100">ادخلي بإيميلك وكلمة المرور.</p>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            البريد الإلكتروني (اليوزر)
            <input name="email" type="email" required className={inputClass} dir="ltr" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            كلمة المرور
            <input name="password" type="password" required className={inputClass} />
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
      ) : (
        <form
          onSubmit={handleRegister}
          className="grid gap-4 rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-md"
        >
          <div>
            <p className="text-sm font-bold text-brand-gold">Tooliano CS</p>
            <h1 className="mt-1 text-3xl font-extrabold">إنشاء حساب جديد</h1>
            <p className="mt-2 text-sm text-teal-100">كل بنت تعمل حسابها باسمها الظاهر فوق الداشبورد.</p>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            الاسم الظاهر (اسم البنت)
            <input name="name" type="text" required minLength={2} className={inputClass} placeholder="مثال: سارة" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            البريد الإلكتروني (اليوزر)
            <input name="email" type="email" required className={inputClass} dir="ltr" placeholder="name@example.com" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            كلمة المرور
            <input name="password" type="password" required minLength={6} className={inputClass} />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            تأكيد كلمة المرور
            <input name="confirm" type="password" required minLength={6} className={inputClass} />
          </label>
          {error ? <p className="rounded-xl bg-red-500/25 px-3 py-2 text-sm text-red-100">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري الإنشاء..." : "إنشاء الحساب والدخول"}
          </button>
        </form>
      )}
    </div>
  );
}
