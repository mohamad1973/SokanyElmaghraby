import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { bostaBoardRange } from "@/lib/cs/bosta-board";
import { cairoYmdBounds } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";
import {
  listBostaPickedUpDeliveries,
  type BostaPickedUpDelivery,
} from "@/lib/shipping/bosta-client";

export type WarehouseDownRow = {
  id: number;
  wooOrderNumber: string;
  trackingNumber: string;
  invoiceNumber: string;
  invoiceNumberAt: string | null;
  warehouseSheetPrinted: boolean;
  customerName: string;
  phone: string;
};

export type ReconcileMatchedRow = {
  confirmationId: number | null;
  wooOrderNumber: string;
  trackingNumber: string;
  invoiceNumber: string;
  invoiceNumberAt: string | null;
  warehouseSheetPrinted: boolean;
  customerName: string;
  phone: string;
  bostaStatusLabel: string;
  pickedUpAt: string;
};

export type BostaReconcileReport = {
  from: string;
  to: string;
  counts: {
    warehouse: number;
    bostaPicked: number;
    matched: number;
    warehouseOnly: number;
    bostaOnly: number;
  };
  matched: ReconcileMatchedRow[];
  warehouseOnly: WarehouseDownRow[];
  bostaOnly: BostaPickedUpDelivery[];
  bostaError: string | null;
};

function snapOf(value: unknown) {
  if (!value) return {} as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return snapOf(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}

function orderDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function trackingKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

async function listWarehouseDownRows(from: string, to: string): Promise<WarehouseDownRow[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  const start = cairoYmdBounds(from);
  const end = cairoYmdBounds(to);
  if (!start || !end) return [];

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number | bigint;
      wooOrderNumber: string;
      trackingNumber: string | null;
      invoiceNumber: string | null;
      invoiceNumberAt: Date | string | null;
      warehouseSheetPrinted: number | boolean | null;
      customerSnapshot: unknown;
    }>
  >(
    `SELECT id, wooOrderNumber, trackingNumber, invoiceNumber, invoiceNumberAt, warehouseSheetPrinted, customerSnapshot
     FROM CsOrderConfirmation
     WHERE shippingCompany = 'bosta'
       AND invoiceNumber IS NOT NULL AND TRIM(invoiceNumber) <> ''
       AND invoiceNumberAt >= ? AND invoiceNumberAt < ?
     ORDER BY invoiceNumberAt ASC, id ASC
     LIMIT 5000`,
    start.start,
    end.endExclusive,
  );

  return rows.map((row) => {
    const snap = snapOf(row.customerSnapshot);
    return {
      id: Number(row.id),
      wooOrderNumber: String(row.wooOrderNumber || ""),
      trackingNumber: String(row.trackingNumber || "").trim(),
      invoiceNumber: String(row.invoiceNumber || "").trim(),
      invoiceNumberAt:
        row.invoiceNumberAt instanceof Date
          ? row.invoiceNumberAt.toISOString()
          : row.invoiceNumberAt
            ? String(row.invoiceNumberAt)
            : null,
      warehouseSheetPrinted: Boolean(row.warehouseSheetPrinted),
      customerName: String(snap.customerName || "").trim(),
      phone: String(snap.phone || "").trim(),
    };
  });
}

function findBostaMatch(
  warehouse: WarehouseDownRow,
  byTracking: Map<string, BostaPickedUpDelivery>,
  byOrder: Map<string, BostaPickedUpDelivery>,
) {
  const track = trackingKey(warehouse.trackingNumber);
  if (track && byTracking.has(track)) return byTracking.get(track)!;
  const digits = orderDigits(warehouse.wooOrderNumber);
  if (digits && byOrder.has(digits)) return byOrder.get(digits)!;
  return null;
}

/** Compare CS warehouse-down Bosta invoices vs Bosta pickup receipts for the same Cairo day range. */
export async function buildBostaWarehouseReconcile(fromInput: string, toInput: string): Promise<BostaReconcileReport> {
  const range = bostaBoardRange(fromInput, toInput);
  const warehouse = await listWarehouseDownRows(range.from, range.to);
  const bostaResult = await listBostaPickedUpDeliveries(range);
  const bostaRows = bostaResult.ok ? bostaResult.rows : [];
  const bostaError = bostaResult.ok ? null : bostaResult.message;

  const byTracking = new Map<string, BostaPickedUpDelivery>();
  const byOrder = new Map<string, BostaPickedUpDelivery>();
  for (const row of bostaRows) {
    const track = trackingKey(row.trackingNumber);
    if (track) byTracking.set(track, row);
    const digits = orderDigits(row.businessReference);
    if (digits) byOrder.set(digits, row);
  }

  const matched: ReconcileMatchedRow[] = [];
  const warehouseOnly: WarehouseDownRow[] = [];
  const matchedBostaKeys = new Set<string>();

  for (const row of warehouse) {
    const hit = findBostaMatch(row, byTracking, byOrder);
    if (!hit) {
      warehouseOnly.push(row);
      continue;
    }
    matchedBostaKeys.add(trackingKey(hit.trackingNumber) || orderDigits(hit.businessReference));
    matched.push({
      confirmationId: row.id,
      wooOrderNumber: row.wooOrderNumber,
      trackingNumber: row.trackingNumber || hit.trackingNumber,
      invoiceNumber: row.invoiceNumber,
      invoiceNumberAt: row.invoiceNumberAt,
      warehouseSheetPrinted: row.warehouseSheetPrinted,
      customerName: row.customerName || hit.customerName,
      phone: row.phone || hit.phone,
      bostaStatusLabel: hit.statusLabel,
      pickedUpAt: hit.pickedUpAt,
    });
  }

  const bostaOnly = bostaRows.filter((row) => {
    const key = trackingKey(row.trackingNumber) || orderDigits(row.businessReference);
    return key ? !matchedBostaKeys.has(key) : true;
  });

  return {
    from: range.from,
    to: range.to,
    counts: {
      warehouse: warehouse.length,
      bostaPicked: bostaRows.length,
      matched: matched.length,
      warehouseOnly: warehouseOnly.length,
      bostaOnly: bostaOnly.length,
    },
    matched,
    warehouseOnly,
    bostaOnly,
    bostaError,
  };
}
