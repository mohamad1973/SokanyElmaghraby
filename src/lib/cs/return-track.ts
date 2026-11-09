import "server-only";

import { getPrismaClient } from "@/lib/db";
import { ensureMaintenanceLifecycleColumns } from "@/lib/cs/bosta-return-lifecycle";
import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";
import { ensureBostaReturnReviewTable } from "@/lib/cs/bosta-return-review";

/** Ordered warehouse + maintenance return stages for the track line. */
export const RETURN_STAGES = [
  "ticket_created",
  "ticket_approved",
  "return_waybill_created",
  "at_carrier",
  "warehouse_captured",
  "inspect_opened",
  "inspected",
  "online_warehouse",
  "shelf_direct",
  "delivered_to_maintenance",
  "awaiting_grade",
  "graded",
  "returned_from_maintenance",
  "received_from_maintenance",
  "on_shelf",
  "to_outlet",
  "to_scrap",
  "out_to_customer",
  "with_customer",
] as const;

export type ReturnStage = (typeof RETURN_STAGES)[number];

export const RETURN_STAGE_LABEL: Record<ReturnStage, string> = {
  ticket_created: "إنشاء تكت / طلب استرجاع",
  ticket_approved: "موافقة الطلب",
  return_waybill_created: "إنشاء بوليصة الاسترجاع",
  at_carrier: "عند شركة الشحن / في الطريق للمخزن",
  warehouse_captured: "استلام بالمخزن",
  inspect_opened: "فتح الفحص",
  inspected: "فحص المخزن",
  online_warehouse: "مخزن أونلاين",
  shelf_direct: "الرف (مباشر)",
  delivered_to_maintenance: "تسليم للصيانة",
  awaiting_grade: "عند فني الصيانة",
  graded: "تصنيف فني",
  returned_from_maintenance: "عائد من الصيانة (بانتظار الاستلام)",
  received_from_maintenance: "استُلم من الصيانة",
  on_shelf: "على الرف",
  to_outlet: "مخزن أوتليت",
  to_scrap: "مخزن الهالك",
  out_to_customer: "في الطريق للعميل",
  with_customer: "عند العميل",
};

export type ReturnTrackPoint = {
  stage: ReturnStage;
  label: string;
  at: string | null;
  state: "done" | "current" | "upcoming";
  detail?: string;
};

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (!text || text.startsWith("0000")) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isFulfillmentKind(value: unknown): value is "return" | "exchange" {
  return value === "return" || value === "exchange";
}

async function addColumn(sql: string) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Duplicate column|already exists|1060/i.test(message)) throw error;
  }
}

export async function ensureReturnTrackTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await ensureBostaReturnCaptureTable();
  await ensureBostaReturnReviewTable();
  await ensureMaintenanceLifecycleColumns();
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `inspectedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `gradedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `outletAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `scrapAt` DATETIME(3) NULL");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsReturnTrackEvent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`trackingNumber\` VARCHAR(64) NOT NULL,
      \`confirmationId\` INT NULL,
      \`stage\` VARCHAR(48) NOT NULL,
      \`at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`actorAgentId\` INT NULL,
      \`meta\` TEXT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`CsReturnTrackEvent_tracking_idx\` (\`trackingNumber\`),
      INDEX \`CsReturnTrackEvent_confirmation_idx\` (\`confirmationId\`),
      INDEX \`CsReturnTrackEvent_stage_at_idx\` (\`stage\`, \`at\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export async function recordReturnTrackEvent(input: {
  trackingNumber: string;
  confirmationId?: number | null;
  stage: ReturnStage;
  actorAgentId?: number | null;
  meta?: Record<string, unknown> | null;
  at?: Date | null;
}) {
  const prisma = getPrismaClient();
  const tracking = input.trackingNumber.trim();
  if (!prisma || !tracking) return;
  await ensureReturnTrackTables();
  const at = input.at || new Date();
  const meta = input.meta ? JSON.stringify(input.meta).slice(0, 4000) : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`CsReturnTrackEvent\`
      (\`trackingNumber\`, \`confirmationId\`, \`stage\`, \`at\`, \`actorAgentId\`, \`meta\`)
     VALUES (?, ?, ?, ?, ?, ?)`,
    tracking,
    input.confirmationId ?? null,
    input.stage,
    at,
    input.actorAgentId ?? null,
    meta,
  );
}

type RawBundle = {
  trackingNumber: string;
  confirmationId: number | null;
  capturedAt: Date | string | null;
  openedAt: Date | string | null;
  kind: string | null;
  source: string | null;
  condition: string | null;
  destination: string | null;
  usage: string | null;
  grade: string | null;
  inspectedAt: Date | string | null;
  gradedAt: Date | string | null;
  deliveredToMaintenanceAt: Date | string | null;
  receivedFromMaintenanceAt: Date | string | null;
  shelfAt: Date | string | null;
  outletAt: Date | string | null;
  scrapAt: Date | string | null;
  bostaClaim: number | boolean | null;
  updatedAt: Date | string | null;
  /** Synthetic confirmation fields when no warehouse capture yet. */
  waybillCreatedAt?: Date | string | null;
  shippingCompany?: string | null;
  fulfillmentKind?: string | null;
  hasCapture?: boolean;
};

type ConfirmationLite = {
  id: number;
  trackingNumber: string | null;
  fulfillmentKind: string | null;
  parentConfirmationId: number | null;
  shippingCompany: string | null;
  createdAt: Date | string | null;
  customerSnapshot: unknown;
};

function snapFulfillmentKind(snapshot: unknown): string {
  if (!snapshot) return "";
  let raw: unknown = snapshot;
  if (typeof snapshot === "string") {
    try {
      raw = JSON.parse(snapshot);
    } catch {
      return "";
    }
  }
  return String((raw as { fulfillmentKind?: string } | null)?.fulfillmentKind || "").trim();
}

function effectiveKind(row: ConfirmationLite): "return" | "exchange" | "" {
  if (isFulfillmentKind(row.fulfillmentKind)) return row.fulfillmentKind;
  const snap = snapFulfillmentKind(row.customerSnapshot);
  return isFulfillmentKind(snap) ? snap : "";
}

async function loadCaptureBundle(trackingNumber: string): Promise<RawBundle | null> {
  const prisma = getPrismaClient();
  if (!prisma || !trackingNumber) return null;
  const rows = await prisma.$queryRawUnsafe<RawBundle[]>(
    `SELECT c.trackingNumber, c.confirmationId, c.capturedAt, c.openedAt, c.kind, c.source,
            r.\`condition\`, r.destination, r.\`usage\`, r.grade, r.inspectedAt, r.gradedAt,
            r.deliveredToMaintenanceAt, r.receivedFromMaintenanceAt, r.shelfAt, r.outletAt, r.scrapAt,
            r.bostaClaim, r.updatedAt
     FROM CsBostaReturnCapture c
     LEFT JOIN CsBostaReturnReview r ON r.trackingNumber = c.trackingNumber
     WHERE c.trackingNumber = ?
     LIMIT 1`,
    trackingNumber,
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, hasCapture: true };
}

async function loadCaptureByConfirmation(confirmationId: number): Promise<RawBundle | null> {
  const prisma = getPrismaClient();
  if (!prisma || confirmationId <= 0) return null;
  const rows = await prisma.$queryRawUnsafe<RawBundle[]>(
    `SELECT c.trackingNumber, c.confirmationId, c.capturedAt, c.openedAt, c.kind, c.source,
            r.\`condition\`, r.destination, r.\`usage\`, r.grade, r.inspectedAt, r.gradedAt,
            r.deliveredToMaintenanceAt, r.receivedFromMaintenanceAt, r.shelfAt, r.outletAt, r.scrapAt,
            r.bostaClaim, r.updatedAt
     FROM CsBostaReturnCapture c
     LEFT JOIN CsBostaReturnReview r ON r.trackingNumber = c.trackingNumber
     WHERE c.confirmationId = ?
     ORDER BY c.capturedAt DESC
     LIMIT 1`,
    confirmationId,
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, hasCapture: true };
}

function syntheticFromConfirmation(row: ConfirmationLite, kind: "return" | "exchange"): RawBundle {
  const tracking =
    String(row.trackingNumber || "").trim() || `CS-${row.id}`;
  return {
    trackingNumber: tracking,
    confirmationId: row.id,
    capturedAt: null,
    openedAt: null,
    kind,
    source: String(row.shippingCompany || "").trim() || null,
    condition: null,
    destination: null,
    usage: null,
    grade: null,
    inspectedAt: null,
    gradedAt: null,
    deliveredToMaintenanceAt: null,
    receivedFromMaintenanceAt: null,
    shelfAt: null,
    outletAt: null,
    scrapAt: null,
    bostaClaim: null,
    updatedAt: null,
    waybillCreatedAt: row.createdAt,
    shippingCompany: row.shippingCompany,
    fulfillmentKind: kind,
    hasCapture: false,
  };
}

async function loadConfirmation(id: number): Promise<ConfirmationLite | null> {
  const prisma = getPrismaClient();
  if (!prisma || id <= 0) return null;
  const rows = await prisma.$queryRawUnsafe<ConfirmationLite[]>(
    `SELECT id, trackingNumber, fulfillmentKind, parentConfirmationId, shippingCompany, createdAt, customerSnapshot
     FROM CsOrderConfirmation WHERE id = ? LIMIT 1`,
    id,
  );
  return rows[0] || null;
}

async function loadLatestChildReturn(parentId: number): Promise<ConfirmationLite | null> {
  const prisma = getPrismaClient();
  if (!prisma || parentId <= 0) return null;
  const rows = await prisma.$queryRawUnsafe<ConfirmationLite[]>(
    `SELECT id, trackingNumber, fulfillmentKind, parentConfirmationId, shippingCompany, createdAt, customerSnapshot
     FROM CsOrderConfirmation
     WHERE parentConfirmationId = ?
       AND (fulfillmentKind IN ('return', 'exchange')
            OR customerSnapshot LIKE '%"fulfillmentKind":"return"%'
            OR customerSnapshot LIKE '%"fulfillmentKind":"exchange"%')
     ORDER BY id DESC
     LIMIT 1`,
    parentId,
  );
  return rows[0] || null;
}

async function loadConfirmationByTracking(tracking: string): Promise<ConfirmationLite | null> {
  const prisma = getPrismaClient();
  if (!prisma || !tracking) return null;
  const rows = await prisma.$queryRawUnsafe<ConfirmationLite[]>(
    `SELECT id, trackingNumber, fulfillmentKind, parentConfirmationId, shippingCompany, createdAt, customerSnapshot
     FROM CsOrderConfirmation
     WHERE trackingNumber = ?
     ORDER BY id DESC
     LIMIT 1`,
    tracking,
  );
  return rows[0] || null;
}

/**
 * Resolve a return/exchange bundle from capture and/or confirmation.
 * Returns null when the order is not a return-related record at all.
 */
async function loadBundle(opts: { trackingNumber?: string; confirmationId?: number }): Promise<RawBundle | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureReturnTrackTables();
  const tracking = String(opts.trackingNumber || "").trim();
  const confirmationId = opts.confirmationId && opts.confirmationId > 0 ? opts.confirmationId : 0;

  if (tracking) {
    const byTrack = await loadCaptureBundle(tracking);
    if (byTrack) return byTrack;
  }

  if (confirmationId) {
    const byConf = await loadCaptureByConfirmation(confirmationId);
    if (byConf) return byConf;

    const conf = await loadConfirmation(confirmationId);
    if (conf) {
      const kind = effectiveKind(conf);
      if (kind) {
        const childTrack = String(conf.trackingNumber || "").trim();
        if (childTrack) {
          const capture = await loadCaptureBundle(childTrack);
          if (capture) {
            return {
              ...capture,
              confirmationId: capture.confirmationId || conf.id,
              waybillCreatedAt: conf.createdAt,
              shippingCompany: conf.shippingCompany,
              fulfillmentKind: kind,
            };
          }
        }
        return syntheticFromConfirmation(conf, kind);
      }

      // Parent order: use latest return/exchange child (or its capture).
      const child = await loadLatestChildReturn(confirmationId);
      if (child) {
        const childKind = effectiveKind(child);
        if (childKind) {
          const childCapture =
            (await loadCaptureByConfirmation(child.id)) ||
            (String(child.trackingNumber || "").trim()
              ? await loadCaptureBundle(String(child.trackingNumber).trim())
              : null);
          if (childCapture) {
            return {
              ...childCapture,
              confirmationId: childCapture.confirmationId || child.id,
              waybillCreatedAt: child.createdAt,
              shippingCompany: child.shippingCompany,
              fulfillmentKind: childKind,
            };
          }
          return syntheticFromConfirmation(child, childKind);
        }
      }
    }
  }

  if (tracking) {
    const conf = await loadConfirmationByTracking(tracking);
    if (conf) {
      const kind = effectiveKind(conf);
      if (kind) return syntheticFromConfirmation(conf, kind);
      if (!conf.parentConfirmationId) {
        const child = await loadLatestChildReturn(conf.id);
        const childKind = child ? effectiveKind(child) : "";
        if (child && childKind) return syntheticFromConfirmation(child, childKind);
      }
    }
  }

  return null;
}

async function loadStoredEvents(opts: { trackingNumber?: string | null; confirmationId?: number | null }) {
  const prisma = getPrismaClient();
  const tracking = String(opts.trackingNumber || "").trim();
  const confirmationId = opts.confirmationId && opts.confirmationId > 0 ? opts.confirmationId : 0;
  if (!prisma || (!tracking && !confirmationId)) {
    return [] as Array<{ stage: string; at: Date | string; meta: string | null }>;
  }
  if (tracking && confirmationId) {
    return prisma.$queryRawUnsafe<Array<{ stage: string; at: Date | string; meta: string | null }>>(
      `SELECT stage, \`at\`, meta FROM CsReturnTrackEvent
       WHERE trackingNumber = ? OR confirmationId = ?
       ORDER BY \`at\` ASC, id ASC`,
      tracking,
      confirmationId,
    );
  }
  if (tracking) {
    return prisma.$queryRawUnsafe<Array<{ stage: string; at: Date | string; meta: string | null }>>(
      `SELECT stage, \`at\`, meta FROM CsReturnTrackEvent
       WHERE trackingNumber = ?
       ORDER BY \`at\` ASC, id ASC`,
      tracking,
    );
  }
  return prisma.$queryRawUnsafe<Array<{ stage: string; at: Date | string; meta: string | null }>>(
    `SELECT stage, \`at\`, meta FROM CsReturnTrackEvent
     WHERE confirmationId = ?
     ORDER BY \`at\` ASC, id ASC`,
    confirmationId,
  );
}

function gradeLabel(grade: string | null) {
  if (grade === "first") return "فرز أول";
  if (grade === "second") return "أوتليت (فرز ثاني)";
  if (grade === "scrap") return "هالك";
  return "";
}

function carrierLabel(source: string | null | undefined) {
  const code = String(source || "").trim();
  if (code === "bosta") return "بوسطة";
  if (code === "sayed_temima" || code === "temima") return "سيد تميمة";
  if (code === "eid") return "عيد";
  if (code === "momen") return "مؤمن";
  return code || "";
}

/** Build a derived + event-backed timeline for one return. */
export async function getReturnTrackLine(opts: { trackingNumber?: string; confirmationId?: number }) {
  const trackingHint = String(opts.trackingNumber || "").trim();
  const confirmationHint = opts.confirmationId && opts.confirmationId > 0 ? opts.confirmationId : 0;

  const bundle = await loadBundle({
    trackingNumber: trackingHint || undefined,
    confirmationId: confirmationHint || undefined,
  });

  if (!bundle) {
    return {
      ok: false as const,
      applicable: false as const,
      message: "مفيش مسار مرتجع لهذا الأوردر.",
      points: [] as ReturnTrackPoint[],
    };
  }

  const events = await loadStoredEvents({
    trackingNumber: bundle.trackingNumber,
    confirmationId: bundle.confirmationId,
  });
  const eventAt = new Map<string, string>();
  for (const row of events) {
    const at = isoOrNull(row.at);
    if (!at) continue;
    if (!eventAt.has(row.stage)) eventAt.set(row.stage, at);
  }

  const waybillAt =
    eventAt.get("return_waybill_created") || isoOrNull(bundle.waybillCreatedAt);
  const atCarrier =
    eventAt.get("at_carrier") ||
    (String(bundle.trackingNumber || "").trim() && !bundle.trackingNumber.startsWith("CS-")
      ? waybillAt
      : null);
  const capturedAt = eventAt.get("warehouse_captured") || isoOrNull(bundle.capturedAt);
  const openedAt = eventAt.get("inspect_opened") || isoOrNull(bundle.openedAt);
  const inspectedAt =
    eventAt.get("inspected") || isoOrNull(bundle.inspectedAt) || (bundle.condition ? isoOrNull(bundle.updatedAt) : null);
  const deliveredAt = eventAt.get("delivered_to_maintenance") || isoOrNull(bundle.deliveredToMaintenanceAt);
  const gradedAt = eventAt.get("graded") || isoOrNull(bundle.gradedAt);
  const receivedAt = eventAt.get("received_from_maintenance") || isoOrNull(bundle.receivedFromMaintenanceAt);
  const shelfAt = eventAt.get("on_shelf") || eventAt.get("shelf_direct") || isoOrNull(bundle.shelfAt);
  const outletAt = eventAt.get("to_outlet") || isoOrNull(bundle.outletAt);
  const scrapAt = eventAt.get("to_scrap") || isoOrNull(bundle.scrapAt);

  const destination = String(bundle.destination || "");
  const grade = String(bundle.grade || "");
  const condition = String(bundle.condition || "");
  const usage =
    bundle.usage === "new" ? "جديد" : bundle.usage === "used" ? "مستخدم" : "";
  const hasCapture = Boolean(bundle.hasCapture || capturedAt);
  const kindDetail = bundle.fulfillmentKind === "exchange" || bundle.kind === "exchange"
    ? "استبدال"
    : bundle.fulfillmentKind === "return" || bundle.kind === "return"
      ? "استرجاع"
      : bundle.kind || "";

  type Draft = { stage: ReturnStage; at: string | null; detail?: string; relevant: boolean };
  const drafts: Draft[] = [];

  // Pre-warehouse: ticket / waybill / carrier (events + confirmation synthesis).
  for (const stage of ["ticket_created", "ticket_approved"] as ReturnStage[]) {
    if (eventAt.has(stage)) {
      drafts.push({ stage, at: eventAt.get(stage) || null, relevant: true });
    }
  }

  const showWaybill =
    Boolean(waybillAt) ||
    Boolean(eventAt.has("return_waybill_created")) ||
    Boolean(bundle.fulfillmentKind) ||
    Boolean(bundle.waybillCreatedAt);
  if (showWaybill) {
    drafts.push({
      stage: "return_waybill_created",
      at: waybillAt,
      detail: [kindDetail, carrierLabel(bundle.shippingCompany || bundle.source)].filter(Boolean).join(" · "),
      relevant: true,
    });
  }

  const showCarrier =
    Boolean(atCarrier) ||
    eventAt.has("at_carrier") ||
    (showWaybill && Boolean(String(bundle.trackingNumber || "").trim()));
  if (showCarrier) {
    drafts.push({
      stage: "at_carrier",
      at: atCarrier || (String(bundle.trackingNumber || "").startsWith("CS-") ? null : waybillAt),
      detail: carrierLabel(bundle.shippingCompany || bundle.source) || undefined,
      relevant: true,
    });
  }

  // Warehouse + maintenance only when capture/review exists or stage events fired.
  const showWarehouse =
    hasCapture ||
    eventAt.has("warehouse_captured") ||
    eventAt.has("inspect_opened") ||
    eventAt.has("inspected") ||
    Boolean(condition);

  if (showWarehouse) {
    drafts.push({
      stage: "warehouse_captured",
      at: capturedAt,
      detail: [carrierLabel(bundle.source), bundle.kind].filter(Boolean).join(" · "),
      relevant: true,
    });
    drafts.push({ stage: "inspect_opened", at: openedAt, relevant: Boolean(openedAt || condition) });
    drafts.push({
      stage: "inspected",
      at: inspectedAt,
      detail: [condition, usage].filter(Boolean).join(" · "),
      relevant: Boolean(condition),
    });

    if (destination === "online_warehouse") {
      drafts.push({ stage: "online_warehouse", at: inspectedAt, relevant: true });
    } else if (destination === "shelf") {
      drafts.push({
        stage: "shelf_direct",
        at: shelfAt || inspectedAt,
        relevant: true,
      });
    } else if (destination === "to_customer") {
      drafts.push({
        stage: "out_to_customer",
        at: eventAt.get("out_to_customer") || inspectedAt,
        relevant: true,
      });
    } else if (destination === "maintenance") {
      drafts.push({ stage: "delivered_to_maintenance", at: deliveredAt, relevant: true });
      drafts.push({
        stage: "awaiting_grade",
        at: deliveredAt && !grade ? deliveredAt : null,
        relevant: Boolean(deliveredAt) && !grade,
      });
      drafts.push({
        stage: "graded",
        at: gradedAt || (grade ? deliveredAt : null),
        detail: gradeLabel(grade),
        relevant: Boolean(grade),
      });
      drafts.push({
        stage: "returned_from_maintenance",
        at: grade && !receivedAt ? gradedAt || deliveredAt : null,
        relevant: Boolean(grade) && !receivedAt,
      });
      drafts.push({
        stage: "received_from_maintenance",
        at: receivedAt,
        relevant: Boolean(receivedAt),
      });
      if (grade === "first") {
        drafts.push({ stage: "on_shelf", at: shelfAt, relevant: Boolean(receivedAt) });
      } else if (grade === "second") {
        drafts.push({ stage: "to_outlet", at: outletAt || receivedAt, relevant: Boolean(receivedAt) });
      } else if (grade === "scrap") {
        drafts.push({ stage: "to_scrap", at: scrapAt || receivedAt, relevant: Boolean(receivedAt) });
      }
    }
  }

  for (const stage of ["out_to_customer", "with_customer"] as ReturnStage[]) {
    if (eventAt.has(stage)) {
      drafts.push({ stage, at: eventAt.get(stage) || null, relevant: true });
    }
  }

  const relevant = drafts.filter((d) => d.relevant);
  let currentIndex = -1;
  for (let i = 0; i < relevant.length; i++) {
    if (relevant[i].at) currentIndex = i;
  }
  if (currentIndex >= 0 && currentIndex < relevant.length - 1 && relevant[currentIndex].at) {
    const next = relevant[currentIndex + 1];
    if (!next.at) currentIndex = currentIndex + 1;
  } else if (currentIndex < 0 && relevant.length) {
    currentIndex = 0;
  }

  const points: ReturnTrackPoint[] = relevant.map((d, index) => ({
    stage: d.stage,
    label: RETURN_STAGE_LABEL[d.stage],
    at: d.at,
    detail: d.detail,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
  }));

  if (points.length && points.every((p) => p.state !== "current")) {
    const lastDone = [...points].reverse().find((p) => p.at);
    if (lastDone) lastDone.state = "current";
  }

  return {
    ok: true as const,
    applicable: true as const,
    trackingNumber: bundle.trackingNumber,
    confirmationId: bundle.confirmationId,
    currentLabel: points.find((p) => p.state === "current")?.label || "—",
    points,
  };
}
