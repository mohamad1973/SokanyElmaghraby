"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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

/** Bell for admin header: deposit approvals + new orders (portal dropdown). */
export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [newOrders, setNewOrders] = useState<NonNullable<LatestOrderResponse["orders"]>>([]);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
                // Stale last-seen: do not treat all today's orders as unread
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

  function updatePanelPosition() {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(22 * 16, window.innerWidth - 16);
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width,
      zIndex: 9999,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    function onResize() {
      updatePanelPosition();
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let removeListeners: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      function onDocPointer(e: PointerEvent) {
        const t = e.target as Node;
        if (buttonRef.current?.contains(t)) return;
        if (panelRef.current?.contains(t)) return;
        setOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      }
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onKey);
      removeListeners = () => {
        document.removeEventListener("pointerdown", onDocPointer);
        document.removeEventListener("keydown", onKey);
      };
    }, 0);

    return () => {
      window.clearTimeout(timer);
      removeListeners?.();
    };
  }, [open]);

  function markOrdersRead() {
    if (newOrders[0]) {
      window.localStorage.setItem(lastSeenOrderKey, String(newOrders[0].id));
    } else {
      // still clear any stale badge by anchoring to "now"
      const latestFromStorage = window.localStorage.getItem(lastSeenOrderKey);
      if (!latestFromStorage) {
        window.localStorage.setItem(lastSeenOrderKey, "0");
      }
    }
    setNewOrders([]);
  }

  const total = newOrders.length + deposits.length;
  const hasDeposits = deposits.length > 0;

  const panel = open && mounted ? (
    <div
      ref={panelRef}
      style={panelStyle}
      className="max-h-[min(24rem,70vh)] overflow-y-auto rounded-2xl border border-black/15 bg-white p-3 text-[#14213D] shadow-2xl"
      dir="rtl"
      role="dialog"
      aria-label="قائمة الإشعارات"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold">قائمة الإشعارات</p>
        <Link
          href="/admin/deposit-approvals"
          className="text-[10px] font-bold text-[#0D9488] underline"
          onClick={() => setOpen(false)}
        >
          كل طلبات الديبوزت
        </Link>
      </div>
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
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`relative inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold ${
          hasDeposits
            ? "animate-pulse bg-[#FCA311] text-black"
            : "border border-black/10 bg-zinc-50 text-[#14213D] hover:bg-zinc-100"
        }`}
        aria-label="جرس الإشعارات"
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
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
