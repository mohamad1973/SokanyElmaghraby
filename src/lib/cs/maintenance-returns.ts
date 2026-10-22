import "server-only";

import { getPrismaClient } from "@/lib/db";
import { listMonaCourierAgents } from "@/lib/cs/mona-courier";
import { cairoDaysAgoYmd, cairoTodayYmd } from "@/lib/cs/order-window";
import {
  backfillDeskReturnCaptures,
  listCapturedBostaReturns,
  listCapturedReturns,
  type DeskReturnSource,
  type ReturnCaptureSource,
  type StoredBostaReturn,
} from "@/lib/cs/bosta-return-capture";
import { linkedProductLabel, listBostaReturnProducts, type LinkedReturnProduct } from "@/lib/cs/bosta-return-product";
import { listBostaReturnReviews, type BostaReturnReview } from "@/lib/cs/bosta-return-review";
import { ensureMaintenanceLifecycleColumns, listCaptureExtras } from "@/lib/cs/bosta-return-lifecycle";
import type { BostaHeadingKind } from "@/lib/shipping/bosta-client";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type MaintenanceBostaRow = {
  trackingNumber: string;
  confirmationId: number | null;
  day: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  orderProduct: string;
  linkedProducts: LinkedReturnProduct[];
  kind: BostaHeadingKind;
  statusLabel: string;
  reasonText: string;
  note: string;
  openedAt: string | null;
  review: BostaReturnReview | null;
  searchText: string;
  source: ReturnCaptureSource;
};

export type MaintenanceCourierSection = {
  found: boolean;
  rows: MaintenanceBostaRow[];
  error?: string | null;
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

/** Default window keeps recent days visible (yesterday no longer "disappears"). */
export function maintenanceRange(fromInput: string, toInput: string) {
  const today = cairoTodayYmd();
  const defaultFrom = cairoDaysAgoYmd(6);
  let from = DAY.test(fromInput) ? fromInput : defaultFrom;
  let to = DAY.test(toInput) ? toInput : today;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}

function orderDigits(value: string) {
  return value.replace(/\D/g, "");
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

const KIND_LABEL: Record<BostaHeadingKind, string> = {
  refused: "رفض استلام",
  return: "استرجاع",
  exchange: "استبدال",
};

async function hydrateCapturedReturnRows(stored: StoredBostaReturn[]): Promise<MaintenanceBostaRow[]> {
  const trackings = stored.map((row) => row.trackingNumber);
  const [matched, reviews, linkedProducts, extras] = await Promise.all([
    matchLocalOrders(stored),
    listBostaReturnReviews(trackings),
    listBostaReturnProducts(trackings),
    listCaptureExtras(trackings),
  ]);
  return stored
    .map((row) => {
      const local =
        matched.byTracking.get(row.trackingNumber) || matched.byNumber.get(orderDigits(row.businessReference));
      const snap = local?.snap || {};
      const orderProduct = productLabel(snap.items);
      const linked = linkedProducts.get(row.trackingNumber) || [];
      const product = linked.length ? linkedProductLabel(linked) : orderProduct;
      const wooOrderNumber = local?.wooOrderNumber || row.wooOrderNumber || orderDigits(row.businessReference);
      const customerName = snap.customerName || row.customerName;
      const phone = snap.phone || row.phone;
      const extra = extras.get(row.trackingNumber);
      const review = reviews.get(row.trackingNumber) || null;
      return {
        trackingNumber: row.trackingNumber,
        confirmationId: local?.id ?? row.confirmationId,
        day: row.seenDay,
        wooOrderNumber,
        customerName,
        phone,
        product,
        orderProduct,
        linkedProducts: linked,
        kind: row.kind,
        statusLabel: KIND_LABEL[row.kind],
        reasonText: row.reasonText,
        note: extra?.note || "",
        openedAt: extra?.openedAt || null,
        review,
        source: row.source,
        searchText: searchBlob([
          row.trackingNumber,
          row.businessReference,
          wooOrderNumber,
          customerName,
          phone,
          row.phone,
          product,
          KIND_LABEL[row.kind],
          review?.label,
          row.reasonText,
          extra?.note,
          review?.techNote,
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
    .sort(
      (left, right) =>
        right.day.localeCompare(left.day) || right.trackingNumber.localeCompare(left.trackingNumber),
    );
}

export async function listBostaReceivedReturns(from: string, to: string) {
  try {
    await ensureMaintenanceLifecycleColumns();
    const stored = await listCapturedBostaReturns(from, to);
    return { rows: await hydrateCapturedReturnRows(stored), error: null as string | null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[maintenance-returns] listBostaReceivedReturns", detail);
    return { rows: [], error: "تعذر تحميل مرتجعات بوسطة. حاول مرة أخرى." as string | null };
  }
}

async function listDeskReceivedReturns(source: DeskReturnSource, from: string, to: string) {
  try {
    await backfillDeskReturnCaptures(from, to);
    await ensureMaintenanceLifecycleColumns();
    const stored = await listCapturedReturns(from, to, [source]);
    return { rows: await hydrateCapturedReturnRows(stored), error: null as string | null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[maintenance-returns] listDeskReceivedReturns", source, detail);
    return { rows: [] as MaintenanceBostaRow[], error: "تعذر تحميل مرتجعات المندوب. حاول مرة أخرى." as string | null };
  }
}

export async function listTemimaReturns(from: string, to: string) {
  return listDeskReceivedReturns("temima", from, to);
}

function courierBucket(name: string) {
  const text = name.replace(/\s+/g, "");
  if (text.includes("مؤمن")) return "momen" as const;
  if (text.includes("عيد")) return "eid" as const;
  return null;
}

export async function listCourierReturns(from: string, to: string) {
  const couriers = await listMonaCourierAgents();
  const eidFound = couriers.some((courier) => courierBucket(courier.name) === "eid");
  const momenFound = couriers.some((courier) => courierBucket(courier.name) === "momen");
  const [eid, momen] = await Promise.all([
    listDeskReceivedReturns("eid", from, to),
    listDeskReceivedReturns("momen", from, to),
  ]);
  return {
    eid: { found: eidFound, rows: eid.rows, error: eid.error },
    momen: { found: momenFound, rows: momen.rows, error: momen.error },
  };
}
