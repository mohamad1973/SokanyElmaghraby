import "server-only";

import { getPrismaClient } from "@/lib/db";
import { ensureCsTables } from "@/lib/cs/agents";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { resolveCsViewer, setCsHandedToCarrier } from "@/lib/cs/confirmations";
import { cairoTodayYmd, cairoYmdBounds } from "@/lib/cs/order-window";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type BostaBoardRow = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  product: string;
  trackingNumber: string;
  waybillPrinted: boolean;
  handedToCarrier: boolean;
  bostaStatus: string;
  bostaStatusLabel: string;
  confirmedAt: string;
};

export function bostaBoardRange(fromInput: string, toInput: string) {
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

function productLabel(items: unknown) {
  if (!Array.isArray(items)) return "";
  return items
    .map((line) => {
      const row = line as { name?: string; quantity?: number };
      const name = String(row.name || "").trim();
      if (!name) return "";
      return row.quantity && row.quantity > 1 ? `${name} × ${row.quantity}` : name;
    })
    .filter(Boolean)
    .join("، ");
}

export async function listBostaBoard(from: string, to: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as BostaBoardRow[];
  await ensureCsTables();
  const start = cairoYmdBounds(from);
  const end = cairoYmdBounds(to);
  if (!start || !end) return [];
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: CS_CONFIRMATION_STATUS.CONFIRMED,
      shippingCompany: "bosta",
      confirmedAt: { gte: start.start, lt: end.endExclusive },
    },
    select: {
      id: true,
      wooOrderNumber: true,
      trackingNumber: true,
      waybillPrinted: true,
      handedToCarrier: true,
      bostaStatus: true,
      confirmedAt: true,
      customerSnapshot: true,
    },
    orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
    take: 500,
  });
  return rows.map((row) => {
    const snap = snapOf(row.customerSnapshot);
    const status = String(row.bostaStatus || "").trim();
    return {
      id: row.id,
      wooOrderNumber: row.wooOrderNumber,
      customerName: String(snap.customerName || "").trim(),
      phone: String(snap.phone || "").trim(),
      governorate: String(snap.governorate || "").trim(),
      area: String(snap.area || "").trim(),
      address: String(snap.addressFull || snap.address || "").trim(),
      product: productLabel(snap.items),
      trackingNumber: String(row.trackingNumber || snap.trackingNumber || "").trim(),
      waybillPrinted: Boolean(row.waybillPrinted),
      handedToCarrier: Boolean(row.handedToCarrier),
      bostaStatus: status,
      bostaStatusLabel: status ? getBostaStatusLabelAr(status) : "—",
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : "",
    };
  });
}

/** One-click board save: mark handed to Bosta without opening the order page. */
export async function saveBostaBoardRow(confirmationId: number, agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  const viewer = await resolveCsViewer(agentId);
  const allowed = viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor);
  if (!allowed) return { ok: false as const, message: "للأدمن ومشرفة خدمة العملاء فقط." };
  if (!Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: false as const, message: "الأوردر غير موجود." };
  }
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    select: { id: true, status: true, shippingCompany: true, handedToCarrier: true },
  });
  if (!row) return { ok: false as const, message: "الأوردر غير موجود." };
  if (row.status !== CS_CONFIRMATION_STATUS.CONFIRMED) {
    return { ok: false as const, message: "الأوردر لازم يكون متأكد الأول." };
  }
  if (row.shippingCompany !== "bosta") {
    return { ok: false as const, message: "الأوردر مش على بوسطة." };
  }
  if (row.handedToCarrier) {
    return { ok: true as const, message: "الأوردر متسجل على اللوحة.", handedToCarrier: true };
  }
  const result = await setCsHandedToCarrier({ id: confirmationId, handedToCarrier: true, agentId });
  if (!result.ok) return { ok: false as const, message: result.message };
  return { ok: true as const, message: "اتحفظ من اللوحة.", handedToCarrier: true };
}
