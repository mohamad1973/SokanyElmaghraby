"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Link } from "@/i18n/navigation";
import { ensureDepositAlertUnlockedOnGesture, playLoudDepositAlert } from "@/lib/deposit-alert-sound";

type LatestOrderResponse = {
  orders?: Array<{
    id: number;
    number: string;
    customerName: string;
    phone: string;
    total: string;
    currency: string;
    dateCreated: string;
  }>;
};

type DepositItem = {
  id: number;
  wooOrderNumber: string;
  wooOrderId: number;
  customerName: string;
  phone: string;
  depositAmount: number | null;
  depositApprovalRequestedAt?: string | null;
};

const lastSeenOrderKey = "sokany:last-seen-order-id";
const lastSeenDepositIdsKey = "sokany:last-seen-deposit-pending-ids";
const pollIntervalMs = 10000;

function getTodayStartIso() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.toISOString();
}

function readKnownDepositIds(): Set<number> {
  try {
    const raw = window.localStorage.getItem(lastSeenDepositIdsKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

function writeKnownDepositIds(ids: Set<number>) {
  window.localStorage.setItem(lastSeenDepositIdsKey, JSON.stringify([...ids]));
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

/** Bell for admin header: deposit approvals + new orders (fixed portal panel). */
export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [newOrders, setNewOrders] = useState<NonNullable<LatestOrderResponse["orders"]>>([]);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const knownDepositIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    ensureDepositAlertUnlockedOnGesture();
    knownDepositIds.current = readKnownDepositIds();
    let isMounted = true;

    async function poll() {
      try {
        const params = new URLSearchParams({
          per_page: "100",
          after: getTodayStartIso(),
        });
        const [ordersRes, depositRes] = await Promise.all([
          fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" }),
          fetch("/api/admin/deposit-approvals", { cache: "no-store" }),
        ]);

        if (ordersRes.ok) {
          const payload = (await ordersRes.json().catch(() => null)) as LatestOrderResponse | null;
          const todayOrders = payload?.orders || [];
          const latestOrder = todayOrders[0];
          if (latestOrder) {
            const previousOrderId = window.localStorage.getItem(lastSeenOrderKey);
            if (!previousOrderId) {
              window.localStorage.setItem(lastSeenOrderKey, String(latestOrder.id));
              if (isMounted) setNewOrders([]);
            } else {
              const previousOrderIndex = todayOrders.findIndex((order) => String(order.id) === previousOrderId);
              if (previousOrderIndex === -1) {
                window.localStorage.setItem(lastSeenOrderKey, String(latestOrder.id));
                if (isMounted) setNewOrders([]);
              } else {
                const fresh = todayOrders.slice(0, previousOrderIndex);
                if (isMounted) setNewOrders(fresh);
              }
            }
          } else if (isMounted) {
            setNewOrders([]);
          }
        }

        if (!depositRes.ok) {
          const errBody = (await depositRes.json().catch(() => null)) as { message?: string } | null;
          if (isMounted) {
            setError(errBody?.message || `تعذر تحميل إشعارات الديبوزت (${depositRes.status})`);
          }
        } else {
          const payload = (await depositRes.json().catch(() => null)) as { items?: DepositItem[] } | null;
          const items = payload?.items || [];
          if (!initialized.current) {
            for (const i of items) knownDepositIds.current.add(i.id);
            writeKnownDepositIds(knownDepositIds.current);
            initialized.current = true;
          } else {
            const fresh = items.filter((i) => !knownDepositIds.current.has(i.id));
            if (fresh.length > 0) {
              playLoudDepositAlert();
              for (const i of fresh) knownDepositIds.current.add(i.id);
              writeKnownDepositIds(knownDepositIds.current);
            }
            const pendingSet = new Set(items.map((i) => i.id));
            for (const id of [...knownDepositIds.current]) {
              if (!pendingSet.has(id)) knownDepositIds.current.delete(id);
            }
            writeKnownDepositIds(knownDepositIds.current);
          }
          if (isMounted) {
            setDeposits(items);
            setError("");
          }
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

  function markOrdersRead() {
    if (newOrders[0]) {
      window.localStorage.setItem(lastSeenOrderKey, String(newOrders[0].id));
    } else {
      const latestFromStorage = window.localStorage.getItem(lastSeenOrderKey);
      if (!latestFromStorage) {
        window.localStorage.setItem(lastSeenOrderKey, "0");
      }
    }
    setNewOrders([]);
  }

  const total = newOrders.length + deposits.length;
  const hasDeposits = deposits.length > 0;

  const panel =
    open && mounted ? (
      <div className="fixed inset-0 z-[9999]" dir="rtl">
        <button
          type="button"
          className="absolute inset-0 bg-black/45"
          aria-label="إغلاق الإشعارات"
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="قائمة الإشعارات"
          className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-black/15 bg-white text-[#14213D] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(32rem,80vh)] sm:w-[24rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
            <p className="text-sm font-extrabold">قائمة الإشعارات</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-200"
            >
              إغلاق
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
            {error ? (
              <p className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-700">{error}</p>
            ) : null}
            {total === 0 && !error ? (
              <p className="text-zinc-500">لا توجد إشعارات حالياً.</p>
            ) : (
              <div className="space-y-4">
                {deposits.length ? (
                  <div>
                    <p className="font-extrabold text-[#0D9488]">موافقات ديبوزت ({deposits.length})</p>
                    <ul className="mt-1 space-y-1.5">
                      {deposits.map((d) => (
                        <li key={`dep-${d.id}`}>
                          <Link
                            href={`/admin/deposit-approvals/${d.id}`}
                            className="block rounded-lg bg-[#0D9488]/10 px-2 py-1.5 font-bold text-[#14213D] hover:bg-[#0D9488]/20"
                            onClick={() => setOpen(false)}
                          >
                            طلب تأكيد ديبوزت #{d.wooOrderNumber}
                            <span className="mt-0.5 block text-[10px] font-bold text-zinc-600">
                              {d.customerName || "عميل"} · {d.depositAmount ?? "?"} ج.م
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {newOrders.length ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-extrabold text-[#FCA311]">طلبات جديدة اليوم ({newOrders.length})</p>
                      <button type="button" onClick={markOrdersRead} className="text-[10px] font-bold underline">
                        تصفير طلبات اليوم
                      </button>
                    </div>
                    <ul className="mt-1 space-y-1.5">
                      {newOrders.slice(0, 12).map((o) => (
                        <li key={`ord-${o.id}`}>
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="block rounded-lg bg-zinc-50 px-2 py-1.5 underline"
                            onClick={() => {
                              markOrdersRead();
                              setOpen(false);
                            }}
                          >
                            #{o.number} — {o.customerName} — {o.total} {o.currency}
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
              href="/admin/deposit-approvals"
              className="flex-1 rounded-full bg-[#0D9488] px-3 py-2.5 text-center text-xs font-extrabold text-white"
              onClick={() => setOpen(false)}
            >
              كل طلبات الديبوزت
            </Link>
            <Link
              href="/admin/orders"
              className="flex-1 rounded-full bg-[#14213D] px-3 py-2.5 text-center text-xs font-extrabold text-white"
              onClick={() => setOpen(false)}
            >
              الطلبات
            </Link>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold ${
          hasDeposits
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
        {!hasDeposits && total > 0 ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white">
            {total}
          </span>
        ) : null}
        {hasDeposits && newOrders.length > 0 ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white">
            +{newOrders.length}
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
