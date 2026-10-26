import "server-only";

import { ensureScCenterTables, resolveScAccess, type ScAccess } from "@/lib/cs/sc-centers";
import { getPrismaClient } from "@/lib/db";

export const SC_PURCHASE_SOURCES = [
  { id: "online", label: "متجر سوكاني أونلاين" },
  { id: "dealer", label: "تاجر" },
  { id: "wholesale", label: "جملة" },
  { id: "other", label: "أخرى" },
] as const;

export const SC_DEFECTS = [
  { id: "chop", label: "لا يفرم" },
  { id: "grind", label: "لا يطحن" },
  { id: "suction", label: "لا يشفط" },
  { id: "heat", label: "لا يسخن" },
] as const;

export const SC_TICKET_STATUS: Record<string, string> = {
  intake: "استقبال جديد",
  quoted: "عرض فني",
  received: "مستلم للإصلاح",
  declined: "رفض الإصلاح",
  return_pending: "استرجاع بانتظار الموافقة",
  exchange_pending: "استبدال بانتظار الموافقة",
  return_approved: "استرجاع مقبول",
  exchange_approved: "استبدال مقبول",
  request_rejected: "طلب مرفوض",
};

export type ScTicketStatus = keyof typeof SC_TICKET_STATUS;

export function normalizeScPhone(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function last10(phone: string) {
  const digits = normalizeScPhone(phone);
  return digits.slice(-10);
}

function parseJsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
  return [];
}

function allowedCenterId(access: ScAccess, requested?: number | null) {
  if (access.isManager) {
    return requested && Number.isInteger(requested) ? requested : null;
  }
  return access.centerId;
}

async function addEvent(ticketId: number, kind: string, message: string, agentId: number | null) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO ScTicketEvent (ticketId, kind, message, agentId, createdAt) VALUES (?, ?, ?, ?, NOW(3))`,
    ticketId,
    kind,
    message,
    agentId,
  );
}

type TicketRow = {
  id: number;
  customerId: number;
  centerId: number;
  agentId: number;
  techAgentId: number | null;
  wooProductId: number | null;
  productName: string;
  productCode: string;
  purchaseSource: string;
  purchaseSourceNote: string;
  purchaseDate: Date | string | null;
  usageKind: string;
  visualKind: string;
  powerCut: number | boolean;
  defects: string;
  defectOther: string;
  techSpecs: string;
  inWarranty: number | boolean | null;
  partAvailable: number | boolean | null;
  chargeType: string | null;
  cost: number | null;
  durationText: string;
  techNotes: string;
  refundKind: string | null;
  refundReason: string;
  hqDecision: string | null;
  hqNote: string;
  hqDecidedAt: Date | string | null;
  status: string;
  quotedAt: Date | string | null;
  acceptedAt: Date | string | null;
  createdAt: Date | string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  centerName: string;
};

function ymd(value: Date | string | null) {
  if (!value) return "";
  const text = typeof value === "string" ? value : value.toISOString();
  return text.slice(0, 10);
}

function iso(value: Date | string | null) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function boolish(value: number | boolean | null | undefined) {
  if (value == null) return null;
  return Boolean(value);
}

async function photosOf(ticketIds: number[]) {
  const prisma = getPrismaClient();
  if (!prisma || !ticketIds.length) return new Map<number, Array<{ id: number; kind: string; url: string }>>();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; ticketId: number; kind: string; url: string }>>(
    `SELECT id, ticketId, kind, url FROM ScTicketPhoto WHERE ticketId IN (${ticketIds.map(() => "?").join(",")}) ORDER BY id ASC`,
    ...ticketIds,
  );
  const map = new Map<number, Array<{ id: number; kind: string; url: string }>>();
  for (const row of rows) {
    const list = map.get(Number(row.ticketId)) || [];
    list.push({ id: Number(row.id), kind: row.kind, url: row.url });
    map.set(Number(row.ticketId), list);
  }
  return map;
}

function mapTicket(
  row: TicketRow,
  photos: Array<{ id: number; kind: string; url: string }>,
  events: Array<{ id: number; kind: string; message: string; createdAt: string | null }> = [],
) {
  return {
    id: Number(row.id),
    customerId: Number(row.customerId),
    centerId: Number(row.centerId),
    centerName: row.centerName || "",
    agentId: Number(row.agentId),
    productName: row.productName || "",
    productCode: row.productCode || "",
    wooProductId: row.wooProductId == null ? null : Number(row.wooProductId),
    purchaseSource: row.purchaseSource || "",
    purchaseSourceNote: row.purchaseSourceNote || "",
    purchaseDate: ymd(row.purchaseDate),
    usageKind: row.usageKind || "",
    visualKind: row.visualKind || "",
    powerCut: Boolean(row.powerCut),
    defects: parseJsonList(row.defects),
    defectOther: row.defectOther || "",
    techSpecs: row.techSpecs || "",
    inWarranty: boolish(row.inWarranty),
    partAvailable: boolish(row.partAvailable),
    chargeType: row.chargeType || "",
    cost: row.cost == null ? null : Number(row.cost),
    durationText: row.durationText || "",
    techNotes: row.techNotes || "",
    refundKind: row.refundKind || "",
    refundReason: row.refundReason || "",
    hqDecision: row.hqDecision || "",
    hqNote: row.hqNote || "",
    hqDecidedAt: iso(row.hqDecidedAt),
    status: row.status,
    statusLabel: SC_TICKET_STATUS[row.status] || row.status,
    quotedAt: iso(row.quotedAt),
    acceptedAt: iso(row.acceptedAt),
    createdAt: iso(row.createdAt),
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerAddress: row.customerAddress,
    invoicePhotos: photos.filter((photo) => photo.kind === "invoice"),
    productPhotos: photos.filter((photo) => photo.kind === "product"),
    events,
  };
}

const TICKET_SELECT = `
  t.id, t.customerId, t.centerId, t.agentId, t.techAgentId, t.wooProductId, t.productName, t.productCode,
  t.purchaseSource, t.purchaseSourceNote, t.purchaseDate, t.usageKind, t.visualKind, t.powerCut, t.defects,
  t.defectOther, t.techSpecs, t.inWarranty, t.partAvailable, t.chargeType, t.cost, t.durationText, t.techNotes,
  t.refundKind, t.refundReason, t.hqDecision, t.hqNote, t.hqDecidedAt, t.status, t.quotedAt, t.acceptedAt, t.createdAt,
  cu.name AS customerName, cu.phone AS customerPhone, cu.address AS customerAddress,
  c.name AS centerName
`;

export async function searchScCustomer(access: ScAccess, phoneQuery: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const digits = normalizeScPhone(phoneQuery);
  if (digits.length < 4) return { ok: false as const, message: "اكتب رقم موبايل أوضح." };
  const tail = last10(digits);
  const customers = await prisma.$queryRawUnsafe<Array<{ id: number; phone: string; name: string; address: string }>>(
    `SELECT id, phone, name, address FROM ScCustomer
     WHERE phone = ? OR RIGHT(phone, 10) = ? OR phone LIKE ?
     ORDER BY id DESC LIMIT 5`,
    digits,
    tail,
    `%${digits}%`,
  );
  const customer = customers[0];
  if (!customer) {
    return { ok: true as const, found: false as const, phone: digits };
  }
  const centerFilter = access.isManager ? "" : " AND t.centerId = ?";
  const params: Array<string | number> = [Number(customer.id)];
  if (!access.isManager) {
    if (!access.centerId) return { ok: false as const, message: "حسابك مش مربوط بمركز." };
    params.push(access.centerId);
  }
  const tickets = await prisma.$queryRawUnsafe<TicketRow[]>(
    `SELECT ${TICKET_SELECT}
     FROM ScTicket t
     JOIN ScCustomer cu ON cu.id = t.customerId
     LEFT JOIN ScCenter c ON c.id = t.centerId
     WHERE t.customerId = ?${centerFilter}
     ORDER BY t.id DESC`,
    ...params,
  );
  const photoMap = await photosOf(tickets.map((row) => Number(row.id)));
  return {
    ok: true as const,
    found: true as const,
    customer: {
      id: Number(customer.id),
      phone: customer.phone,
      name: customer.name,
      address: customer.address,
    },
    tickets: tickets.map((row) => mapTicket(row, photoMap.get(Number(row.id)) || [])),
  };
}

export async function loadScTicket(access: ScAccess, ticketId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const rows = await prisma.$queryRawUnsafe<TicketRow[]>(
    `SELECT ${TICKET_SELECT}
     FROM ScTicket t
     JOIN ScCustomer cu ON cu.id = t.customerId
     LEFT JOIN ScCenter c ON c.id = t.centerId
     WHERE t.id = ? LIMIT 1`,
    ticketId,
  );
  if (!rows[0]) return { ok: false as const, message: "التذكرة غير موجودة." };
  if (!access.isManager && access.centerId !== Number(rows[0].centerId)) {
    return { ok: false as const, message: "غير مصرح." };
  }
  const photoMap = await photosOf([ticketId]);
  const events = await prisma.$queryRawUnsafe<Array<{ id: number; kind: string; message: string; createdAt: Date | string }>>(
    `SELECT id, kind, message, createdAt FROM ScTicketEvent WHERE ticketId = ? ORDER BY id DESC LIMIT 40`,
    ticketId,
  );
  return {
    ok: true as const,
    ticket: mapTicket(
      rows[0],
      photoMap.get(ticketId) || [],
      events.map((event) => ({
        id: Number(event.id),
        kind: event.kind,
        message: event.message,
        createdAt: iso(event.createdAt),
      })),
    ),
  };
}

export async function listScManagerInbox() {
  const prisma = getPrismaClient();
  if (!prisma) return [] as Array<ReturnType<typeof mapTicket> & { kind: string }>;
  await ensureScCenterTables();
  const rows = await prisma.$queryRawUnsafe<TicketRow[]>(
    `SELECT ${TICKET_SELECT}
     FROM ScTicket t
     JOIN ScCustomer cu ON cu.id = t.customerId
     LEFT JOIN ScCenter c ON c.id = t.centerId
     WHERE t.status IN ('intake', 'return_pending', 'exchange_pending')
     ORDER BY t.id DESC
     LIMIT 80`,
  );
  const photoMap = await photosOf(rows.map((row) => Number(row.id)));
  return rows.map((row) => ({
    kind: row.status === "intake" ? "intake" : row.status === "exchange_pending" ? "exchange" : "return",
    ...mapTicket(row, photoMap.get(Number(row.id)) || []),
  }));
}

async function upsertCustomer(input: { name: string; phone: string; address: string }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const phone = normalizeScPhone(input.phone);
  const name = input.name.trim();
  const address = input.address.trim();
  if (phone.length < 10) return { ok: false as const, message: "رقم الموبايل ناقص." };
  if (name.length < 2) return { ok: false as const, message: "اسم العميل قصير." };
  if (!address) return { ok: false as const, message: "العنوان مطلوب." };
  const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM ScCustomer WHERE phone = ? OR RIGHT(phone, 10) = ? LIMIT 1`,
    phone,
    last10(phone),
  );
  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE ScCustomer SET name = ?, phone = ?, address = ?, updatedAt = NOW(3) WHERE id = ?`,
      name,
      phone,
      address,
      existing[0].id,
    );
    return { ok: true as const, id: Number(existing[0].id) };
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO ScCustomer (phone, name, address, createdAt, updatedAt) VALUES (?, ?, ?, NOW(3), NOW(3))`,
    phone,
    name,
    address,
  );
  const created = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM ScCustomer WHERE phone = ? LIMIT 1`, phone);
  if (!created[0]) return { ok: false as const, message: "تعذر حفظ العميل." };
  return { ok: true as const, id: Number(created[0].id) };
}

function cleanUrls(values: unknown) {
  return parseJsonList(values).filter((url) => url.startsWith("/api/media/") || url.startsWith("https://")).slice(0, 12);
}

export async function saveScIntake(
  access: ScAccess,
  agentId: number,
  input: {
    name: string;
    phone: string;
    address: string;
    centerId?: number;
    wooProductId?: number | null;
    productName: string;
    productCode?: string;
    purchaseSource: string;
    purchaseSourceNote?: string;
    purchaseDate?: string;
    usageKind: string;
    visualKind: string;
    powerCut?: boolean;
    defects?: string[];
    defectOther?: string;
    invoiceUrls?: string[];
    productUrls?: string[];
  },
) {
  if (!access.canInspect) return { ok: false as const, message: "غير مصرح بالاستقبال." };
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const centerId = allowedCenterId(access, input.centerId ?? access.centerId);
  if (!centerId) return { ok: false as const, message: "اختار مركز الصيانة." };
  const center = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM ScCenter WHERE id = ? LIMIT 1`, centerId);
  if (!center[0]) return { ok: false as const, message: "المركز غير موجود." };
  const productName = input.productName.trim();
  if (productName.length < 2) return { ok: false as const, message: "اختار منتج سوكاني." };
  if (input.usageKind !== "new" && input.usageKind !== "used") return { ok: false as const, message: "حدد المنتج جديد أو مستخدم." };
  if (input.visualKind !== "intact" && input.visualKind !== "broken") return { ok: false as const, message: "حدد سليم ظاهريًا أو به كسر." };
  const sourceOk = SC_PURCHASE_SOURCES.some((row) => row.id === input.purchaseSource);
  if (!sourceOk) return { ok: false as const, message: "حدد من أين اشتري المنتج." };
  const customer = await upsertCustomer({ name: input.name, phone: input.phone, address: input.address });
  if (!customer.ok) return customer;
  const allowedDefects = new Set<string>(SC_DEFECTS.map((row) => row.id));
  const defects = (input.defects || []).filter((id) => allowedDefects.has(id));
  const purchaseDate = input.purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate) ? input.purchaseDate : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO ScTicket (
      customerId, centerId, agentId, wooProductId, productName, productCode, purchaseSource, purchaseSourceNote,
      purchaseDate, usageKind, visualKind, powerCut, defects, defectOther, techSpecs, durationText, techNotes,
      refundReason, hqNote, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', 'intake', NOW(3), NOW(3))`,
    customer.id,
    centerId,
    agentId,
    input.wooProductId || null,
    productName,
    String(input.productCode || "").slice(0, 64),
    input.purchaseSource,
    String(input.purchaseSourceNote || "").trim(),
    purchaseDate,
    input.usageKind,
    input.visualKind,
    input.powerCut ? 1 : 0,
    JSON.stringify(defects),
    String(input.defectOther || "").trim(),
  );
  const created = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM ScTicket WHERE customerId = ? AND centerId = ? ORDER BY id DESC LIMIT 1`,
    customer.id,
    centerId,
  );
  const ticketId = Number(created[0]?.id || 0);
  if (!ticketId) return { ok: false as const, message: "تعذر حفظ الزيارة." };
  const invoices = cleanUrls(input.invoiceUrls);
  const products = cleanUrls(input.productUrls);
  for (const url of invoices) {
    await prisma.$executeRawUnsafe(`INSERT INTO ScTicketPhoto (ticketId, kind, url, createdAt) VALUES (?, 'invoice', ?, NOW(3))`, ticketId, url.slice(0, 255));
  }
  for (const url of products) {
    await prisma.$executeRawUnsafe(`INSERT INTO ScTicketPhoto (ticketId, kind, url, createdAt) VALUES (?, 'product', ?, NOW(3))`, ticketId, url.slice(0, 255));
  }
  await addEvent(ticketId, "intake", `استقبال ${productName}`, agentId);
  return { ok: true as const, id: ticketId, customerId: customer.id };
}

export async function saveScQuote(
  access: ScAccess,
  agentId: number,
  input: {
    ticketId: number;
    techSpecs: string;
    inWarranty: boolean;
    partAvailable: boolean;
    chargeType: "paid" | "warranty_free";
    cost?: number | null;
    durationText: string;
    techNotes?: string;
  },
) {
  if (!access.canTech) return { ok: false as const, message: "غير مصرح بالتقييم الفني." };
  const loaded = await loadScTicket(access, input.ticketId);
  if (!loaded.ok) return loaded;
  if (!["intake", "quoted"].includes(loaded.ticket.status)) {
    return { ok: false as const, message: "التذكرة مش في مرحلة التقييم." };
  }
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const cost = input.chargeType === "warranty_free" ? 0 : Math.max(0, Math.floor(Number(input.cost) || 0));
  await prisma.$executeRawUnsafe(
    `UPDATE ScTicket SET techAgentId = ?, techSpecs = ?, inWarranty = ?, partAvailable = ?, chargeType = ?, cost = ?,
     durationText = ?, techNotes = ?, status = 'quoted', quotedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?`,
    agentId,
    input.techSpecs.trim(),
    input.inWarranty ? 1 : 0,
    input.partAvailable ? 1 : 0,
    input.chargeType,
    cost,
    input.durationText.trim(),
    String(input.techNotes || "").trim(),
    input.ticketId,
  );
  await addEvent(input.ticketId, "quote", `تكلفة ${cost} · ${input.durationText.trim() || "بدون مدة"}`, agentId);
  return { ok: true as const };
}

export async function receiveScTicket(access: ScAccess, agentId: number, ticketId: number, techNotes?: string) {
  if (!access.canReceive) return { ok: false as const, message: "غير مصرح باستلام المنتج." };
  const loaded = await loadScTicket(access, ticketId);
  if (!loaded.ok) return loaded;
  if (loaded.ticket.status !== "quoted") return { ok: false as const, message: "اعرض التقييم على العميل أولاً." };
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const notes = String(techNotes || "").trim() || loaded.ticket.techNotes;
  await prisma.$executeRawUnsafe(
    `UPDATE ScTicket SET status = 'received', acceptedAt = NOW(3), techNotes = ?, updatedAt = NOW(3) WHERE id = ?`,
    notes,
    ticketId,
  );
  await addEvent(ticketId, "accept", "العميل وافق واستُلم المنتج", agentId);
  return { ok: true as const };
}

export async function declineScTicket(access: ScAccess, agentId: number, ticketId: number, note?: string) {
  if (!access.canReceive && !access.canTech && !access.canInspect) return { ok: false as const, message: "غير مصرح." };
  const loaded = await loadScTicket(access, ticketId);
  if (!loaded.ok) return loaded;
  if (!["intake", "quoted"].includes(loaded.ticket.status)) return { ok: false as const, message: "لا يمكن رفض الإصلاح في الحالة دي." };
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const notes = String(note || "").trim() || loaded.ticket.techNotes;
  await prisma.$executeRawUnsafe(`UPDATE ScTicket SET status = 'declined', techNotes = ?, updatedAt = NOW(3) WHERE id = ?`, notes, ticketId);
  await addEvent(ticketId, "decline", note?.trim() || "العميل رفض الإصلاح", agentId);
  return { ok: true as const };
}

export async function requestScRefund(
  access: ScAccess,
  agentId: number,
  input: { ticketId: number; kind: "return" | "exchange"; reason: string },
) {
  if (!access.canRefund) return { ok: false as const, message: "غير مصرح بطلب الاسترجاع." };
  const loaded = await loadScTicket(access, input.ticketId);
  if (!loaded.ok) return loaded;
  if (["return_pending", "exchange_pending"].includes(loaded.ticket.status)) {
    return { ok: false as const, message: "فيه طلب معلّق بالفعل." };
  }
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const status = input.kind === "exchange" ? "exchange_pending" : "return_pending";
  await prisma.$executeRawUnsafe(
    `UPDATE ScTicket SET refundKind = ?, refundReason = ?, hqDecision = NULL, hqNote = '', hqDecidedAt = NULL, status = ?, updatedAt = NOW(3) WHERE id = ?`,
    input.kind,
    input.reason.trim(),
    status,
    input.ticketId,
  );
  await addEvent(input.ticketId, input.kind === "exchange" ? "exchange_request" : "return_request", input.reason.trim() || "طلب العميل", agentId);
  return { ok: true as const };
}

export async function decideScRefund(
  access: ScAccess,
  agentId: number,
  input: { ticketId: number; decision: "approved" | "rejected"; note?: string },
) {
  if (!access.isManager) return { ok: false as const, message: "الموافقة لمدير المراكز فقط." };
  const loaded = await loadScTicket(access, input.ticketId);
  if (!loaded.ok) return loaded;
  if (!["return_pending", "exchange_pending"].includes(loaded.ticket.status)) {
    return { ok: false as const, message: "مفيش طلب معلّق." };
  }
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const approved = input.decision === "approved";
  const nextStatus = approved ? (loaded.ticket.refundKind === "exchange" ? "exchange_approved" : "return_approved") : "request_rejected";
  await prisma.$executeRawUnsafe(
    `UPDATE ScTicket SET hqDecision = ?, hqNote = ?, hqDecidedAt = NOW(3), status = ?, updatedAt = NOW(3) WHERE id = ?`,
    input.decision,
    String(input.note || "").trim(),
    nextStatus,
    input.ticketId,
  );
  await addEvent(input.ticketId, "hq_decision", approved ? "موافقة مدير المراكز" : "رفض مدير المراكز", agentId);
  return { ok: true as const };
}
