"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";

type NotifPayload = {
  handedToCarrier: Array<{ id: number; wooOrderNumber: string }>;
  confirmDelivery: Array<{ id: number; wooOrderNumber: string }>;
  followUpDue: Array<{ id: number; wooOrderNumber: string }>;
  totals: { handedToCarrier: number; confirmDelivery: number; followUpDue: number; all: number };
};

const CS_VARS = {
  ["--cs-white" as string]: "#FFFFFF",
  ["--cs-gray" as string]: "#E5E5E5",
  ["--cs-gold" as string]: "#FCA311",
  ["--cs-navy" as string]: "#14213D",
  ["--cs-black" as string]: "#000000",
} as Record<string, string>;

function CsNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotifPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cs/notifications");
      if (!res.ok) return;
      const json = (await res.json()) as NotifPayload;
      setData(json);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(id);
  }, [load]);

  const total = data?.totals.all || 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20"
        aria-label="الإشعارات"
      >
        إشعارات
        {total > 0 ? (
          <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--cs-gold)] px-1 text-[10px] font-extrabold text-black">
            {total}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-80 rounded-2xl border border-[var(--cs-navy)]/20 bg-white p-3 text-[var(--cs-navy)] shadow-xl">
          <p className="mb-2 text-sm font-extrabold">تنبيهات المتابعة</p>
          {!data || total === 0 ? (
            <p className="text-xs text-slate-500">لا توجد تنبيهات حالياً.</p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto text-xs">
              {data.handedToCarrier.length ? (
                <div>
                  <p className="font-bold text-[var(--cs-gold)]">تسليم لشركة الشحن ({data.totals.handedToCarrier})</p>
                  <ul className="mt-1 space-y-1">
                    {data.handedToCarrier.slice(0, 8).map((o) => (
                      <li key={`h-${o.id}`}>
                        <Link href={`/cs/orders/${o.id}`} className="underline" onClick={() => setOpen(false)}>
                          #{o.wooOrderNumber}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.confirmDelivery.length ? (
                <div>
                  <p className="font-bold text-[var(--cs-navy)]">تأكيد التسليم للعميل ({data.totals.confirmDelivery})</p>
                  <ul className="mt-1 space-y-1">
                    {data.confirmDelivery.slice(0, 8).map((o) => (
                      <li key={`d-${o.id}`}>
                        <Link href={`/cs/orders/${o.id}`} className="underline" onClick={() => setOpen(false)}>
                          #{o.wooOrderNumber}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.followUpDue.length ? (
                <div>
                  <p className="font-bold text-[var(--cs-black)]">متابعة بعد 5 أيام ({data.totals.followUpDue})</p>
                  <ul className="mt-1 space-y-1">
                    {data.followUpDue.slice(0, 8).map((o) => (
                      <li key={`f-${o.id}`}>
                        <Link href={`/cs/orders/${o.id}`} className="underline" onClick={() => setOpen(false)}>
                          #{o.wooOrderNumber}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CsHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const agentName = session?.user?.name?.trim() || "مسؤول خدمة العملاء";

  return (
    <header className="sticky top-0 z-20 border-b border-black/20 px-4 py-3 shadow-md" style={{ background: "var(--cs-navy)" }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-white">
        <div>
          <p className="text-lg font-extrabold tracking-tight">مرحباً، {agentName}</p>
          <p className="text-xs text-white/70">خدمة العملاء · تأكيد الطلبات بالمكالمة</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
          <CsNotificationsBell />
          <Link
            href="/cs"
            className={`rounded-full px-3 py-1.5 ${
              pathname === "/cs" ? "bg-[var(--cs-gold)] text-black" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            قائمة الانتظار
          </Link>
          {session?.user?.csIsSupervisor ? (
            <Link
              href="/cs/assign"
              className={`rounded-full px-3 py-1.5 ${
                pathname.startsWith("/cs/assign") ? "bg-[var(--cs-gold)] text-black" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              توزيع
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/cs/login" })}
            className="rounded-full bg-black/50 px-3 py-1.5 hover:bg-black/70"
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
      <div className="min-h-screen text-white" style={{ ...CS_VARS, background: "linear-gradient(160deg, #000000 0%, #14213D 55%, #000000 120%)" }}>
        {children}
      </div>
    );
  }

  return (
    <SessionProvider>
      <div className="min-h-screen text-[var(--cs-navy)]" dir="rtl" style={{ ...CS_VARS, background: "var(--cs-gray)" }}>
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
    "rounded-xl border border-white/20 bg-black/40 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--cs-gold)]";

  return (
    <div className="mx-auto mt-12 w-full max-w-md px-4" style={CS_VARS}>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/10 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`rounded-xl px-3 py-2 text-sm font-extrabold ${
            mode === "login" ? "bg-[var(--cs-gold)] text-black" : "text-white/80"
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
            mode === "register" ? "bg-[var(--cs-gold)] text-black" : "text-white/80"
          }`}
        >
          إنشاء حساب
        </button>
      </div>

      {mode === "login" ? (
        <form
          onSubmit={handleLogin}
          className="grid gap-4 rounded-3xl border border-white/15 bg-[#14213D]/80 p-7 shadow-2xl backdrop-blur-md"
        >
          <div>
            <p className="text-sm font-bold text-[var(--cs-gold)]">Tooliano CS</p>
            <h1 className="mt-1 text-3xl font-extrabold">دخول خدمة العملاء</h1>
            <p className="mt-2 text-sm text-white/70">ادخلي بإيميلك وكلمة المرور.</p>
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
            className="rounded-xl bg-[var(--cs-gold)] px-4 py-3 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleRegister}
          className="grid gap-4 rounded-3xl border border-white/15 bg-[#14213D]/80 p-7 shadow-2xl backdrop-blur-md"
        >
          <div>
            <p className="text-sm font-bold text-[var(--cs-gold)]">Tooliano CS</p>
            <h1 className="mt-1 text-3xl font-extrabold">إنشاء حساب جديد</h1>
            <p className="mt-2 text-sm text-white/70">كل مسؤول يعمل حسابه باسمه الظاهر فوق الداشبورد.</p>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            الاسم الظاهر
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
            className="rounded-xl bg-[var(--cs-gold)] px-4 py-3 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري الإنشاء..." : "إنشاء الحساب والدخول"}
          </button>
        </form>
      )}
    </div>
  );
}
