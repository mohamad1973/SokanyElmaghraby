import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cairoClock, cairoTodayYmd, cairoYmdFromIso } from "@/lib/cs/order-window";
import { listVisibleSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { openSettlementMarks } from "@/lib/cs/temima-settlement";
import { listBostaReturnedToBusiness } from "@/lib/shipping/bosta-client";

export type MaintenanceBostaRow = {
  trackingNumber: string;
  confirmationId: number | null;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  statusLabel: string;
  receivedAt: string;
  receivedTime: string;
};

export type MaintenanceTemimaRow = {
  confirmationId: number;
  sheetSerial: number | null;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
};

function dayOf(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return cairoYmdFromIso(text);
}

function clockLabel(value: string) {
  const clock = cairoClock(value);
  if (!clock) return "";
  const hour = Math.floor(clock.minutes / 60);
  const minute = clock.minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function orderDigits(value: string) {
  return value.replace(/\D/g, "");
}

async function matchLocalOrders(rows: Array<{ trackingNumber: string; businessReference: string }>) {
  const prisma = getPrismaClient();
  const byTracking = new Map<string, { id: number; wooOrderNumber: string }>();
  const byNumber = new Map<string, { id: number; wooOrderNumber: string }>();
  if (!prisma || !rows.length) return { byTracking, byNumber };
  const trackings = [...new Set(rows.map((row) => row.trackingNumber).filter(Boolean))];
  const numbers = [
    ...new Set(rows.map((row) => orderDigits(row.businessReference)).filter((value) => value.length >= 3)),
  ];
  const found = await prisma.csOrderConfirmation.findMany({
    where: {
      OR: [
        ...(trackings.length ? [{ trackingNumber: { in: trackings } }] : []),
        ...(numbers.length ? [{ wooOrderNumber: { in: numbers } }] : []),
      ],
    },
    select: { id: true, wooOrderNumber: true, trackingNumber: true },
  });
  for (const row of found) {
    const tracking = String(row.trackingNumber || "").trim();
    const packed = { id: row.id, wooOrderNumber: row.wooOrderNumber };
    if (tracking) byTracking.set(tracking, packed);
    const digits = orderDigits(row.wooOrderNumber);
    if (digits) byNumber.set(digits, packed);
  }
  return { byTracking, byNumber };
}

export async function listTodayBostaReceivedReturns() {
  const today = cairoTodayYmd();
  const listed = await listBostaReturnedToBusiness();
  if (!listed.ok) {
    return { day: today, rows: [] as MaintenanceBostaRow[], error: listed.message };
  }
  const todayRows = listed.rows.filter((row) => dayOf(row.receivedAt) === today);
  const matched = await matchLocalOrders(todayRows);
  const rows = todayRows
    .map((row) => {
      const local = matched.byTracking.get(row.trackingNumber) || matched.byNumber.get(orderDigits(row.businessReference));
      return {
        trackingNumber: row.trackingNumber,
        confirmationId: local?.id ?? null,
        wooOrderNumber: local?.wooOrderNumber || orderDigits(row.businessReference),
        customerName: row.customerName,
        phone: row.phone,
        statusLabel: row.statusLabel || "رجعت للراسل",
        receivedAt: row.receivedAt,
        receivedTime: clockLabel(row.receivedAt),
      };
    })
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || right.trackingNumber.localeCompare(left.trackingNumber));
  return { day: today, rows, error: null as string | null };
}

export async function listTodayTemimaReturns() {
  const today = cairoTodayYmd();
  const items = await listVisibleSayedSheet(today, today);
  const marks = await openSettlementMarks(items.map((item) => item.id));
  const rows: MaintenanceTemimaRow[] = items
    .filter((item) => marks.get(item.id) === "return")
    .map((item) => {
      const product = (item.customerSnapshot?.items || [])
        .map((line) => {
          const name = String(line.name || "").trim();
          if (!name) return "";
          return line.quantity && line.quantity > 1 ? `${name} × ${line.quantity}` : name;
        })
        .filter(Boolean)
        .join("، ");
      return {
        confirmationId: item.id,
        sheetSerial: item.sheetSerial && item.sheetSerial > 0 ? item.sheetSerial : null,
        wooOrderNumber: item.wooOrderNumber,
        customerName: item.customerSnapshot?.customerName || "",
        phone: item.customerSnapshot?.phone || "",
        product,
      };
    })
    .sort((left, right) => {
      if (left.sheetSerial && right.sheetSerial) return left.sheetSerial - right.sheetSerial;
      if (left.sheetSerial) return -1;
      if (right.sheetSerial) return 1;
      return orderDigits(right.wooOrderNumber).localeCompare(orderDigits(left.wooOrderNumber), undefined, { numeric: true });
    });
  return { day: today, rows };
}
