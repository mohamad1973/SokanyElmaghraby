import "server-only";

import { moneySnapshotWithWaybillTotal, snapshotWithLiveMerchandiseTotal } from "@/lib/cs/bosta-waybill";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { fulfillmentWaybillDraft, orderItemsDescription } from "@/lib/cs/fulfillment-waybill";
import { hydrateWaybillSnapshot } from "@/lib/cs/hydrate-waybill-snapshot";
import { sheetCollectedSplit, sheetSplitFromConfirmation } from "@/lib/cs/order-window";
import { isDisplayablePlaceName, resolveSnapshotLocation } from "@/lib/cs/resolve-location";
import { usesSokanyWaybillPrint, type SokanyCarrier, type SokanyPrintPayload } from "@/lib/cs/sokany-waybill-types";
import { getPrismaClient } from "@/lib/db";

export type { SokanyCarrier, SokanyPrintPayload } from "@/lib/cs/sokany-waybill-types";

const DEFAULT_RETURN_ADDRESS = "الشرقية | العاشر من رمضان (المنطقة الصناعية)";
const BUILTIN_BOSTA_CODES = new Set(["bosta", "sayed_temima", "eid", "momen"]);

const PREFIX: Record<string, string> = {
  sayed_temima: "TM",
  eid: "EID",
  momen: "MN",
};

function preferPlace(snap: unknown, answer: string) {
  const site = String(snap || "").trim();
  if (isDisplayablePlaceName(site)) return site;
  const extra = String(answer || "").trim();
  if (isDisplayablePlaceName(extra)) return extra;
  return site || extra;
}

function textOf(answers: Array<{ itemKey: string; value?: string | null }>, key: string) {
  return String(answers.find((row) => row.itemKey === key)?.value || "").trim();
}

function moneyOf(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function approvedDiscountDelta(row: { discountApprovalStatus?: string | null; orderTotalDelta?: unknown }) {
  if (String(row.discountApprovalStatus || "").toLowerCase() !== "approved") return null;
  const n = Number(row.orderTotalDelta);
  return Number.isFinite(n) && n < 0 ? n : null;
}

export function trackingPrefixForCarrier(code: string) {
  const known = PREFIX[code];
  if (known) return known;
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return cleaned || "SK";
}

export function buildSokanyTracking(carrierCode: string, wooOrderNumber: string, kind?: string) {
  const raw = String(wooOrderNumber || "").replace(/^#/, "").replace(/\s+/g, "").slice(0, 32);
  const tagged = raw.match(/^(.*)-(R|X)(\d+)$/i);
  const suffix = tagged
    ? `${tagged[2].toUpperCase()}${tagged[3]}`
    : kind === "return"
      ? "R1"
      : kind === "exchange"
        ? "X1"
        : "";
  const base = (tagged ? tagged[1] : raw) || "0";
  const order = suffix ? `${base}-${suffix}` : raw || "0";
  return `SK-${trackingPrefixForCarrier(carrierCode)}-${order}`;
}

function looksLikeSokanyTracking(value: string) {
  return /^SK-/i.test(value.trim());
}

function pickLegacyRef(snapshot: Record<string, unknown>, confirmationTracking: string) {
  const stored = String(snapshot.legacyRef || "").trim();
  if (stored && !looksLikeSokanyTracking(stored)) return stored;
  for (const candidate of [confirmationTracking, String(snapshot.trackingNumber || "")]) {
    const value = candidate.trim();
    if (value && !looksLikeSokanyTracking(value)) return value;
  }
  return "";
}

export async function ensureSokanyAwbTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsCarrier\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`code\` VARCHAR(32) NOT NULL,
      \`nameAr\` VARCHAR(191) NOT NULL,
      \`waybillProvider\` VARCHAR(16) NOT NULL,
      \`printHubLabel\` VARCHAR(191) NOT NULL,
      \`returnAddress\` TEXT NOT NULL,
      \`senderName\` VARCHAR(191) NOT NULL DEFAULT 'Sokany Elmaghraby',
      \`allowOpenPackage\` BOOLEAN NOT NULL DEFAULT true,
      \`defaultReturnFee\` DECIMAL(12,2) NOT NULL DEFAULT 75,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`CsCarrier_code_key\`(\`code\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsSokanyWaybill\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tracking\` VARCHAR(64) NOT NULL,
      \`confirmationId\` INT NOT NULL,
      \`carrierCode\` VARCHAR(32) NOT NULL,
      \`kind\` VARCHAR(16) NOT NULL,
      \`cod\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`returnFee\` DECIMAL(12,2) NOT NULL DEFAULT 75,
      \`description\` TEXT NOT NULL,
      \`itemsCount\` INT NOT NULL DEFAULT 1,
      \`snapshot\` JSON NOT NULL,
      \`invoiceNumber\` VARCHAR(64) NULL,
      \`barcodePayload\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(24) NOT NULL DEFAULT 'created',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`CsSokanyWaybill_tracking_key\`(\`tracking\`),
      INDEX \`CsSokanyWaybill_confirmationId_idx\`(\`confirmationId\`),
      INDEX \`CsSokanyWaybill_carrierCode_idx\`(\`carrierCode\`),
      INDEX \`CsSokanyWaybill_status_idx\`(\`status\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  const seeds: Array<[string, string, string, string]> = [
    ["bosta", "بوسطة", "bosta", "بوسطة"],
    ["sayed_temima", "سيد تميمة", "sokany", "مندوب سيد تميمة"],
    ["eid", "عيد", "sokany", "مندوب عيد"],
    ["momen", "مؤمن", "sokany", "مندوب مؤمن"],
  ];
  for (const [code, nameAr, provider, hub] of seeds) {
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO \`CsCarrier\`
        (\`code\`, \`nameAr\`, \`waybillProvider\`, \`printHubLabel\`, \`returnAddress\`, \`senderName\`, \`allowOpenPackage\`, \`defaultReturnFee\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, 'Sokany Elmaghraby', 1, 75, 1, NOW(3), NOW(3))`,
      code,
      nameAr,
      provider,
      hub,
      DEFAULT_RETURN_ADDRESS,
    );
  }
  await prisma.$executeRawUnsafe(
    `UPDATE \`CsCarrier\`
     SET \`waybillProvider\` = 'sokany', \`updatedAt\` = NOW(3)
     WHERE \`code\` IN ('sayed_temima', 'eid', 'momen') AND \`waybillProvider\` <> 'sokany'`,
  );
}

function mapCarrier(row: {
  id: number | bigint;
  code: string;
  nameAr: string;
  waybillProvider: string;
  printHubLabel: string;
  returnAddress: string;
  senderName: string;
  allowOpenPackage: number | boolean;
  defaultReturnFee: unknown;
  isActive: number | boolean;
}): SokanyCarrier {
  return {
    id: Number(row.id),
    code: row.code,
    nameAr: row.nameAr,
    waybillProvider: row.waybillProvider === "sokany" ? "sokany" : "bosta",
    printHubLabel: row.printHubLabel,
    returnAddress: row.returnAddress,
    senderName: row.senderName || "Sokany Elmaghraby",
    allowOpenPackage: Boolean(row.allowOpenPackage),
    defaultReturnFee: moneyOf(row.defaultReturnFee) || 75,
    isActive: Boolean(row.isActive),
  };
}

export async function listCsCarriers(activeOnly = false) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as SokanyCarrier[];
  await ensureSokanyAwbTables();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number | bigint;
      code: string;
      nameAr: string;
      waybillProvider: string;
      printHubLabel: string;
      returnAddress: string;
      senderName: string;
      allowOpenPackage: number | boolean;
      defaultReturnFee: unknown;
      isActive: number | boolean;
    }>
  >(
    activeOnly
      ? "SELECT * FROM CsCarrier WHERE isActive = 1 ORDER BY id ASC"
      : "SELECT * FROM CsCarrier ORDER BY id ASC",
  );
  return rows.map(mapCarrier);
}

export async function getCsCarrierByCode(code: string) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureSokanyAwbTables();
  const trimmed = String(code || "").trim();
  if (!trimmed) return null;
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number | bigint;
      code: string;
      nameAr: string;
      waybillProvider: string;
      printHubLabel: string;
      returnAddress: string;
      senderName: string;
      allowOpenPackage: number | boolean;
      defaultReturnFee: unknown;
      isActive: number | boolean;
    }>
  >("SELECT * FROM CsCarrier WHERE LOWER(code) = LOWER(?) LIMIT 1", trimmed);
  return rows[0] ? mapCarrier(rows[0]) : null;
}

export async function resolveAssignableCarrierCode(value: unknown) {
  const code = String(value || "").trim();
  if (!code) return null;
  if (BUILTIN_BOSTA_CODES.has(code)) return code;
  const carrier = await getCsCarrierByCode(code);
  return carrier?.isActive ? carrier.code : null;
}

export async function createCsCarrier(input: {
  code: string;
  nameAr: string;
  printHubLabel?: string;
  returnAddress?: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureSokanyAwbTables();
  const code = String(input.code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const nameAr = String(input.nameAr || "").trim();
  if (!/^[a-z][a-z0-9_]{1,15}$/.test(code)) {
    return { ok: false as const, message: "كود الشركة حروف إنجليزي صغيرة وأرقام، يبدأ بحرف." };
  }
  if (BUILTIN_BOSTA_CODES.has(code)) {
    return { ok: false as const, message: "تميمة وعيد ومؤمن وبوسطة موجودين — أضيفي شركة جديدة." };
  }
  if (nameAr.length < 2) return { ok: false as const, message: "اكتبي اسم الشركة بالعربي." };
  const hub = String(input.printHubLabel || `مندوب ${nameAr}`).trim();
  const returnAddress = String(input.returnAddress || DEFAULT_RETURN_ADDRESS).trim();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsCarrier\`
        (\`code\`, \`nameAr\`, \`waybillProvider\`, \`printHubLabel\`, \`returnAddress\`, \`senderName\`, \`allowOpenPackage\`, \`defaultReturnFee\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, 'sokany', ?, ?, 'Sokany Elmaghraby', 1, 75, 1, NOW(3), NOW(3))`,
      code,
      nameAr,
      hub,
      returnAddress,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Duplicate|1062/i.test(message)) return { ok: false as const, message: "الكود مستخدم قبل كده." };
    return { ok: false as const, message: "تعذر حفظ الشركة." };
  }
  const created = await getCsCarrierByCode(code);
  return created
    ? { ok: true as const, carrier: created }
    : { ok: false as const, message: "تعذر قراءة الشركة بعد الحفظ." };
}

export async function updateCsCarrier(input: {
  code: string;
  printHubLabel: string;
  nameAr?: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureSokanyAwbTables();
  const code = String(input.code || "").trim();
  if (!code) return { ok: false as const, message: "كود الشركة مطلوب." };
  const existing = await getCsCarrierByCode(code);
  if (!existing) return { ok: false as const, message: "الشركة غير موجودة." };
  if (existing.waybillProvider === "bosta") {
    return { ok: false as const, message: "بوسطة تطبع من لوحة بوسطة، مش من بوليصة سوكانى." };
  }
  const hub = String(input.printHubLabel || "").trim();
  if (hub.length < 2) return { ok: false as const, message: "اكتبي الاسم اللي يظهر على بوليصة سوكانى." };
  const nameAr = input.nameAr !== undefined ? String(input.nameAr || "").trim() : existing.nameAr;
  if (nameAr.length < 2) return { ok: false as const, message: "اكتبي اسم الشركة بالعربي." };
  await prisma.$executeRawUnsafe(
    `UPDATE CsCarrier SET printHubLabel = ?, nameAr = ?, updatedAt = NOW(3) WHERE LOWER(code) = LOWER(?)`,
    hub,
    nameAr,
    code,
  );
  const updated = await getCsCarrierByCode(code);
  return updated
    ? { ok: true as const, carrier: updated }
    : { ok: false as const, message: "تعذر قراءة الشركة بعد الحفظ." };
}

function kindLabelOf(kind: string) {
  if (kind === "return") return "استرجاع";
  if (kind === "exchange") return "استبدال";
  return "توصيل";
}

function parseWaybillSnapshot(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return parseWaybillSnapshot(value.toString("utf8"));
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function itemDescription(snapshot: Record<string, unknown>) {
  const draft = fulfillmentWaybillDraft(snapshot);
  const items = orderItemsDescription(snapshot);
  return {
    text: items.text || "شحنة سوكانى",
    count: items.count,
    kind: items.kind,
    cod: draft?.cod ?? moneyOf(snapshot.waybillTotal ?? snapshot.total),
  };
}

function printLocation(
  snapshot: Record<string, unknown>,
  answers: Array<{ itemKey: string; value?: string | null }>,
) {
  const loc = resolveSnapshotLocation({
    governorate: String(snapshot.governorate || ""),
    area: String(snapshot.area || ""),
    address: String(snapshot.address || ""),
    state: String(snapshot.state || ""),
    city: String(snapshot.city || ""),
  });
  return {
    customerName: textOf(answers, "customer_name") || String(snapshot.customerName || "").trim(),
    phone: textOf(answers, "primary_phone") || String(snapshot.phone || "").trim(),
    address: textOf(answers, "address_complete") || loc.address || String(snapshot.address || "").trim(),
    governorate: preferPlace(loc.governorate || snapshot.governorate, textOf(answers, "governorate_confirm")),
    area: preferPlace(loc.area || snapshot.area, textOf(answers, "area_confirm")),
    landmarks: textOf(answers, "address_landmarks") || String(snapshot.note || "").trim(),
    legacyRef: pickLegacyRef(snapshot, ""),
  };
}

export async function ensureCsSokanyWaybill(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureSokanyAwbTables();
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    include: { answers: true },
  });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };
  if (row.status !== CS_CONFIRMATION_STATUS.CONFIRMED) {
    return { ok: false as const, message: "اطبعي بوليصة سوكانى بعد حفظ الأوردر." };
  }
  const shippingCode = String(row.shippingCompany || "").trim();
  let carrier = await getCsCarrierByCode(shippingCode);
  if ((!carrier || carrier.waybillProvider !== "sokany") && usesSokanyWaybillPrint(shippingCode)) {
    carrier = {
      id: 0,
      code: shippingCode,
      nameAr: shippingCode,
      waybillProvider: "sokany",
      printHubLabel: `مندوب ${shippingCode}`,
      returnAddress: DEFAULT_RETURN_ADDRESS,
      senderName: "Sokany Elmaghraby",
      allowOpenPackage: true,
      defaultReturnFee: 75,
      isActive: true,
    };
  }
  if (!carrier || carrier.waybillProvider !== "sokany") {
    return { ok: false as const, message: "هذه الشركة تطبع من بوسطة حتى اعتماد بوليصة سوكانى." };
  }

  const existing = await prisma.$queryRawUnsafe<
    Array<{
      tracking: string;
      carrierCode: string;
      kind: string;
      cod: unknown;
      returnFee: unknown;
      description: string;
      itemsCount: number;
      snapshot: unknown;
      invoiceNumber: string | null;
      barcodePayload: string;
      createdAt: Date;
    }>
  >("SELECT * FROM CsSokanyWaybill WHERE confirmationId = ? ORDER BY id DESC LIMIT 1", confirmationId);
  const invoiceNumber = String(row.invoiceNumber || "").trim();
  const snap = await hydrateWaybillSnapshot((row.customerSnapshot || {}) as Record<string, unknown>, row.wooOrderId);
  Object.assign(
    snap,
    moneySnapshotWithWaybillTotal(snapshotWithLiveMerchandiseTotal(snap), approvedDiscountDelta(row)),
  );
  const answers = row.answers || [];
  const built = itemDescription(snap);
  if (!fulfillmentWaybillDraft(snap)) {
    const money = row as {
      depositAmount?: unknown;
      depositPaid?: boolean | null;
      depositApprovalStatus?: string | null;
      orderTotalDelta?: unknown;
      discountApprovalStatus?: string | null;
    };
    built.cod = sheetCollectedSplit(
      sheetSplitFromConfirmation({
        customerSnapshot: snap,
        depositAmount: money.depositAmount,
        depositPaid: money.depositPaid,
        depositApprovalStatus: money.depositApprovalStatus,
        orderTotalDelta: money.orderTotalDelta,
        discountApprovalStatus: money.discountApprovalStatus,
        freshPaymentState: true,
      }),
    ).net;
  }
  const legacyRef = pickLegacyRef(snap, String(row.trackingNumber || ""));
  if (legacyRef) snap.legacyRef = legacyRef;
  const printSnap = { ...printLocation(snap, answers), legacyRef };
  const persistCardTracking = async (tracking: string) => {
    snap.trackingNumber = tracking;
    await prisma.csOrderConfirmation.update({
      where: { id: confirmationId },
      data: {
        trackingNumber: tracking,
        customerSnapshot: snap,
      } as never,
    });
  };
  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE CsSokanyWaybill
         SET description = ?, itemsCount = ?, cod = ?, snapshot = ?, invoiceNumber = COALESCE(?, invoiceNumber), updatedAt = NOW(3)
       WHERE tracking = ?`,
      built.text.slice(0, 500),
      built.count,
      built.cod,
      JSON.stringify(printSnap),
      invoiceNumber || null,
      existing[0].tracking,
    );
    await persistCardTracking(existing[0].tracking);
    return {
      ok: true as const,
      waybill: {
        ...existing[0],
        description: built.text.slice(0, 500),
        itemsCount: built.count,
        cod: built.cod,
        snapshot: printSnap,
        invoiceNumber: invoiceNumber || existing[0].invoiceNumber,
      },
      carrier,
    };
  }

  const tracking = buildSokanyTracking(carrier.code, row.wooOrderNumber, built.kind);
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO CsSokanyWaybill
        (tracking, confirmationId, carrierCode, kind, cod, returnFee, description, itemsCount, snapshot, invoiceNumber, barcodePayload, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', NOW(3), NOW(3))`,
      tracking,
      confirmationId,
      carrier.code,
      built.kind,
      built.cod,
      carrier.defaultReturnFee,
      built.text.slice(0, 500),
      built.count,
      JSON.stringify(printSnap),
      invoiceNumber || null,
      tracking,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Duplicate|1062/i.test(message)) {
      return { ok: false as const, message: "تعذر إنشاء بوليصة سوكانى." };
    }
  }
  const created = await prisma.$queryRawUnsafe<typeof existing>(
    "SELECT * FROM CsSokanyWaybill WHERE confirmationId = ? ORDER BY id DESC LIMIT 1",
    confirmationId,
  );
  if (!created[0]) return { ok: false as const, message: "تعذر قراءة البوليصة." };
  await persistCardTracking(created[0].tracking);
  return { ok: true as const, waybill: created[0], carrier };
}

export function toSokanyPrintPayload(
  waybill: {
    tracking: string;
    kind: string;
    cod: unknown;
    returnFee: unknown;
    description: string;
    itemsCount: number;
    snapshot: unknown;
    invoiceNumber: string | null;
    barcodePayload: string;
    createdAt: Date | string;
  },
  carrier: SokanyCarrier,
  wooOrderNumber: string,
): SokanyPrintPayload {
  const snap = parseWaybillSnapshot(waybill.snapshot);
  const gov = String(snap.governorate || "").trim();
  const area = String(snap.area || "").trim();
  return {
    tracking: waybill.tracking,
    barcodeSvg: code128Svg(String(waybill.barcodePayload || waybill.tracking)),
    kindLabel: kindLabelOf(waybill.kind),
    hubLabel: carrier.printHubLabel,
    senderName: carrier.senderName || "Sokany Elmaghraby",
    receiverName: String(snap.customerName || "").trim() || "—",
    receiverPhone: String(snap.phone || "").trim() || "—",
    zone: [gov, area].filter(Boolean).join(" - ") || "—",
    address: String(snap.address || "").trim() || "—",
    landmarks: String(snap.landmarks || "").trim() || "—",
    openPackage: carrier.allowOpenPackage,
    itemsCount: Math.max(1, Number(waybill.itemsCount) || 1),
    description: String(waybill.description || "").trim() || "—",
    notes: String(snap.landmarks || "").trim() || "—",
    invoiceNumber: String(waybill.invoiceNumber || "").trim() || "—",
    orderReference: `WooCommerce_${String(wooOrderNumber || "").replace(/^#/, "")}`,
    legacyRef: String(snap.legacyRef || "").trim(),
    returnAddress: carrier.returnAddress || DEFAULT_RETURN_ADDRESS,
    cod: moneyOf(waybill.cod),
    returnFee: moneyOf(waybill.returnFee) || 75,
    createdAt: waybill.createdAt instanceof Date ? waybill.createdAt.toISOString() : String(waybill.createdAt),
  };
}

/** Compact Code 128B SVG for thermal 10×15 cm stickers. */
export function code128Svg(text: string) {
  const payload = String(text || "").slice(0, 32);
  const patterns = CODE128_PATTERNS;
  const codes: number[] = [104];
  for (const ch of payload) {
    const code = ch.charCodeAt(0) - 32;
    codes.push(code >= 0 && code <= 94 ? code : 0);
  }
  let checksum = 104;
  codes.slice(1).forEach((code, index) => {
    checksum += code * (index + 1);
  });
  codes.push(checksum % 103);
  codes.push(106);
  const quiet = 12;
  let bars = "";
  let x = quiet;
  for (const code of codes) {
    const pattern = patterns[code] || patterns[0];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="40" fill="#111"/>`;
      x += width;
    }
  }
  x += quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 40" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${payload}">${bars}</svg>`;
}

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];
