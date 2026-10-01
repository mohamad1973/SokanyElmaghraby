import "server-only";

import { Prisma } from "@prisma/client";

import { parseCsRoles } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";
import { cashAmountOf } from "@/lib/cs/temima-settlement";

export const MONA_COURIER_FEE = 75;

type Outcome = "delivered" | "refused" | "postponed";

type OrderRow = {
  id: number;
  wooOrderNumber: string;
  customerSnapshot: unknown;
  depositAmount: unknown;
  depositPaid: boolean | number | null;
  monaCourierId: number | null;
  monaOutcome: string | null;
  monaRefusalReason: string | null;
  courierName: string | null;
};

type AnswerRow = {
  confirmationId: number;
  itemKey: string;
  value: string | null;
  note: string | null;
};

export type MonaOrderCard = {
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
  cashAmount: number;
  outcome: Outcome | null;
  refusalReason: string;
  courierId: number | null;
  courierName: string;
};

export type MonaLedgerLine = {
  courierId: number;
  name: string;
  delivered: number;
  postponed: number;
  refused: number;
  collected: number;
  fee: number;
  remitted: number;
  remaining: number;
};

function orderDigits(value: string) {
  const folded = String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  return folded.replace(/\D/g, "");
}

function snapshotOf(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (value || {}) as Record<string, unknown>;
}

function answerText(answers: AnswerRow[], key: string) {
  const row = answers.find((item) => item.itemKey === key);
  return String(row?.value || row?.note || "").trim();
}

function cardFrom(row: OrderRow, answers: AnswerRow[]): MonaOrderCard {
  const snap = snapshotOf(row.customerSnapshot) as {
    customerName?: string;
    phone?: string;
    address?: string;
    governorate?: string;
    area?: string;
    total?: string;
    items?: Array<{ name?: string; quantity?: number }>;
  };
  const mine = answers.filter((item) => item.confirmationId === row.id);
  const outcome =
    row.monaOutcome === "delivered" || row.monaOutcome === "refused" || row.monaOutcome === "postponed"
      ? row.monaOutcome
      : null;
  return {
    id: row.id,
    wooOrderNumber: row.wooOrderNumber,
    customerName: answerText(mine, "customer_name") || snap.customerName || "",
    phone: answerText(mine, "primary_phone") || snap.phone || "",
    altPhone: String(mine.find((item) => item.itemKey === "alt_phone")?.note || "").trim(),
    governorate: answerText(mine, "governorate_confirm") || snap.governorate || "",
    area: answerText(mine, "area_confirm") || snap.area || "",
    address: answerText(mine, "address_complete") || snap.address || "",
    landmarks: answerText(mine, "address_landmarks"),
    items: (snap.items || [])
      .map((item) => ({ name: String(item.name || "").trim(), quantity: Number(item.quantity || 1) }))
      .filter((item) => item.name),
    total: String(snap.total || ""),
    cashAmount: cashAmountOf({
      customerSnapshot: snapshotOf(row.customerSnapshot),
      depositAmount: row.depositAmount,
      depositPaid: Boolean(row.depositPaid),
    }),
    outcome,
    refusalReason: String(row.monaRefusalReason || "").trim(),
    courierId: row.monaCourierId,
    courierName: row.courierName || "",
  };
}

export async function listMonaCourierAgents() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  const rows = await prisma.csAgent.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, roles: true, isSupervisor: true, username: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((row) => parseCsRoles(row).includes("mona_courier"))
    .map((row) => ({ id: row.id, name: row.name }));
}

async function loadAssignedOrders(courierId?: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as OrderRow[];
  const rows = courierId
    ? await prisma.$queryRaw<OrderRow[]>`
        SELECT c.id, c.wooOrderNumber, c.customerSnapshot, c.depositAmount, c.depositPaid,
               c.monaCourierId, c.monaOutcome, c.monaRefusalReason, a.name AS courierName
        FROM CsOrderConfirmation c
        LEFT JOIN CsAgent a ON a.id = c.monaCourierId
        WHERE c.monaCourierId = ${courierId}
        ORDER BY c.monaAssignedAt DESC, c.id DESC
      `
    : await prisma.$queryRaw<OrderRow[]>`
        SELECT c.id, c.wooOrderNumber, c.customerSnapshot, c.depositAmount, c.depositPaid,
               c.monaCourierId, c.monaOutcome, c.monaRefusalReason, a.name AS courierName
        FROM CsOrderConfirmation c
        LEFT JOIN CsAgent a ON a.id = c.monaCourierId
        WHERE c.monaCourierId IS NOT NULL
        ORDER BY c.monaAssignedAt DESC, c.id DESC
      `;
  return rows;
}

async function loadAnswers(ids: number[]) {
  const prisma = getPrismaClient();
  if (!prisma || !ids.length) return [] as AnswerRow[];
  return prisma.$queryRaw<AnswerRow[]>`
    SELECT confirmationId, itemKey, value, note
    FROM CsChecklistAnswer
    WHERE confirmationId IN (${Prisma.join(ids)})
  `;
}

async function remittedByCourier() {
  const prisma = getPrismaClient();
  if (!prisma) return new Map<number, number>();
  const rows = await prisma.$queryRaw<Array<{ courierAgentId: number; amount: unknown }>>`
    SELECT courierAgentId, SUM(amount) AS amount
    FROM CsMonaCourierRemit
    GROUP BY courierAgentId
  `;
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(Number(row.courierAgentId), Number(row.amount) || 0);
  }
  return map;
}

function ledgerOf(
  couriers: Array<{ id: number; name: string }>,
  cards: MonaOrderCard[],
  remitted: Map<number, number>,
): MonaLedgerLine[] {
  return couriers.map((courier) => {
    const mine = cards.filter((card) => card.courierId === courier.id);
    const delivered = mine.filter((card) => card.outcome === "delivered");
    const collected = delivered.reduce((sum, card) => sum + card.cashAmount, 0);
    const fee = delivered.length * MONA_COURIER_FEE;
    const paid = remitted.get(courier.id) || 0;
    return {
      courierId: courier.id,
      name: courier.name,
      delivered: delivered.length,
      postponed: mine.filter((card) => card.outcome === "postponed").length,
      refused: mine.filter((card) => card.outcome === "refused").length,
      collected,
      fee,
      remitted: paid,
      remaining: collected - fee - paid,
    };
  });
}

export async function loadMonaDesk(viewerCourierId?: number) {
  const couriers = await listMonaCourierAgents();
  const visible = viewerCourierId ? couriers.filter((row) => row.id === viewerCourierId) : couriers;
  const rows = await loadAssignedOrders(viewerCourierId);
  const answers = await loadAnswers(rows.map((row) => row.id));
  const cards = rows.map((row) => cardFrom(row, answers));
  const remitted = await remittedByCourier();
  return {
    couriers: visible,
    orders: cards,
    ledger: ledgerOf(visible, cards, remitted),
  };
}

export async function assignMonaOrder(orderNumber: string, courierId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  const digits = orderDigits(orderNumber);
  if (!digits) return { ok: false as const, message: "اكتب رقم الأوردر." };
  const couriers = await listMonaCourierAgents();
  if (!couriers.some((row) => row.id === courierId)) {
    return { ok: false as const, message: "اختار مندوب المشرفة." };
  }
  const found = await prisma.$queryRaw<
    Array<{ id: number; status: string; monaCourierId: number | null; shippingCompany: string | null }>
  >`
    SELECT id, status, monaCourierId, shippingCompany
    FROM CsOrderConfirmation
    WHERE REPLACE(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', ''), '-', '') = ${digits}
    ORDER BY id DESC
    LIMIT 1
  `;
  const row = found[0];
  if (!row) return { ok: false as const, message: "الأوردر مش موجود." };
  if (row.status !== "CONFIRMED") return { ok: false as const, message: "الأوردر لازم يكون مؤكد." };
  if (row.shippingCompany === "sayed_temima") {
    return { ok: false as const, message: "تم توزيعه الى سيد تميمة" };
  }
  if (row.monaCourierId && row.monaCourierId !== courierId) {
    return { ok: false as const, message: "الأوردر متضاف لمندوب تاني." };
  }
  if (row.monaCourierId === courierId) {
    return { ok: true as const, message: "الأوردر موجود عند المندوب." };
  }
  const changed = await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET monaCourierId = ${courierId}, monaAssignedAt = NOW(3)
    WHERE id = ${row.id} AND monaCourierId IS NULL
      AND (shippingCompany IS NULL OR shippingCompany <> 'sayed_temima')
  `;
  if (!Number(changed)) {
    return { ok: false as const, message: "تم توزيعه الى سيد تميمة" };
  }
  return { ok: true as const, message: "اتضاف الأوردر للمندوب." };
}

export async function markMonaOutcome(input: {
  confirmationId: number;
  courierId: number;
  outcome: Outcome;
  reason?: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  const reason = String(input.reason || "").trim();
  if (input.outcome === "refused" && !reason) {
    return { ok: false as const, message: "اكتب سبب رفض الاستلام." };
  }
  const rows = await prisma.$queryRaw<Array<{ monaOutcome: string | null }>>`
    SELECT monaOutcome
    FROM CsOrderConfirmation
    WHERE id = ${input.confirmationId} AND monaCourierId = ${input.courierId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, message: "الأوردر مش عندك." };
  if (row.monaOutcome === "delivered") return { ok: false as const, message: "الأوردر اتسلم." };
  await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET monaOutcome = ${input.outcome},
        monaRefusalReason = ${input.outcome === "refused" ? reason : null}
    WHERE id = ${input.confirmationId} AND monaCourierId = ${input.courierId}
  `;
  return { ok: true as const, message: "اتسجل." };
}

export async function recordMonaRemit(courierId: number, amount: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  const couriers = await listMonaCourierAgents();
  if (!couriers.some((row) => row.id === courierId)) {
    return { ok: false as const, message: "المندوب مش موجود." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, message: "اكتب مبلغ التوريد." };
  }
  await prisma.$executeRaw`
    INSERT INTO CsMonaCourierRemit (courierAgentId, amount)
    VALUES (${courierId}, ${amount})
  `;
  return { ok: true as const, message: "اتسجل التوريد." };
}
