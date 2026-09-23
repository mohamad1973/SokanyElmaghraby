"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Link } from "@/i18n/navigation";
import { ensureDepositAlertUnlockedOnGesture, playLoudDepositAlert } from "@/lib/deposit-alert-sound";

type DepositItem = {
  id: number;
  wooOrderNumber: string;
  wooOrderId: number;
  customerName: string;
  phone: string;
  total?: string;
  depositAmount: number | null;
  depositPayMethod?: string | null;
  depositFromNumber?: string | null;
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  depositPaidAt?: string | null;
  depositProofUrl?: string | null;
  depositApprovalRequestedAt?: string | null;
  assignedAgent?: { id: number; name: string } | null;
};

const lastPendingDepositIdsKey = "sokany:admin-pending-deposit-ids";
const pollIntervalMs = 8000;

const METHOD_LABEL: Record<string, string> = {
  wallet: "محفظة",
  instapay: "انستا",
};

function readPendingIds(): Set<number> {
  try {
    const raw = window.localStorage.getItem(lastPendingDepositIdsKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

function writePendingIds(ids: Set<number>) {
  window.localStorage.setItem(lastPendingDepositIdsKey, JSON.stringify([...ids]));
}

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

/** Bell for store admin: deposit approval requests only. */
export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositItem | null>(null);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [decideBusy, setDecideBusy] = useState(false);
  const [decideMessage, setDecideMessage] = useState("");
  const [ringPulse, setRingPulse] = useState(false);
  const knownPendingRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    knownPendingRef.current = readPendingIds();
  }, []);

  useEffect(() => {
    ensureDepositAlertUnlockedOnGesture();
    let isMounted = true;

    async function poll() {
      try {
        const notifRes = await fetch("/api/admin/notifications", { cache: "no-store" });

        if (!notifRes.ok) {
          const errBody = (await notifRes.json().catch(() => null)) as { message?: string } | null;
          if (isMounted) {
            setError(errBody?.message || `تعذر تحميل إشعارات الديبوزت (${notifRes.status})`);
          }
          return;
        }

        const payload = (await notifRes.json().catch(() => null)) as { deposits?: DepositItem[] } | null;
        const items = payload?.deposits || [];
        const currentIds = new Set(items.map((d) => d.id));

        if (!initializedRef.current) {
          knownPendingRef.current = currentIds;
          writePendingIds(currentIds);
          initializedRef.current = true;
        } else {
          const freshIds = [...currentIds].filter((id) => !knownPendingRef.current.has(id));
          if (freshIds.length > 0) {
            playLoudDepositAlert();
            if (isMounted) setRingPulse(true);
            window.setTimeout(() => {
              if (isMounted) setRingPulse(false);
            }, 6000);
          }
          knownPendingRef.current = currentIds;
          writePendingIds(currentIds);
        }

        if (isMounted) {
          setDeposits(items);
          setSelectedDeposit((prev) => {
            if (!prev) return null;
            return items.find((d) => d.id === prev.id) || null;
          });
          setError("");
        }
      } catch {
        if (isMounted) setError("تعذر تحميل الإشعارات. تحقق من الاتصال.");
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), pollIntervalMs);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedDeposit) setSelectedDeposit(null);
        else setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    void fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, selectedDeposit]);

  async function decideDeposit(decision: "approved" | "rejected") {
    if (!selectedDeposit) return;
    setDecideBusy(true);
    setDecideMessage("");
    try {
      const res = await fetch(`/api/admin/deposit-approvals/${selectedDeposit.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setDecideMessage(data.message || "تعذر حفظ القرار.");
        setDecideBusy(false);
        return;
      }
      setDeposits((prev) => prev.filter((d) => d.id !== selectedDeposit.id));
      knownPendingRef.current.delete(selectedDeposit.id);
      writePendingIds(knownPendingRef.current);
      setDecideMessage(decision === "approved" ? "تمت الموافقة." : "تم الرفض.");
      setDecideBusy(false);
      window.setTimeout(() => {
        setSelectedDeposit(null);
        setDecideMessage("");
      }, 700);
    } catch {
      setDecideMessage("تعذر حفظ القرار.");
      setDecideBusy(false);
    }
  }

  const hasDeposits = deposits.length > 0;
  const alertActive = hasDeposits || ringPulse;

  const panel =
    open && mounted ? (
      <div className="fixed inset-0 z-[9999]" dir="rtl">
        <button
          type="button"
          className="absolute inset-0 bg-black/45"
          aria-label="إغلاق الإشعارات"
          onClick={() => {
            setSelectedDeposit(null);
            setOpen(false);
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="قائمة الإشعارات"
          className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-black/15 bg-white text-[#14213D] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(36rem,85vh)] sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
            <p className="text-sm font-extrabold">
              {selectedDeposit ? `طلب تأكيد ديبوزت #${selectedDeposit.wooOrderNumber}` : "طلب تأكيد ديبوزت"}
            </p>
            <button
              type="button"
              onClick={() => {
                if (selectedDeposit) {
                  setSelectedDeposit(null);
                  setDecideMessage("");
                } else {
                  setOpen(false);
                }
              }}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-200"
            >
              {selectedDeposit ? "رجوع" : "إغلاق"}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
            {error ? (
              <p className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-700">{error}</p>
            ) : null}

            {selectedDeposit ? (
              <div className="space-y-3">
                <dl className="grid gap-2 rounded-xl bg-[#0D9488]/8 p-3 sm:grid-cols-2">
                  <div>
                    <dt className="font-bold text-zinc-500">العميل</dt>
                    <dd className="font-extrabold">{selectedDeposit.customerName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-zinc-500">الهاتف</dt>
                    <dd dir="ltr" className="font-extrabold">
                      {selectedDeposit.phone || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-zinc-500">قيمة المقدم</dt>
                    <dd className="font-extrabold text-[#0D9488]">{selectedDeposit.depositAmount ?? "—"} ج.م</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-zinc-500">الوكيلة</dt>
                    <dd className="font-extrabold">{selectedDeposit.assignedAgent?.name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-zinc-500">وقت الدفع</dt>
                    <dd className="font-extrabold">
                      {selectedDeposit.depositPaidAt
                        ? new Date(selectedDeposit.depositPaidAt).toLocaleString("ar-EG", {
                            day: "numeric",
                            month: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-zinc-500">الدفع من</dt>
                    <dd className="font-extrabold">
                      {METHOD_LABEL[selectedDeposit.depositPayMethod || ""] ||
                        selectedDeposit.depositPayMethod ||
                        "—"}{" "}
                      · <span dir="ltr">{selectedDeposit.depositFromNumber || "—"}</span>
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-bold text-zinc-500">الدفع إلى</dt>
                    <dd className="font-extrabold">
                      <span dir="ltr">{selectedDeposit.depositToPhone || "—"}</span> ·{" "}
                      {METHOD_LABEL[selectedDeposit.depositToMethod || ""] ||
                        selectedDeposit.depositToMethod ||
                        "—"}
                    </dd>
                  </div>
                </dl>

                {decideMessage ? (
                  <p className="rounded-lg bg-[#FCA311]/20 px-2 py-1.5 text-[11px] font-bold">{decideMessage}</p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={decideBusy}
                    onClick={() => void decideDeposit("approved")}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                  >
                    موافقة — العميل دفع
                  </button>
                  <button
                    type="button"
                    disabled={decideBusy}
                    onClick={() => void decideDeposit("rejected")}
                    className="flex-1 rounded-xl bg-red-700 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                  >
                    رفض — لم يدفع
                  </button>
                </div>
              </div>
            ) : deposits.length === 0 && !error ? (
              <p className="text-zinc-500">لا توجد طلبات تأكيد ديبوزت معلّقة.</p>
            ) : (
              <ul className="space-y-1.5">
                {deposits.map((d) => (
                  <li key={`dep-${d.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDeposit(d);
                        setDecideMessage("");
                      }}
                      className="block w-full rounded-lg bg-[#0D9488]/10 px-3 py-2.5 text-right font-bold text-[#14213D] hover:bg-[#0D9488]/20"
                    >
                      <span className="block">طلب تأكيد ديبوزت #{d.wooOrderNumber}</span>
                      <span className="mt-0.5 block text-[10px] font-bold text-zinc-600">
                        {d.customerName || "عميل"} · {d.depositAmount ?? "?"} ج.م
                        {d.depositPayMethod
                          ? ` · ${METHOD_LABEL[d.depositPayMethod] || d.depositPayMethod}`
                          : ""}
                        {d.assignedAgent?.name ? ` · ${d.assignedAgent.name}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!selectedDeposit ? (
            <div className="flex shrink-0 border-t border-black/10 px-4 py-3">
              <Link
                href="/admin/deposit-approvals"
                className="flex-1 rounded-full bg-[#0D9488] px-3 py-2.5 text-center text-xs font-extrabold text-white"
                onClick={() => setOpen(false)}
              >
                كل طلبات الديبوزت
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setSelectedDeposit(null);
        }}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold ${
          alertActive
            ? "animate-pulse bg-[#FCA311] text-black"
            : "border border-black/10 bg-zinc-50 text-[#14213D] hover:bg-zinc-100"
        }`}
        aria-label="جرس الإشعارات"
        aria-expanded={open}
      >
        <BellIcon className="h-5 w-5 shrink-0" />
        <span>إشعارات</span>
        {hasDeposits ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#0D9488] px-1.5 text-[11px] font-extrabold text-white">
            ديبوزت {deposits.length}
          </span>
        ) : null}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}

/** @deprecated use AdminNotificationsBell */
export function OrderNotificationBar() {
  return (
    <div className="border-b border-black/5 bg-white px-4 py-2" dir="rtl">
      <AdminNotificationsBell />
    </div>
  );
}
