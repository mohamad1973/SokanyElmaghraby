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
};

async function loadBundle(opts: { trackingNumber?: string; confirmationId?: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureReturnTrackTables();
  const tracking = String(opts.trackingNumber || "").trim();
  const confirmationId = opts.confirmationId && opts.confirmationId > 0 ? opts.confirmationId : 0;

  let rows: RawBundle[] = [];
  if (tracking) {
    rows = await prisma.$queryRawUnsafe<RawBundle[]>(
      `SELECT c.trackingNumber, c.confirmationId, c.capturedAt, c.openedAt, c.kind, c.source,
              r.\`condition\`, r.destination, r.\`usage\`, r.grade, r.inspectedAt, r.gradedAt,
              r.deliveredToMaintenanceAt, r.receivedFromMaintenanceAt, r.shelfAt, r.outletAt, r.scrapAt,
              r.bostaClaim, r.updatedAt
       FROM CsBostaReturnCapture c
       LEFT JOIN CsBostaReturnReview r ON r.trackingNumber = c.trackingNumber
       WHERE c.trackingNumber = ?
       LIMIT 1`,
      tracking,
    );
  } else if (confirmationId) {
    rows = await prisma.$queryRawUnsafe<RawBundle[]>(
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
    if (!rows.length) {
      const byOrderTrack = await prisma.$queryRawUnsafe<Array<{ trackingNumber: string | null }>>(
        `SELECT trackingNumber FROM CsOrderConfirmation WHERE id = ? LIMIT 1`,
        confirmationId,
      );
      const tn = String(byOrderTrack[0]?.trackingNumber || "").trim();
      if (tn) return loadBundle({ trackingNumber: tn });
    }
  }
  return rows[0] || null;
}

async function loadStoredEvents(trackingNumber: string) {
  const prisma = getPrismaClient();
  if (!prisma || !trackingNumber) return [] as Array<{ stage: string; at: Date | string; meta: string | null }>;
  return prisma.$queryRawUnsafe<Array<{ stage: string; at: Date | string; meta: string | null }>>(
    `SELECT stage, \`at\`, meta FROM CsReturnTrackEvent
     WHERE trackingNumber = ?
     ORDER BY \`at\` ASC, id ASC`,
    trackingNumber,
  );
}

function gradeLabel(grade: string | null) {
  if (grade === "first") return "فرز أول";
  if (grade === "second") return "أوتليت (فرز ثاني)";
  if (grade === "scrap") return "هالك";
  return "";
}

/** Build a derived + event-backed timeline for one return. */
export async function getReturnTrackLine(opts: { trackingNumber?: string; confirmationId?: number }) {
  const bundle = await loadBundle(opts);
  if (!bundle) {
    return { ok: false as const, message: "مفيش مسار مرتجع لهذا الأوردر.", points: [] as ReturnTrackPoint[] };
  }

  const events = await loadStoredEvents(bundle.trackingNumber);
  const eventAt = new Map<string, string>();
  for (const row of events) {
    const at = isoOrNull(row.at);
    if (!at) continue;
    if (!eventAt.has(row.stage)) eventAt.set(row.stage, at);
  }

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

  type Draft = { stage: ReturnStage; at: string | null; detail?: string; relevant: boolean };
  const drafts: Draft[] = [
    {
      stage: "warehouse_captured",
      at: capturedAt,
      detail: [bundle.source, bundle.kind].filter(Boolean).join(" · "),
      relevant: true,
    },
    { stage: "inspect_opened", at: openedAt, relevant: Boolean(openedAt || condition) },
    {
      stage: "inspected",
      at: inspectedAt,
      detail: [condition, usage].filter(Boolean).join(" · "),
      relevant: Boolean(condition),
    },
  ];

  if (destination === "online_warehouse") {
    drafts.push({ stage: "online_warehouse", at: inspectedAt, relevant: true });
  } else if (destination === "shelf") {
    drafts.push({
      stage: "shelf_direct",
      at: shelfAt || inspectedAt,
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

  // Optional ticket / waybill stages from stored events only.
  for (const stage of [
    "ticket_created",
    "ticket_approved",
    "return_waybill_created",
    "at_carrier",
    "out_to_customer",
    "with_customer",
  ] as ReturnStage[]) {
    if (eventAt.has(stage)) {
      drafts.unshift({ stage, at: eventAt.get(stage) || null, relevant: true });
    }
  }

  const relevant = drafts.filter((d) => d.relevant);
  let currentIndex = -1;
  for (let i = 0; i < relevant.length; i++) {
    if (relevant[i].at) currentIndex = i;
  }
  // If last done is not terminal, mark next without at as current.
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

  // Last done with at and no unfinished next → mark last as current/done.
  if (points.length && points.every((p) => p.state !== "current")) {
    const lastDone = [...points].reverse().find((p) => p.at);
    if (lastDone) lastDone.state = "current";
  }

  return {
    ok: true as const,
    trackingNumber: bundle.trackingNumber,
    confirmationId: bundle.confirmationId,
    currentLabel: points.find((p) => p.state === "current")?.label || "—",
    points,
  };
}
