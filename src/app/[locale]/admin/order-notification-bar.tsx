"use client";

import { useEffect, useRef, useState } from "react";

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

/** Bell for admin header: deposit approvals + new orders. */
export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [newOrders, setNewOrders] = useState<NonNullable<LatestOrderResponse["orders"]>>([]);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const knownDepositIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

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
              const fresh =
                previousOrderIndex === -1 ? todayOrders : todayOrders.slice(0, previousOrderIndex);
              if (isMounted) setNewOrders(fresh);
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
            // First load: show all pending, seed known ids, no sound spam
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
            // Drop IDs that are no longer pending so re-requests can alert again
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
    function onDocPointer(e: MouseEvent | PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = newOrders.length + deposits.length;

  function markOrdersRead() {
    if (newOrders[0]) {
      window.localStorage.setItem(lastSeenOrderKey, String(newOrders[0].id));
    }
    setNewOrders([]);
  }

  return (
    <div className="relative z-[60]" ref={rootRef} dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-extrabold ${
          deposits.length > 0
            ? "animate-pulse bg-[#FCA311] text-black"
            : "border border-black/10 bg-zinc-50 text-[#14213D] hover:bg-zinc-100"
        }`}
        aria-label="جرس الإشعارات"
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        <span>إشعارات</span>
        {total > 0 ? (
          <span className="ms-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">
            {total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-[calc(100%+0.5rem)] z-[70] w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-2xl border border-black/10 bg-white p-3 text-[#14213D] shadow-2xl">
          <p className="mb-2 text-sm font-extrabold">قائمة الإشعارات</p>
          {error ? <p className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-700">{error}</p> : null}
          {total === 0 && !error ? (
            <p className="text-xs text-zinc-500">لا توجد إشعارات حالياً.</p>
          ) : (
            <div className="space-y-4 text-xs">
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
                      تمت القراءة
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
      ) : null}
    </div>
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
