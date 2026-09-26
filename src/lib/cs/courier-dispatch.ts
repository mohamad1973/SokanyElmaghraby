import "server-only";

import { getPrismaClient } from "@/lib/db";
import { parseCsRoles } from "@/lib/cs/agents";
import { orderMatchesAreas, parseCourierAreas, serializeCourierAreas } from "@/lib/cs/courier-areas";
import { listCsAreasForGovernorate } from "@/lib/cs/egypt-areas";
import { cairoTodayYmd, cairoYmdBounds } from "@/lib/cs/order-window";

const TEMIMA = "sayed_temima";
const CARD_KEYS = [
  "customer_name",
  "primary_phone",
  "alt_phone",
  "governorate_confirm",
  "area_confirm",
  "address_complete",
  "address_landmarks",
] as const;

type AnswerRow = { itemKey: string; value: string | null; note: string | null };

export type CourierOrderCard = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  altPhone: string;
  governorate: string;
  area: string;
  address: string;
  landmarks: string;
  items: Array<{ name: string; quantity: number }>;
  total: string;
  delivered: boolean;
  outcome: "delivered" | "refused" | "postponed" | null;
  refusalReason: string;
  courierId: number | null;
  courierName: string;
  matches: number[];
};

export type CourierRosterRow = {
  id: number;
  name: string;
  areas: string[];
};

function todayBounds() {
  const bounds = cairoYmdBounds(cairoTodayYmd());
  if (!bounds) throw new Error("cairo day");
  return bounds;
}

function answerText(answers: AnswerRow[], key: string) {
  return String(answers.find((row) => row.itemKey === key)?.value || "").trim();
}

function cardFromRow(row: {
  id: number;
  wooOrderNumber: string;
  customerSnapshot: unknown;
  deliveredToCustomer: boolean;
  courierAgentId: number | null;
  courierOutcome: string | null;
  courierRefusalReason: string | null;
  answers: AnswerRow[];
  courierAgent: { id: number; name: string } | null;
}): Omit<CourierOrderCard, "matches"> {
  const snap = (row.customerSnapshot || {}) as {
    customerName?: string;
    phone?: string;
    address?: string;
    governorate?: string;
    area?: string;
    total?: string;
    items?: Array<{ name?: string; quantity?: number }>;
  };
  const alt = row.answers.find((item) => item.itemKey === "alt_phone");
  const altPhone = String(alt?.note || "").trim();
  return {
    id: row.id,
    wooOrderNumber: row.wooOrderNumber,
    customerName: answerText(row.answers, "customer_name") || snap.customerName || "",
    phone: answerText(row.answers, "primary_phone") || snap.phone || "",
    altPhone,
    governorate: answerText(row.answers, "governorate_confirm") || snap.governorate || "",
    area: answerText(row.answers, "area_confirm") || snap.area || "",
    address: answerText(row.answers, "address_complete") || snap.address || "",
    landmarks: answerText(row.answers, "address_landmarks"),
    items: (snap.items || [])
      .map((item) => ({ name: String(item.name || "").trim(), quantity: Number(item.quantity || 1) }))
      .filter((item) => item.name),
    total: String(snap.total || ""),
    delivered: row.courierOutcome === "delivered" || Boolean(row.deliveredToCustomer),
    outcome:
      row.courierOutcome === "delivered" || row.courierOutcome === "refused" || row.courierOutcome === "postponed"
        ? row.courierOutcome
        : row.deliveredToCustomer
          ? "delivered"
          : null,
    refusalReason: String(row.courierRefusalReason || "").trim(),
    courierId: row.courierAgentId,
    courierName: row.courierAgent?.name || "",
  };
}

async function loadCouriers(): Promise<CourierRosterRow[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  const rows = await prisma.csAgent.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, roles: true, isSupervisor: true, username: true, courierAreas: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((row) => parseCsRoles(row).includes("courier"))
    .map((row) => ({
      id: row.id,
      name: row.name,
      areas: parseCourierAreas(row.courierAreas),
    }));
}

async function loadTodayRows() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  const { start, endExclusive } = todayBounds();
  return prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: TEMIMA,
      OR: [
        { confirmedAt: { gte: start, lt: endExclusive } },
        { courierAssignedAt: { gte: start, lt: endExclusive } },
      ],
    },
    select: {
      id: true,
      wooOrderNumber: true,
      customerSnapshot: true,
      deliveredToCustomer: true,
      courierAgentId: true,
      courierOutcome: true,
      courierRefusalReason: true,
      confirmedAt: true,
      courierAssignedAt: true,
      courierAgent: { select: { id: true, name: true } },
      answers: { where: { itemKey: { in: [...CARD_KEYS] } }, select: { itemKey: true, value: true, note: true } },
    },
    orderBy: { wooOrderNumber: "desc" },
  });
}

export async function loadCourierDispatch(viewerId: number, mode: "supervisor" | "courier") {
  const couriers = mode === "supervisor" ? await loadCouriers() : [];
  const rows = await loadTodayRows();
  const cards = rows.map((row) => {
    const card = cardFromRow(row);
    const matches =
      mode === "supervisor"
        ? couriers.filter((courier) => orderMatchesAreas(card.area, courier.areas)).map((courier) => courier.id)
        : [];
    return { ...card, matches };
  });

  if (mode === "courier") {
    return {
      mode: "courier" as const,
      orders: cards.filter((card) => card.courierId === viewerId),
    };
  }

  const areaOptions = [
    ...new Set([
      ...listCsAreasForGovernorate("القاهرة"),
      ...listCsAreasForGovernorate("الجيزة"),
      ...cards.map((card) => card.area).filter(Boolean),
      ...couriers.flatMap((courier) => courier.areas),
    ]),
  ].sort((a, b) => a.localeCompare(b, "ar"));

  return {
    mode: "supervisor" as const,
    couriers,
    areaOptions,
    pool: cards.filter((card) => !card.courierId),
    assigned: cards.filter((card) => card.courierId),
  };
}

function orderDigits(value: string) {
  return value.replace(/\D/g, "");
}

async function findAssignableOrder(confirmationId?: number, orderNumber?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const { start, endExclusive } = todayBounds();
  if (confirmationId) {
    return prisma.csOrderConfirmation.findFirst({
      where: {
        id: confirmationId,
        status: "CONFIRMED",
        shippingCompany: TEMIMA,
        confirmedAt: { gte: start, lt: endExclusive },
      },
      select: {
        id: true,
        wooOrderNumber: true,
        courierAgentId: true,
        deliveredToCustomer: true,
        deliveredToCustomerAt: true,
        handedToCarrier: true,
        handedToCarrierAt: true,
      },
    });
  }
  const digits = orderDigits(String(orderNumber || ""));
  if (digits.length < 3) return null;
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: TEMIMA,
      confirmedAt: { gte: start, lt: endExclusive },
    },
    select: {
      id: true,
      wooOrderNumber: true,
      courierAgentId: true,
      deliveredToCustomer: true,
      deliveredToCustomerAt: true,
      handedToCarrier: true,
      handedToCarrierAt: true,
    },
  });
  return rows.find((row) => orderDigits(row.wooOrderNumber) === digits) || null;
}

export async function assignCourierOrder(input: { confirmationId?: number; orderNumber?: string; courierId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const couriers = await loadCouriers();
  if (!couriers.some((courier) => courier.id === input.courierId)) {
    return { ok: false as const, message: "المندوب غير موجود." };
  }
  const order = await findAssignableOrder(input.confirmationId, input.orderNumber);
  if (!order) return { ok: false as const, message: "الأوردر مش في شيت تميمة المؤكد النهاردة." };
  if (order.courierAgentId) return { ok: false as const, message: "الأوردر متوزع بالفعل." };
  const now = new Date();
  const updated = await prisma.csOrderConfirmation.updateMany({
    where: { id: order.id, courierAgentId: null },
    data: { courierAgentId: input.courierId, courierAssignedAt: now },
  });
  if (!updated.count) return { ok: false as const, message: "الأوردر اتوزع لمندوب تاني." };
  return { ok: true as const };
}

export async function unassignCourierOrder(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const { start, endExclusive } = todayBounds();
  const order = await prisma.csOrderConfirmation.findFirst({
    where: {
      id: confirmationId,
      status: "CONFIRMED",
      shippingCompany: TEMIMA,
      courierAgentId: { not: null },
      OR: [
        { confirmedAt: { gte: start, lt: endExclusive } },
        { courierAssignedAt: { gte: start, lt: endExclusive } },
      ],
    },
    select: { id: true },
  });
  if (!order) return { ok: false as const, message: "الأوردر مش متوزع." };
  await prisma.csOrderConfirmation.update({
    where: { id: order.id },
    data: { courierAgentId: null, courierAssignedAt: null, courierOutcome: null, courierRefusalReason: null },
  });
  return { ok: true as const };
}

export async function saveCourierAreas(courierId: number, areas: string[]) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const couriers = await loadCouriers();
  if (!couriers.some((courier) => courier.id === courierId)) {
    return { ok: false as const, message: "المندوب غير موجود." };
  }
  await prisma.csAgent.update({
    where: { id: courierId },
    data: { courierAreas: serializeCourierAreas(areas) },
  });
  return { ok: true as const };
}

export async function markCourierOutcome(
  confirmationId: number,
  courierId: number,
  outcome: "delivered" | "refused" | "postponed",
  reason?: string,
) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const note = String(reason || "").trim();
  if (outcome === "refused" && !note) return { ok: false as const, message: "اكتب سبب الرفض." };
  const order = await prisma.csOrderConfirmation.findFirst({
    where: { id: confirmationId, courierAgentId: courierId, status: "CONFIRMED", shippingCompany: TEMIMA },
    select: {
      id: true,
      deliveredToCustomerAt: true,
      handedToCarrierAt: true,
    },
  });
  if (!order) return { ok: false as const, message: "الأوردر مش من أوردراتك." };
  const now = new Date();
  if (outcome === "delivered") {
    await prisma.csOrderConfirmation.update({
      where: { id: order.id },
      data: {
        courierOutcome: "delivered",
        courierRefusalReason: null,
        deliveredToCustomer: true,
        deliveredToCustomerAt: order.deliveredToCustomerAt || now,
        handedToCarrier: true,
        handedToCarrierAt: order.handedToCarrierAt || now,
      },
    });
  } else {
    await prisma.csOrderConfirmation.update({
      where: { id: order.id },
      data: {
        courierOutcome: outcome,
        courierRefusalReason: outcome === "refused" ? note : null,
      },
    });
  }
  return { ok: true as const };
}
