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
const lastSeenDepositCountKey = "sokany:last-seen-deposit-pending-count";
const pollIntervalMs = 12000;

function getTodayStartIso() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.toISOString();
}

export function OrderNotificationBar() {
  const [open, setOpen] = useState(false);
  const [newOrders, setNewOrders] = useState<NonNullable<LatestOrderResponse["orders"]>>([]);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const knownDepositIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    ensureDepositAlertUnlockedOnGesture();
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
            } else {
              const previousOrderIndex = todayOrders.findIndex((order) => String(order.id) === previousOrderId);
              const fresh =
                previousOrderIndex === -1 ? todayOrders : todayOrders.slice(0, previousOrderIndex);
              if (isMounted) setNewOrders(fresh);
            }
          }
        }

        if (depositRes.ok) {
          const payload = (await depositRes.json().catch(() => null)) as { items?: DepositItem[] } | null;
          const items = payload?.items || [];
          if (!initialized.current) {
            knownDepositIds.current = new Set(items.map((i) => i.id));
            window.localStorage.setItem(lastSeenDepositCountKey, String(items.length));
            initialized.current = true;
          } else {
            const fresh = items.filter((i) => !knownDepositIds.current.has(i.id));
            if (fresh.length > 0) {
              playLoudDepositAlert();
              for (const i of fresh) knownDepositIds.current.add(i.id);
            }
            // also catch count increase when ids already known somehow
            const prevCount = Number(window.localStorage.getItem(lastSeenDepositCountKey) || "0");
            if (items.length > prevCount && fresh.length === 0) {
              playLoudDepositAlert();
            }
            window.localStorage.setItem(lastSeenDepositCountKey, String(items.length));
          }
          if (isMounted) setDeposits(items);
        }
      } catch {
        // ignore
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), pollIntervalMs);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const total = newOrders.length + deposits.length;

  function markOrdersRead() {
    if (newOrders[0]) {
      window.localStorage.setItem(lastSeenOrderKey, String(newOrders[0].id));
    }
    setNewOrders([]);
  }

  return (
    <div className="relative border-b border-brand-gold/40 bg-[#14213D] px-4 py-2 text-sm text-white" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-white/80">إشعارات لوحة التحكم</p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`relative rounded-full px-3 py-1.5 text-sm font-extrabold ${
            deposits.length
              ? "animate-pulse bg-[#FCA311] text-black"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          aria-label="جرس الإشعارات"
        >
          🔔 جرس الأدمن
          {total > 0 ? (
            <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
              {total}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div className="absolute left-4 right-4 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-black/10 bg-white p-3 text-[#14213D] shadow-2xl sm:left-auto sm:right-4 sm:w-96">
          <p className="mb-2 text-sm font-extrabold">قائمة الإشعارات</p>
          {total === 0 ? (
            <p className="text-xs text-zinc-500">لا توجد إشعارات حالياً.</p>
          ) : (
            <div className="space-y-4 text-xs">
              {deposits.length ? (
                <div>
                  <p className="font-extrabold text-[#0D9488]">موافقات ديبوزت ({deposits.length})</p>
                  <ul className="mt-1 space-y-1">
                    {deposits.map((d) => (
                      <li key={`dep-${d.id}`}>
                        <Link
                          href={`/admin/deposit-approvals/${d.id}`}
                          className="font-bold text-[#14213D] underline"
                          onClick={() => setOpen(false)}
                        >
                          #{d.wooOrderNumber} — {d.customerName || "عميل"} — {d.depositAmount ?? "?"} ج.م
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
                  <ul className="mt-1 space-y-1">
                    {newOrders.slice(0, 12).map((o) => (
                      <li key={`ord-${o.id}`}>
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="underline"
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
