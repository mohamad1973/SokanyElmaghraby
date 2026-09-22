"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";

import { CsPwaInstallPrompt } from "@/components/cs-pwa-install-prompt";

type NotifPayload = {
  handedToCarrier: Array<{ id: number; wooOrderNumber: string }>;
  confirmDelivery: Array<{ id: number; wooOrderNumber: string }>;
  followUpDue: Array<{ id: number; wooOrderNumber: string }>;
  stockAlerts?: Array<{
    id: number;
    productId: number;
    productName: string;
    model?: string | null;
    stockQuantity: number;
    threshold: number;
  }>;
  totals: {
    handedToCarrier: number;
    confirmDelivery: number;
    followUpDue: number;
    stockAlerts?: number;
    all: number;
  };
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
              {data.stockAlerts && data.stockAlerts.length ? (
                <div>
                  <p className="font-bold text-amber-600">مخزون تحت الحد ({data.totals.stockAlerts || 0})</p>
                  <ul className="mt-1 space-y-1">
                    {data.stockAlerts.slice(0, 8).map((o) => (
                      <li key={`s-${o.id}`}>
                        <Link href="/cs/transfers?low=1" className="underline" onClick={() => setOpen(false)}>
                          {o.productName}
                          {o.model ? ` · ${o.model}` : ""} ({o.stockQuantity}/{o.threshold})
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
  const isTransfersOnly = Boolean(session?.user?.csIsTransfers);
  const canTransfers = Boolean(session?.user?.csCanAccessTransfers || session?.user?.csIsTransfers);

  const navClass = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 whitespace-nowrap ${
      active ? "bg-[var(--cs-gold)] text-black" : "bg-white/10 hover:bg-white/20"
    }`;

  return (
    <header
      className="sticky top-0 z-20 border-b border-black/20 px-3 py-2.5 shadow-md sm:px-4 sm:py-3"
      style={{ background: "var(--cs-navy)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold tracking-tight sm:text-lg">مرحباً، {agentName}</p>
          <p className="text-[11px] text-white/70 sm:text-xs">
            {isTransfersOnly ? "التحويلات · مخزون الموقع وحد الطلب" : "خدمة العملاء · تأكيد الطلبات بالمكالمة"}
          </p>
        </div>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 text-sm font-bold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CsNotificationsBell />
          {!isTransfersOnly ? (
            <Link href="/cs" className={navClass(pathname === "/cs")}>
              القائمة
            </Link>
          ) : null}
          {canTransfers ? (
            <Link href="/cs/transfers" className={navClass(pathname.startsWith("/cs/transfers"))}>
              التحويلات
            </Link>
          ) : null}
          {session?.user?.csIsSupervisor ? (
            <Link href="/cs/assign" className={navClass(pathname.startsWith("/cs/assign"))}>
              توزيع
            </Link>
          ) : null}
          {session?.user?.csIsSupervisor ? (
            <Link href="/cs/reports" className={navClass(pathname.startsWith("/cs/reports"))}>
              تقارير
            </Link>
          ) : null}
          {session?.user?.csIsAdmin ? (
            <Link href="/cs/users" className={navClass(pathname.startsWith("/cs/users"))}>
              المستخدمون
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/cs/login" })}
            className="shrink-0 rounded-full bg-black/50 px-3 py-1.5 hover:bg-black/70"
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
        style={{ ...CS_VARS, background: "linear-gradient(160deg, #000000 0%, #14213D 55%, #000000 120%)" }}
      >
        {children}
        <CsPwaInstallPrompt />
      </div>
    );
  }

  return (
    <SessionProvider>
      <div className="min-h-screen text-[var(--cs-navy)]" dir="rtl" style={{ ...CS_VARS, background: "var(--cs-gray)" }}>
        <CsHeader />
        <main className="mx-auto max-w-7xl p-3 sm:p-6">{children}</main>
        <CsPwaInstallPrompt />
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
    const username = String(formData.get("username") || "").trim();
    const result = await signIn("cs-credentials", {
      email: username,
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
    const username = String(formData.get("username") || "").trim();
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
      body: JSON.stringify({ name, username, password }),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setLoading(false);
      setError(data.message || "تعذر إنشاء الحساب.");
      return;
    }

    const result = await signIn("cs-credentials", {
      email: username,
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
            <p className="mt-2 text-sm text-white/70">اليوزرنيم وكلمة المرور فقط.</p>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            اليوزرنيم
            <input name="username" type="text" required autoComplete="username" className={inputClass} dir="ltr" />
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
            <p className="mt-2 text-sm text-white/70">اسم ظاهر + يوزرنيم + باسورد (بدون إيميل).</p>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            الاسم الظاهر
            <input name="name" type="text" required minLength={2} className={inputClass} placeholder="مثال: سارة" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            اليوزرنيم
            <input
              name="username"
              type="text"
              required
              minLength={2}
              autoComplete="username"
              className={inputClass}
              dir="ltr"
              placeholder="sara"
            />
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
