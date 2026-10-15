import "server-only";

import { getPrismaClient } from "@/lib/db";
import { listMonaCourierAgents } from "@/lib/cs/mona-courier";
import { cairoClock, cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { sayedSheetYmd } from "@/lib/cs/temima-sheet";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { listVisibleSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { listTemimaFreezePairs } from "@/lib/cs/temima-sheet-freeze";
import { openSettlementMarks } from "@/lib/cs/temima-settlement";
import { listBostaReturnedToBusiness } from "@/lib/shipping/bosta-client";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type MaintenanceLocalRow = {
  confirmationId: number;
  day: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  searchText: string;
};

export type MaintenanceBostaRow = {
  trackingNumber: string;
  confirmationId: number | null;
  day: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  statusLabel: string;
  receivedTime: string;
  searchText: string;
};

export type MaintenanceCourierSection = {
  found: boolean;
  rows: MaintenanceLocalRow[];
};

type Snap = {
  customerName?: string;
  phone?: string;
  address?: string;
  addressFull?: string;
  area?: string;
  governorate?: string;
  trackingNumber?: string;
  items?: Array<{ name?: string; quantity?: number }>;
};

export function maintenanceRange(fromInput: string, toInput: string) {
  const today = cairoTodayYmd();
  let from = DAY.test(fromInput) ? fromInput : today;
  let to = DAY.test(toInput) ? toInput : today;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}

function dayOf(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (DAY.test(text)) return text;
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

function inRange(day: string, from: string, to: string) {
  return Boolean(day) && day >= from && day <= to;
}

function snapshotOf(value: unknown): Snap {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return snapshotOf(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value as Snap;
}

function productLabel(items: Snap["items"]) {
  return (items || [])
    .map((line) => {
      const name = String(line.name || "").trim();
      if (!name) return "";
      return line.quantity && line.quantity > 1 ? `${name} × ${line.quantity}` : name;
    })
    .filter(Boolean)
    .join("، ");
}

function searchBlob(parts: Array<string | number | null | undefined>) {
  const text = parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const digits = text.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : "";
  return [text, digits, last10].filter(Boolean).join(" ");
}

function localSearch(input: {
  wooOrderNumber: string;
  wooOrderId?: number | null;
  customerName: string;
  phone: string;
  address?: string;
  product: string;
  tracking?: string;
  invoice?: string;
}) {
  return searchBlob([
    input.wooOrderNumber,
    input.wooOrderId,
    input.customerName,
    input.phone,
    input.address,
    input.product,
    input.tracking,
    input.invoice,
  ]);
}

type MatchedOrder = {
  id: number;
  wooOrderNumber: string;
  invoiceNumber: string;
  trackingNumber: string;
  snap: Snap;
};

async function matchLocalOrders(rows: Array<{ trackingNumber: string; businessReference: string }>) {
  const prisma = getPrismaClient();
  const byTracking = new Map<string, MatchedOrder>();
  const byNumber = new Map<string, MatchedOrder>();
  if (!prisma || !rows.length) return { byTracking, byNumber };
  const trackings = [...new Set(rows.map((row) => row.trackingNumber).filter(Boolean))];
  const numbers = [
    ...new Set(rows.map((row) => orderDigits(row.businessReference)).filter((value) => value.length >= 3)),
  ];
  if (!trackings.length && !numbers.length) return { byTracking, byNumber };
  const found = await prisma.csOrderConfirmation.findMany({
    where: {
      OR: [
        ...(trackings.length ? [{ trackingNumber: { in: trackings } }] : []),
        ...(numbers.length ? [{ wooOrderNumber: { in: numbers } }] : []),
      ],
    },
    select: { id: true, wooOrderNumber: true, trackingNumber: true, invoiceNumber: true, customerSnapshot: true },
  });
  for (const row of found) {
    const packed: MatchedOrder = {
      id: row.id,
      wooOrderNumber: row.wooOrderNumber,
      invoiceNumber: String(row.invoiceNumber || ""),
      trackingNumber: String(row.trackingNumber || "").trim(),
      snap: snapshotOf(row.customerSnapshot),
    };
    if (packed.trackingNumber) byTracking.set(packed.trackingNumber, packed);
    const digits = orderDigits(row.wooOrderNumber);
    if (digits) byNumber.set(digits, packed);
  }
  return { byTracking, byNumber };
}

export async function listBostaReceivedReturns(from: string, to: string) {
  const listed = await listBostaReturnedToBusiness({ from, to });
  if (!listed.ok) {
    return { rows: [] as MaintenanceBostaRow[], error: listed.message };
  }
  const ranged = listed.rows.filter((row) => inRange(dayOf(row.receivedAt), from, to));
  const matched = await matchLocalOrders(ranged);
  const rows = ranged
    .map((row) => {
      const local = matched.byTracking.get(row.trackingNumber) || matched.byNumber.get(orderDigits(row.businessReference));
      const snap = local?.snap || {};
      const product = productLabel(snap.items);
      const day = dayOf(row.receivedAt);
      const wooOrderNumber = local?.wooOrderNumber || orderDigits(row.businessReference);
      const customerName = local?.snap.customerName || row.customerName;
      const phone = local?.snap.phone || row.phone;
      return {
        trackingNumber: row.trackingNumber,
        confirmationId: local?.id ?? null,
        day,
        wooOrderNumber,
        customerName,
        phone,
        product,
        statusLabel: row.statusLabel || "رجعت للراسل",
        receivedTime: clockLabel(row.receivedAt),
        searchText: searchBlob([
          row.trackingNumber,
          row.businessReference,
          wooOrderNumber,
          customerName,
          phone,
          row.phone,
          product,
          snap.address,
          snap.addressFull,
          snap.area,
          snap.governorate,
          snap.trackingNumber,
          local?.invoiceNumber,
          local?.trackingNumber,
        ]),
      };
    })
    .sort((left, right) => right.day.localeCompare(left.day) || right.trackingNumber.localeCompare(left.trackingNumber));
  return { rows, error: null as string | null };
}

export async function listTemimaReturns(from: string, to: string) {
  const [items, cutoffs, pairs] = await Promise.all([
    listVisibleSayedSheet(from, to),
    listTemimaCutoffs(),
    listTemimaFreezePairs(from, to),
  ]);
  const marks = await openSettlementMarks(items.map((item) => item.id));
  const frozenDay = new Map<number, string>();
  for (const pair of pairs) {
    if (!frozenDay.has(pair.confirmationId)) frozenDay.set(pair.confirmationId, pair.dayYmd);
  }
  const rows: MaintenanceLocalRow[] = items
    .filter((item) => marks.get(item.id) === "return")
    .map((item) => {
      const snap = item.customerSnapshot;
      const product = productLabel(snap?.items);
      const liveDay = sayedSheetYmd(item, cutoffs) || "";
      const day = frozenDay.get(item.id) || (inRange(liveDay, from, to) ? liveDay : "");
      return {
        confirmationId: item.id,
        day,
        wooOrderNumber: item.wooOrderNumber,
        customerName: snap?.customerName || "",
        phone: snap?.phone || "",
        product,
        searchText: localSearch({
          wooOrderNumber: item.wooOrderNumber,
          wooOrderId: item.wooOrderId,
          customerName: snap?.customerName || "",
          phone: snap?.phone || "",
          address: [snap?.addressFull, snap?.address, snap?.area, snap?.governorate].filter(Boolean).join(" "),
          product,
          tracking: item.trackingNumber || snap?.trackingNumber || "",
          invoice: item.invoiceNumber || "",
        }),
      };
    })
    .sort((left, right) => right.day.localeCompare(left.day) || orderDigits(right.wooOrderNumber).localeCompare(orderDigits(left.wooOrderNumber), undefined, { numeric: true }));
  return { rows };
}

function courierBucket(name: string) {
  const text = name.replace(/\s+/g, "");
  if (text.includes("مؤمن")) return "momen" as const;
  if (text.includes("عيد")) return "eid" as const;
  return null;
}

async function listMonaOfficialReturns(courierIds: number[], from: string, to: string) {
  const prisma = getPrismaClient();
  if (!prisma || !courierIds.length) return [] as MaintenanceLocalRow[];
  const start = cairoYmdBounds(from);
  const end = cairoYmdBounds(to);
  if (!start || !end) return [];
  const ids = [...new Set(courierIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number | bigint;
      wooOrderNumber: string;
      invoiceNumber: string | null;
      trackingNumber: string | null;
      customerSnapshot: unknown;
      monaAssignedAt: Date | string | null;
      monaRefusalReason: string | null;
    }>
  >(
    `SELECT c.id, c.wooOrderNumber, c.invoiceNumber, c.trackingNumber, c.customerSnapshot, c.monaAssignedAt, c.monaRefusalReason
     FROM CsOrderConfirmation c
     WHERE c.monaCourierId IN (${ids.join(",")})
       AND c.monaSupervisorResult = 'refused'
       AND c.monaAssignedAt >= ?
       AND c.monaAssignedAt < ?`,
    start.start,
    end.endExclusive,
  );
  return rows
    .map((row) => {
      const snap = snapshotOf(row.customerSnapshot);
      const product = productLabel(snap.items);
      const assigned = row.monaAssignedAt instanceof Date ? row.monaAssignedAt.toISOString() : String(row.monaAssignedAt || "");
      const day = dayOf(assigned);
      const customerName = snap.customerName || "";
      const phone = snap.phone || "";
      return {
        confirmationId: Number(row.id),
        day,
        wooOrderNumber: row.wooOrderNumber,
        customerName,
        phone,
        product,
        searchText: localSearch({
          wooOrderNumber: row.wooOrderNumber,
          customerName,
          phone,
          address: [snap.addressFull, snap.address, snap.area, snap.governorate, row.monaRefusalReason].filter(Boolean).join(" "),
          product,
          tracking: row.trackingNumber || snap.trackingNumber || "",
          invoice: row.invoiceNumber || "",
        }),
      };
    })
    .filter((row) => inRange(row.day, from, to))
    .sort((left, right) => right.day.localeCompare(left.day) || orderDigits(right.wooOrderNumber).localeCompare(orderDigits(left.wooOrderNumber), undefined, { numeric: true }));
}

export async function listCourierReturns(from: string, to: string) {
  const couriers = await listMonaCourierAgents();
  const eidIds = couriers.filter((courier) => courierBucket(courier.name) === "eid").map((courier) => courier.id);
  const momenIds = couriers.filter((courier) => courierBucket(courier.name) === "momen").map((courier) => courier.id);
  const [eidRows, momenRows] = await Promise.all([
    listMonaOfficialReturns(eidIds, from, to),
    listMonaOfficialReturns(momenIds, from, to),
  ]);
  return {
    eid: { found: eidIds.length > 0, rows: eidRows },
    momen: { found: momenIds.length > 0, rows: momenRows },
  };
}
