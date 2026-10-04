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
  items: Array<{ name: string; quantity: number; price: number; lineTotal: number }>;
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
  goods: number;
  collected: number;
  fee: number;
  remitted: number;
  remaining: number;
  invoiceCollected: number;
  invoiceShipping: number;
  invoiceRemitted: number;
  invoiceRemaining: number;
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
    items?: Array<{ name?: string; quantity?: number; price?: number | string; total?: number | string }>;
  };
  const id = Number(row.id);
  const courierId = row.monaCourierId == null ? null : Number(row.monaCourierId);
  const mine = answers.filter((item) => Number(item.confirmationId) === id);
  const outcome =
    row.monaOutcome === "delivered" || row.monaOutcome === "refused" || row.monaOutcome === "postponed"
      ? row.monaOutcome
      : null;
  return {
    id,
    wooOrderNumber: row.wooOrderNumber,
    customerName: answerText(mine, "customer_name") || snap.customerName || "",
    phone: answerText(mine, "primary_phone") || snap.phone || "",
    altPhone: String(mine.find((item) => item.itemKey === "alt_phone")?.note || "").trim(),
    governorate: answerText(mine, "governorate_confirm") || snap.governorate || "",
    area: answerText(mine, "area_confirm") || snap.area || "",
    address: answerText(mine, "address_complete") || snap.address || "",
    landmarks: answerText(mine, "address_landmarks"),
    items: (snap.items || [])
      .map((item) => {
        const name = String(item.name || "").trim();
        const quantity = Number(item.quantity || 1) || 1;
        const lineTotal = Number(String(item.total ?? "").replace(/[^\d.]/g, "")) || 0;
        const priceRaw = Number(String(item.price ?? "").replace(/[^\d.]/g, "")) || 0;
        const price = priceRaw || (quantity ? lineTotal / quantity : 0);
        return { name, quantity, price, lineTotal: lineTotal || price * quantity };
      })
      .filter((item) => item.name),
    total: String(snap.total || ""),
    cashAmount: cashAmountOf({
      customerSnapshot: snapshotOf(row.customerSnapshot),
      depositAmount: row.depositAmount,
      depositPaid: Boolean(row.depositPaid),
    }),
    outcome,
    refusalReason: String(row.monaRefusalReason || "").trim(),
    courierId,
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
    .map((row) => ({ id: Number(row.id), name: row.name }));
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

type CourierAdjust = {
  collected: number | null;
  shipping: number | null;
  remitted: number | null;
};

async function ensureMonaAdjustTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsMonaCourierAdjust\` (
      \`courierAgentId\` INT NOT NULL,
      \`collectedAmount\` DECIMAL(12,2) NULL,
      \`shippingAmount\` DECIMAL(12,2) NULL,
      \`remittedAmount\` DECIMAL(12,2) NULL,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`courierAgentId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function loadMonaAdjusts() {
  const prisma = getPrismaClient();
  const map = new Map<number, CourierAdjust>();
  if (!prisma) return map;
  await ensureMonaAdjustTable();
  const rows = await prisma.$queryRaw<
    Array<{ courierAgentId: number; collectedAmount: unknown; shippingAmount: unknown; remittedAmount: unknown }>
  >`
    SELECT courierAgentId, collectedAmount, shippingAmount, remittedAmount
    FROM CsMonaCourierAdjust
  `;
  for (const row of rows) {
    map.set(Number(row.courierAgentId), {
      collected: row.collectedAmount == null ? null : Number(row.collectedAmount),
      shipping: row.shippingAmount == null ? null : Number(row.shippingAmount),
      remitted: row.remittedAmount == null ? null : Number(row.remittedAmount),
    });
  }
  return map;
}

function ledgerOf(
  couriers: Array<{ id: number; name: string }>,
  cards: MonaOrderCard[],
  remitted: Map<number, number>,
  adjusts: Map<number, CourierAdjust>,
): MonaLedgerLine[] {
  return couriers.map((courier) => {
    const mine = cards.filter((card) => card.courierId === Number(courier.id));
    const delivered = mine.filter((card) => card.outcome === "delivered");
    const goods = mine
      .filter((card) => card.outcome !== "refused")
      .reduce((sum, card) => sum + card.cashAmount, 0);
    const collected = delivered.reduce((sum, card) => sum + card.cashAmount, 0);
    const fee = delivered.length * MONA_COURIER_FEE;
    const paid = remitted.get(courier.id) || 0;
    const adjust = adjusts.get(Number(courier.id));
    const invoiceCollected = adjust?.collected ?? collected;
    const invoiceShipping = adjust?.shipping ?? fee;
    const invoiceRemitted = adjust?.remitted ?? paid;
    return {
      courierId: courier.id,
      name: courier.name,
      delivered: delivered.length,
      postponed: mine.filter((card) => card.outcome === "postponed").length,
      refused: mine.filter((card) => card.outcome === "refused").length,
      goods,
      collected,
      fee,
      remitted: paid,
      remaining: collected - fee - paid,
      invoiceCollected,
      invoiceShipping,
      invoiceRemitted,
      invoiceRemaining: invoiceCollected - invoiceShipping - invoiceRemitted,
    };
  });
}

async function releasePostponedMona() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET monaCourierId = NULL, monaAssignedAt = NULL
    WHERE monaOutcome = 'postponed' AND monaCourierId IS NOT NULL
  `;
}

async function loadReturnedPostponed() {
  const prisma = getPrismaClient();
  if (!prisma) return [] as OrderRow[];
  return prisma.$queryRaw<OrderRow[]>`
    SELECT c.id, c.wooOrderNumber, c.customerSnapshot, c.depositAmount, c.depositPaid,
           c.monaCourierId, c.monaOutcome, c.monaRefusalReason, a.name AS courierName
    FROM CsOrderConfirmation c
    LEFT JOIN CsAgent a ON a.id = c.monaCourierId
    WHERE c.monaOutcome = 'postponed' AND c.monaCourierId IS NULL
    ORDER BY c.id DESC
  `;
}

export async function loadMonaDesk(viewerCourierId?: number) {
  await releasePostponedMona();
  const couriers = await listMonaCourierAgents();
  const visible = viewerCourierId ? couriers.filter((row) => row.id === viewerCourierId) : couriers;
  const rows = await loadAssignedOrders(viewerCourierId);
  const returnedRows = viewerCourierId ? [] : await loadReturnedPostponed();
  const answers = await loadAnswers([...rows, ...returnedRows].map((row) => row.id));
  const cards = rows.map((row) => cardFrom(row, answers));
  const returned = returnedRows.map((row) => cardFrom(row, answers));
  const [remitted, adjusts] = await Promise.all([remittedByCourier(), loadMonaAdjusts()]);
  return {
    couriers: visible,
    orders: cards,
    returned,
    ledger: ledgerOf(visible, cards, remitted, adjusts),
  };
}

function moneyAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

export async function saveMonaCourierAdjust(
  courierId: number,
  input: { collected: number; shipping: number; remitted: number },
) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  const couriers = await listMonaCourierAgents();
  if (!couriers.some((row) => row.id === courierId)) {
    return { ok: false as const, message: "المندوب مش موجود." };
  }
  const collected = moneyAmount(input.collected);
  const shipping = moneyAmount(input.shipping);
  const remitted = moneyAmount(input.remitted);
  if (collected == null || shipping == null || remitted == null) {
    return { ok: false as const, message: "اكتب المبالغ بشكل صحيح." };
  }
  await ensureMonaAdjustTable();
  await prisma.$executeRaw`
    INSERT INTO CsMonaCourierAdjust (courierAgentId, collectedAmount, shippingAmount, remittedAmount)
    VALUES (${courierId}, ${collected}, ${shipping}, ${remitted})
    ON DUPLICATE KEY UPDATE
      collectedAmount = ${collected},
      shippingAmount = ${shipping},
      remittedAmount = ${remitted}
  `;
  return { ok: true as const, message: "اتحفظت أرقام الحساب." };
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
  const openRows = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT COUNT(*) AS n
    FROM CsOrderConfirmation
    WHERE monaCourierId = ${courierId}
      AND (monaOutcome IS NULL OR monaOutcome = '' OR monaOutcome = 'postponed')
  `;
  if (Number(openRows[0]?.n || 0) >= 2) {
    return { ok: false as const, message: "المندوب عنده أوردرين." };
  }
  const changed = await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET monaCourierId = ${courierId}, monaAssignedAt = NOW(3),
        monaOutcome = NULL, monaRefusalReason = NULL
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
  if (input.outcome === "postponed") {
    await prisma.$executeRaw`
      UPDATE CsOrderConfirmation
      SET monaOutcome = 'postponed',
          monaRefusalReason = NULL,
          monaCourierId = NULL,
          monaAssignedAt = NULL
      WHERE id = ${input.confirmationId} AND monaCourierId = ${input.courierId}
    `;
    return { ok: true as const, message: "اتسجل." };
  }
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
