"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CsPwaInstallPrompt } from "@/components/cs-pwa-install-prompt";
import { ensureDepositAlertUnlockedOnGesture, playLoudDepositAlert } from "@/lib/deposit-alert-sound";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 3a5 5 0 0 0-5 5v2.3c0 .7-.2 1.4-.6 2L5.2 14.5A1.5 1.5 0 0 0 6.5 17h11a1.5 1.5 0 0 0 1.3-2.5L17.6 12.3c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 17a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type NotifPayload = {
  handedToCarrier: Array<{ id: number; wooOrderNumber: string }>;
  confirmDelivery: Array<{ id: number; wooOrderNumber: string }>;
  followUpDue: Array<{ id: number; wooOrderNumber: string }>;
  depositDecisions?: Array<{
    id: number;
    wooOrderNumber: string;
    decision: "approved" | "rejected";
    depositAmount?: number | null;
  }>;
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
    depositDecisions?: number;
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
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<NotifPayload | null>(null);
  const seenDepositIdsRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cs/notifications");
      if (!res.ok) return;
      const json = (await res.json()) as NotifPayload;
      const decisions = json.depositDecisions || [];
      const fresh = decisions.filter((d) => !seenDepositIdsRef.current.has(d.id));
      if (fresh.length > 0) {
        playLoudDepositAlert();
        for (const d of fresh) seenDepositIdsRef.current.add(d.id);
      }
      setData(json);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    ensureDepositAlertUnlockedOnGesture();
    void load();
    const id = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const total = data?.totals.all || 0;
  const depositDecisions = data?.depositDecisions || [];

  async function markDepositSeen() {
    if (!depositDecisions.length) return;
    const ids = depositDecisions.map((d) => d.id);
    try {
      await fetch("/api/cs/notifications/deposit-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              depositDecisions: [],
              totals: {
                ...prev.totals,
                depositDecisions: 0,
                all: Math.max(0, (prev.totals.all || 0) - ids.length),
              },
            }
          : prev,
      );
    } catch {
      // ignore
    }
  }

  function openPanel() {
    setOpen(true);
    void markDepositSeen();
  }

  const panel =
    open && mounted ? (
      <div className="fixed inset-0 z-[9999]" dir="rtl">
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="إغلاق الإشعارات"
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="قائمة الإشعارات"
          className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--cs-navy)]/15 bg-white text-[var(--cs-navy)] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(32rem,80vh)] sm:w-[22rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
            <p className="text-sm font-extrabold">تنبيهات المتابعة</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-200"
            >
              إغلاق
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
            {!data || total === 0 ? (
              <p className="text-slate-500">لا توجد تنبيهات حالياً.</p>
            ) : (
              <div className="space-y-3">
                {depositDecisions.length ? (
                  <div>
                    <p className="font-bold text-emerald-700">قرارات الديبوزت ({depositDecisions.length})</p>
                    <ul className="mt-1 space-y-1">
                      {depositDecisions.slice(0, 8).map((o) => (
                        <li key={`dep-${o.id}`}>
                          <Link
                            href={`/cs/orders/${o.id}`}
                            className="block rounded-lg bg-emerald-50 px-2 py-1.5 font-bold underline"
                            onClick={() => setOpen(false)}
                          >
                            {o.decision === "approved" ? "تمت الموافقة" : "تم الرفض"} على ديبوزت #{o.wooOrderNumber}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data.stockAlerts && data.stockAlerts.length ? (
                  <div>
                    <p className="font-bold text-amber-600">مخزون تحت الحد ({data.totals.stockAlerts || 0})</p>
                    <ul className="mt-1 space-y-1">
                      {data.stockAlerts.slice(0, 8).map((o) => (
                        <li key={`s-${o.id}`}>
                          <Link
                            href="/cs/transfers?low=1"
                            className="block rounded-lg bg-amber-50 px-2 py-1.5 underline"
                            onClick={() => setOpen(false)}
                          >
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
                          <Link
                            href={`/cs/orders/${o.id}`}
                            className="block rounded-lg bg-zinc-50 px-2 py-1.5 underline"
                            onClick={() => setOpen(false)}
                          >
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
                          <Link
                            href={`/cs/orders/${o.id}`}
                            className="block rounded-lg bg-zinc-50 px-2 py-1.5 underline"
                            onClick={() => setOpen(false)}
                          >
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
                          <Link
                            href={`/cs/orders/${o.id}`}
                            className="block rounded-lg bg-zinc-50 px-2 py-1.5 underline"
                            onClick={() => setOpen(false)}
                          >
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
          <div className="flex shrink-0 gap-2 border-t border-black/10 px-4 py-3">
            <Link
              href="/cs"
              className="flex-1 rounded-full bg-[var(--cs-navy)] px-3 py-2 text-center text-xs font-extrabold text-white"
              onClick={() => setOpen(false)}
            >
              الأوردرات
            </Link>
            <Link
              href="/cs/transfers"
              className="flex-1 rounded-full bg-[var(--cs-gold)] px-3 py-2 text-center text-xs font-extrabold text-black"
              onClick={() => setOpen(false)}
            >
              التحويلات
            </Link>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (open) setOpen(false);
          else openPanel();
        }}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-extrabold ${
          depositDecisions.length
            ? "animate-pulse bg-[var(--cs-gold)] text-black"
            : "bg-white/15 text-white hover:bg-white/25"
        }`}
        aria-label="جرس الإشعارات"
        aria-expanded={open}
      >
        <BellIcon className="h-5 w-5 shrink-0" />
        <span>إشعارات</span>
        {total > 0 ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--cs-gold)] px-1.5 text-[11px] font-extrabold text-black">
            {total}
          </span>
        ) : null}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}

function CsHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const agentName = session?.user?.name?.trim() || "مسؤول خدمة العملاء";
  const role = session?.user?.csRole || "";
  const isTransfersOnly = Boolean(session?.user?.csIsTransfers) && !session?.user?.csIsAdmin && !session?.user?.csIsSupervisor;
  const canTransfers = Boolean(
    session?.user?.csIsAdmin ||
      session?.user?.csIsSupervisor ||
      session?.user?.csIsTransfers ||
      session?.user?.csCanAccessTransfers ||
      role === "admin" ||
      role === "supervisor" ||
      role === "transfers",
  );
  const showOrdersQueue = !isTransfersOnly;

  const navClass = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 whitespace-nowrap ${
      active ? "bg-[var(--cs-gold)] text-black" : "bg-white/10 hover:bg-white/20"
    }`;

  return (
    <header
      className="sticky top-0 z-50 overflow-visible border-b border-black/20 px-3 py-2.5 shadow-md sm:px-4 sm:py-3"
      style={{ background: "var(--cs-navy)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 text-white sm:gap-3">
        <div className="flex items-center justify-between gap-3 overflow-visible">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight sm:text-lg">مرحباً، {agentName}</p>
            <p className="text-[11px] text-white/70 sm:text-xs">
              {isTransfersOnly
                ? "التحويلات · مخزون الموقع وحد الطلب"
                : "خدمة العملاء · الأوردرات والتحويلات"}
            </p>
          </div>
          <div className="shrink-0 overflow-visible">
            <CsNotificationsBell />
          </div>
        </div>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 text-sm font-bold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {showOrdersQueue ? (
            <Link href="/cs" className={navClass(pathname === "/cs")}>
              الأوردرات
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
