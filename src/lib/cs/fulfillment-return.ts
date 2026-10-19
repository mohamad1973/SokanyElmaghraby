import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { ensureCsBostaWaybill } from "@/lib/cs/bosta-waybill";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { listMonaCourierAgents, monaCourierBucketFromName } from "@/lib/cs/mona-courier";
import { getPrismaClient } from "@/lib/db";

export type FulfillmentKind = "return" | "exchange";
export type FulfillmentDesk = "sayed_temima" | "eid" | "momen";

export type FulfillmentLine = {
  productId?: number | null;
  name: string;
  sku?: string | null;
  quantity?: number | null;
};

function money(value: unknown) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
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

  const collectAmount = money(input.collectAmount);
  const siblingCount = await prisma.csOrderConfirmation.count({
    where: { parentConfirmationId: parent.id } as never,
  });
  const seq = siblingCount + 1;
  const suffix = input.kind === "exchange" ? "X" : "R";
  const wooOrderNumber = `${parent.wooOrderNumber}-${suffix}${seq}`;
  const wooOrderId = await nextSyntheticWoo(parent.id, seq);

  const items = [
    ...(outbound
      ? [
          {
            name: `${outbound.name} (خارج)`,
            quantity: outbound.quantity || 1,
            sku: outbound.sku || "",
            total: String(collectAmount || 0),
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

  const kindLabel = input.kind === "exchange" ? "استبدال" : "استرجاع";
  const now = new Date();
  const snapshot = {
    customerName,
    phone,
    address,
    governorate,
    area,
    addressFull: [address, area, governorate].filter(Boolean).join(" — "),
    total: String(collectAmount),
    wooTotal: String(collectAmount),
    waybillTotal: String(collectAmount),
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
    note: `${kindLabel} لأوردر #${parent.wooOrderNumber}`,
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
    } as never,
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
      value: `${kindLabel} لأوردر #${parent.wooOrderNumber}`,
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

  const waybill = await ensureCsBostaWaybill(created.id);
  // Keep desk company (Temima/Eid/Momen); Bosta create may briefly set shippingCompany=bosta.
  await prisma.csOrderConfirmation.update({
    where: { id: created.id },
    data: {
      shippingCompany: input.desk,
      ...(monaCourierId
        ? {
            monaCourierId,
            monaAssignedAt: now,
          }
        : {
            monaCourierId: null,
            monaAssignedAt: null,
          }),
    } as never,
  });

  if (!waybill.ok) {
    return {
      ok: true as const,
      confirmationId: created.id,
      wooOrderNumber,
      trackingNumber: null,
      waybillWarning: waybill.message,
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
  };
}

export async function listFulfillmentChildren(parentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { parentConfirmationId: parentId } as never,
    orderBy: { id: "desc" },
    select: {
      id: true,
      wooOrderNumber: true,
      fulfillmentKind: true,
      trackingNumber: true,
      shippingCompany: true,
      createdAt: true,
    } as never,
  });
  return rows.map((row) => {
    const typed = row as {
      id: number;
      wooOrderNumber: string;
      fulfillmentKind?: string | null;
      trackingNumber?: string | null;
      shippingCompany?: string | null;
      createdAt: Date;
    };
    return {
      id: typed.id,
      wooOrderNumber: typed.wooOrderNumber,
      kind: typed.fulfillmentKind === "exchange" ? ("exchange" as const) : ("return" as const),
      trackingNumber: typed.trackingNumber || null,
      shippingCompany: typed.shippingCompany || null,
      createdAt: typed.createdAt.toISOString(),
    };
  });
}
