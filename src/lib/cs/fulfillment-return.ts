import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { ensureCsBostaWaybill } from "@/lib/cs/bosta-waybill";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { listMonaCourierAgents, monaCourierBucketFromName } from "@/lib/cs/mona-courier";
import { getPrismaClient } from "@/lib/db";

export type FulfillmentKind = "return" | "exchange";
export type FulfillmentDesk = "sayed_temima" | "eid" | "momen";
export type SettlementDirection = "collect" | "refund" | "none";

export type FulfillmentLine = {
  productId?: number | null;
  name: string;
  sku?: string | null;
  quantity?: number | null;
};

/** Signed settlement: + collect from customer, − refund to customer, 0 none. */
function signedMoney(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/[^\d.\-]/g, "");
  if (!raw || raw === "-" || raw === "." || raw === "-.") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-999_999, Math.min(999_999, Math.round(n * 100) / 100));
}

function settlementOf(amount: number): {
  signed: number;
  abs: number;
  direction: SettlementDirection;
} {
  if (amount > 0) return { signed: amount, abs: amount, direction: "collect" };
  if (amount < 0) return { signed: amount, abs: Math.abs(amount), direction: "refund" };
  return { signed: 0, abs: 0, direction: "none" };
}

function cleanLine(line: FulfillmentLine | null | undefined): FulfillmentLine | null {
  if (!line) return null;
  const name = String(line.name || "").trim();
  if (!name) return null;
  const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
  return {
    productId: line.productId && Number.isFinite(Number(line.productId)) ? Number(line.productId) : null,
    name,
    sku: String(line.sku || "").trim() || null,
    quantity,
  };
}

function parentEligible(shippingCompany: string | null | undefined, monaCourierId: number | null | undefined) {
  const company = String(shippingCompany || "").trim();
  if (company === "sayed_temima" || company === "eid" || company === "momen") return true;
  return Boolean(monaCourierId);
}

async function nextSyntheticWoo(parentId: number, seq: number) {
  const base = 1_800_000_000 + (parentId % 1_000_000) * 100 + Math.min(99, Math.max(1, seq));
  return base;
}

/** Writes only to the child confirmation id — never the original order. */
async function restoreDeskOwnership(input: {
  confirmationId: number;
  desk: FulfillmentDesk;
  monaCourierId: number | null;
  assignedAt: Date;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.csOrderConfirmation.update({
    where: { id: input.confirmationId },
    data: {
      shippingCompany: input.desk,
      ...(input.monaCourierId
        ? {
            monaCourierId: input.monaCourierId,
            monaAssignedAt: input.assignedAt,
          }
        : {
            monaCourierId: null,
            monaAssignedAt: null,
          }),
    },
  });
  await prisma.csChecklistAnswer.upsert({
    where: {
      confirmationId_itemKey: {
        confirmationId: input.confirmationId,
        itemKey: "shipping_company",
      },
    },
    create: {
      confirmationId: input.confirmationId,
      itemKey: "shipping_company",
      confirmed: true,
      value: input.desk,
    },
    update: {
      confirmed: true,
      value: input.desk,
    },
  });
}

type ParentFingerprint = {
  shippingCompany: string | null;
  trackingNumber: string | null;
  monaCourierId: number | null;
  fulfillmentKind: string | null;
  parentConfirmationId: number | null;
  snapshotJson: string;
  answersCount: number;
};

async function fingerprintParent(parentId: number): Promise<ParentFingerprint | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: parentId },
    select: {
      shippingCompany: true,
      trackingNumber: true,
      monaCourierId: true,
      fulfillmentKind: true,
      parentConfirmationId: true,
      customerSnapshot: true,
      _count: { select: { answers: true } },
    },
  });
  if (!row) return null;
  return {
    shippingCompany: row.shippingCompany || null,
    trackingNumber: row.trackingNumber || null,
    monaCourierId: row.monaCourierId == null ? null : Number(row.monaCourierId),
    fulfillmentKind: row.fulfillmentKind || null,
    parentConfirmationId: row.parentConfirmationId == null ? null : Number(row.parentConfirmationId),
    snapshotJson: JSON.stringify(row.customerSnapshot ?? null),
    answersCount: row._count.answers,
  };
}

function parentChanged(before: ParentFingerprint, after: ParentFingerprint | null) {
  if (!after) return "الأوردر الأصلي اختفى أثناء إنشاء الاستبدال.";
  if (before.shippingCompany !== after.shippingCompany) return "تغيرت شركة الشحن على الأوردر الأصلي.";
  if (before.trackingNumber !== after.trackingNumber) return "تغير رقم التتبع على الأوردر الأصلي.";
  if (before.monaCourierId !== after.monaCourierId) return "تغير مندوب الأوردر الأصلي.";
  if (before.fulfillmentKind !== after.fulfillmentKind) return "تغير نوع الاستبدال على الأوردر الأصلي.";
  if (before.parentConfirmationId !== after.parentConfirmationId) return "تغير ربط الأوردر الأصلي.";
  if (before.snapshotJson !== after.snapshotJson) return "تغيرت لقطة العميل على الأوردر الأصلي.";
  if (before.answersCount !== after.answersCount) return "تغيرت إجابات الأوردر الأصلي.";
  return null;
}

/**
 * Creates a linked child confirmation + Bosta waybill for print.
 * The original order is read-only: never update/upsert parent confirmation or its answers.
 */
export async function createFulfillmentFromOrder(input: {
  parentId: number;
  agentId: number;
  kind: FulfillmentKind;
  desk: FulfillmentDesk;
  monaCourierId?: number | null;
  collectAmount?: number | string | null;
  outbound?: FulfillmentLine | null;
  returning?: FulfillmentLine | null;
  phone?: string | null;
  address?: string | null;
  governorate?: string | null;
  area?: string | null;
  customerName?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  if (input.kind !== "return" && input.kind !== "exchange") {
    return { ok: false as const, message: "نوع غير صالح." };
  }
  if (input.desk !== "sayed_temima" && input.desk !== "eid" && input.desk !== "momen") {
    return { ok: false as const, message: "اختَر سيد تميمة أو عيد أو مؤمن." };
  }

  const parent = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.parentId },
    include: { answers: true },
  });
  if (!parent) return { ok: false as const, message: "الأوردر الأصلي غير موجود." };
  if (parent.status !== CS_CONFIRMATION_STATUS.CONFIRMED && !parent.confirmedAt) {
    return { ok: false as const, message: "الأوردر الأصلي لازم يكون محفوظ أولاً." };
  }

  const parentTyped = parent as {
    shippingCompany?: string | null;
    monaCourierId?: number | null;
    parentConfirmationId?: number | null;
  };
  if (parentTyped.parentConfirmationId) {
    return { ok: false as const, message: "لا يمكن عمل استبدال من أوردر استبدال/استرجاع." };
  }
  if (!parentEligible(parentTyped.shippingCompany, parentTyped.monaCourierId)) {
    return { ok: false as const, message: "الاستبدال/الاسترجاع لتميمة وعيد ومؤمن فقط." };
  }

  const parentBefore = await fingerprintParent(parent.id);
  if (!parentBefore) return { ok: false as const, message: "الأوردر الأصلي غير موجود." };

  const outbound = input.kind === "exchange" ? cleanLine(input.outbound) : null;
  const returning = cleanLine(input.returning);
  if (input.kind === "exchange" && !outbound) {
    return { ok: false as const, message: "اختَر المنتج اللي هيخرج للاستبدال." };
  }
  if (!returning) {
    return { ok: false as const, message: "اختَر المنتج الراجع من العميل." };
  }

  let monaCourierId: number | null = null;
  if (input.desk === "eid" || input.desk === "momen") {
    const agents = await listMonaCourierAgents();
    const requested = Number(input.monaCourierId);
    const match = agents.find((agent) => agent.id === requested);
    if (!match || monaCourierBucketFromName(match.name) !== input.desk) {
      return { ok: false as const, message: "اختَر مندوب عيد أو مؤمن مناسب." };
    }
    monaCourierId = match.id;
  }

  const parentSnap = (parent.customerSnapshot || {}) as Record<string, unknown>;
  const answerMap = new Map(parent.answers.map((row) => [row.itemKey, row]));
  const textAnswer = (key: string) => String(answerMap.get(key)?.value || "").trim();

  const customerName =
    String(input.customerName || "").trim() ||
    textAnswer("customer_name") ||
    String(parentSnap.customerName || "").trim();
  const phone =
    String(input.phone || "").trim() ||
    textAnswer("primary_phone") ||
    String(parentSnap.phone || "").trim();
  const address =
    String(input.address || "").trim() ||
    textAnswer("address_complete") ||
    String(parentSnap.address || "").trim();
  const governorate =
    String(input.governorate || "").trim() ||
    textAnswer("governorate_confirm") ||
    String(parentSnap.governorate || "").trim();
  const area =
    String(input.area || "").trim() ||
    textAnswer("area_confirm") ||
    String(parentSnap.area || "").trim();

  if (!customerName || !phone || !address || !governorate) {
    return { ok: false as const, message: "بيانات العميل ناقصة (الاسم/التليفون/العنوان/المحافظة)." };
  }

  const settlement = settlementOf(signedMoney(input.collectAmount));
  const siblingCount = await prisma.csOrderConfirmation.count({
    where: { parentConfirmationId: parent.id },
  });
  const seq = siblingCount + 1;
  const suffix = input.kind === "exchange" ? "X" : "R";
  const wooOrderNumber = `${parent.wooOrderNumber}-${suffix}${seq}`;
  const wooOrderId = await nextSyntheticWoo(parent.id, seq);

  const kindLabel = input.kind === "exchange" ? "استبدال" : "استرجاع";
  const settlementNote =
    settlement.direction === "refund"
      ? `رد فرق ${settlement.abs} ج.م للعميل`
      : settlement.direction === "collect"
        ? `تحصيل ${settlement.abs} ج.م`
        : "بدون تحصيل";

  const items = [
    ...(outbound
      ? [
          {
            name: `${outbound.name} (خارج)`,
            quantity: outbound.quantity || 1,
            sku: outbound.sku || "",
            total: String(settlement.direction === "collect" ? settlement.abs : 0),
            productId: outbound.productId,
            role: "outbound",
          },
        ]
      : []),
    {
      name: `${returning.name} (راجع)`,
      quantity: returning.quantity || 1,
      sku: returning.sku || "",
      total: "0",
      productId: returning.productId,
      role: "return",
    },
  ];

  const now = new Date();
  const snapshot = {
    customerName,
    phone,
    address,
    governorate,
    area,
    addressFull: [address, area, governorate].filter(Boolean).join(" — "),
    total: String(settlement.signed),
    wooTotal: String(Math.max(0, settlement.signed)),
    waybillTotal: String(settlement.signed),
    settlementDirection: settlement.direction,
    settlementAbs: settlement.abs,
    paymentMethod: "الدفع عند الاستلام",
    paymentMethodId: "cod",
    paymentState: "cod" as const,
    wooStatus: "processing",
    datePaid: null,
    number: wooOrderNumber,
    items,
    fulfillmentKind: input.kind,
    parentConfirmationId: parent.id,
    parentWooOrderNumber: parent.wooOrderNumber,
    note: `${kindLabel} لأوردر #${parent.wooOrderNumber} — ${settlementNote}`,
  };

  const created = await prisma.csOrderConfirmation.create({
    data: {
      wooOrderId,
      wooOrderNumber,
      status: CS_CONFIRMATION_STATUS.CONFIRMED,
      assignedAgentId: input.agentId,
      customerSnapshot: snapshot,
      shippingCompany: input.desk,
      confirmedAt: now,
      shippingAssignedAt: now,
      handedToCarrier: true,
      handedToCarrierAt: now,
      parentConfirmationId: parent.id,
      fulfillmentKind: input.kind,
      ...(monaCourierId
        ? {
            monaCourierId,
            monaAssignedAt: now,
          }
        : {}),
    },
  });

  const answerRows: Array<{ itemKey: string; value: string }> = [
    { itemKey: "customer_name", value: customerName },
    { itemKey: "primary_phone", value: phone },
    { itemKey: "address_complete", value: address },
    { itemKey: "governorate_confirm", value: governorate },
    { itemKey: "area_confirm", value: area || governorate },
    { itemKey: "shipping_company", value: input.desk },
    {
      itemKey: "address_landmarks",
      value: `${kindLabel} لأوردر #${parent.wooOrderNumber} — ${settlementNote}`,
    },
  ];
  for (const row of answerRows) {
    await prisma.csChecklistAnswer.create({
      data: {
        confirmationId: created.id,
        itemKey: row.itemKey,
        confirmed: true,
        value: row.value,
      },
    });
  }

  let waybill: Awaited<ReturnType<typeof ensureCsBostaWaybill>> | null = null;
  let waybillCrash: string | null = null;
  try {
    // Waybill + desk restore target the child only (created.id).
    waybill = await ensureCsBostaWaybill(created.id, { preserveShippingCompany: true });
  } catch (error) {
    waybillCrash = error instanceof Error ? error.message : String(error);
  } finally {
    await restoreDeskOwnership({
      confirmationId: created.id,
      desk: input.desk,
      monaCourierId,
      assignedAt: now,
    });
  }

  const parentAfter = await fingerprintParent(parent.id);
  const parentDrift = parentChanged(parentBefore, parentAfter);
  if (parentDrift) {
    console.error("[fulfillment-return] parent mutated unexpectedly", {
      parentId: parent.id,
      childId: created.id,
      parentDrift,
    });
    return {
      ok: false as const,
      message: `توقف الاستبدال لأن الأوردر الأصلي اتغيّر بالخطأ: ${parentDrift}`,
      confirmationId: created.id,
      wooOrderNumber,
      kind: input.kind,
      desk: input.desk,
    };
  }

  if (!waybill || !waybill.ok) {
    return {
      ok: false as const,
      message: waybillCrash
        ? `تعذر إنشاء بوليصة بوسطة: ${waybillCrash.slice(0, 180)}`
        : !waybill
          ? "تعذر إنشاء بوليصة بوسطة للطباعة."
          : `تعذر إنشاء بوليصة بوسطة: ${waybill.message}`,
      confirmationId: created.id,
      wooOrderNumber,
      kind: input.kind,
      desk: input.desk,
    };
  }
  if (!waybill.state.trackingNumber) {
    return {
      ok: false as const,
      message: "تعذر إنشاء بوليصة بوسطة للطباعة.",
      confirmationId: created.id,
      wooOrderNumber,
      kind: input.kind,
      desk: input.desk,
    };
  }

  return {
    ok: true as const,
    confirmationId: created.id,
    wooOrderNumber,
    trackingNumber: waybill.state.trackingNumber,
    waybillWarning: null,
    kind: input.kind,
    desk: input.desk,
    createdWaybill: waybill.created,
    settlementDirection: settlement.direction,
    settlementAbs: settlement.abs,
  };
}

export async function listFulfillmentChildren(parentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { parentConfirmationId: parentId },
    orderBy: { id: "desc" },
    select: {
      id: true,
      wooOrderNumber: true,
      fulfillmentKind: true,
      trackingNumber: true,
      shippingCompany: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    wooOrderNumber: row.wooOrderNumber,
    kind: row.fulfillmentKind === "exchange" ? ("exchange" as const) : ("return" as const),
    trackingNumber: row.trackingNumber || null,
    shippingCompany: row.shippingCompany || null,
    createdAt: row.createdAt.toISOString(),
  }));
}
