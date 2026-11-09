import "server-only";

import { getPrismaClient } from "@/lib/db";

export const ORDER_ACTIVITY_ACTIONS = [
  "save",
  "edit",
  "assign",
  "home_to_cs",
  "start",
  "shipping",
  "inspect",
  "other",
] as const;

export type OrderActivityAction = (typeof ORDER_ACTIVITY_ACTIONS)[number];

export const ORDER_ACTIVITY_LABEL: Record<OrderActivityAction, string> = {
  save: "حفظ",
  edit: "تعديل",
  assign: "توزيع",
  home_to_cs: "إعادة توزيع من منزل → خدمة عملاء",
  start: "بدء مكالمة",
  shipping: "شركة الشحن",
  inspect: "فحص / صيانة",
  other: "إجراء",
};

export type OrderActivityRow = {
  id: number;
  confirmationId: number;
  trackingNumber: string | null;
  actorAgentId: number | null;
  actorName: string;
  action: OrderActivityAction;
  actionLabel: string;
  detail: string;
  at: string;
};

let ensurePromise: Promise<void> | null = null;

export async function ensureOrderActivityTables() {
  if (!ensurePromise) {
    ensurePromise = createOrderActivityTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

async function createOrderActivityTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsOrderActivityEvent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`confirmationId\` INT NOT NULL,
      \`trackingNumber\` VARCHAR(64) NULL,
      \`actorAgentId\` INT NULL,
      \`action\` VARCHAR(32) NOT NULL,
      \`detail\` VARCHAR(512) NULL,
      \`at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`CsOrderActivityEvent_confirmation_idx\` (\`confirmationId\`),
      INDEX \`CsOrderActivityEvent_tracking_idx\` (\`trackingNumber\`),
      INDEX \`CsOrderActivityEvent_at_idx\` (\`at\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

function asAction(value: unknown): OrderActivityAction {
  const text = String(value || "").trim();
  return (ORDER_ACTIVITY_ACTIONS as readonly string[]).includes(text)
    ? (text as OrderActivityAction)
    : "other";
}

export async function recordOrderActivity(input: {
  confirmationId: number;
  actorAgentId?: number | null;
  action: OrderActivityAction;
  detail?: string | null;
  trackingNumber?: string | null;
  at?: Date | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(input.confirmationId) || input.confirmationId <= 0) return;
  await ensureOrderActivityTables();
  const at = input.at || new Date();
  const detail = String(input.detail || "").trim().slice(0, 500) || null;
  const tracking = String(input.trackingNumber || "").trim().slice(0, 64) || null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`CsOrderActivityEvent\`
      (\`confirmationId\`, \`trackingNumber\`, \`actorAgentId\`, \`action\`, \`detail\`, \`at\`)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.confirmationId,
    tracking,
    input.actorAgentId ?? null,
    input.action,
    detail,
    at,
  );
}

export async function recordOrderActivityMany(
  rows: Array<{
    confirmationId: number;
    actorAgentId?: number | null;
    action: OrderActivityAction;
    detail?: string | null;
    trackingNumber?: string | null;
    at?: Date | null;
  }>,
) {
  for (const row of rows) {
    await recordOrderActivity(row);
  }
}

type ActivityRawRow = {
  id: number | bigint;
  confirmationId: number | bigint;
  trackingNumber: string | null;
  actorAgentId: number | bigint | null;
  action: string;
  detail: string | null;
  at: Date | string;
  actorName: string | null;
};

function mapActivityRows(rows: ActivityRawRow[]): OrderActivityRow[] {
  return rows.map((row) => {
    const action = asAction(row.action);
    const at =
      row.at instanceof Date
        ? row.at.toISOString()
        : new Date(String(row.at)).toISOString();
    return {
      id: Number(row.id),
      confirmationId: Number(row.confirmationId),
      trackingNumber: row.trackingNumber || null,
      actorAgentId: row.actorAgentId == null ? null : Number(row.actorAgentId),
      actorName: String(row.actorName || "").trim() || "—",
      action,
      actionLabel: ORDER_ACTIVITY_LABEL[action],
      detail: String(row.detail || "").trim(),
      at,
    };
  });
}

async function fetchActivityRows(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  confirmationId: number,
) {
  return prisma.$queryRawUnsafe<ActivityRawRow[]>(
    `SELECT e.\`id\`, e.\`confirmationId\`, e.\`trackingNumber\`, e.\`actorAgentId\`, e.\`action\`, e.\`detail\`, e.\`at\`,
            a.\`name\` AS actorName
     FROM \`CsOrderActivityEvent\` e
     LEFT JOIN \`CsAgent\` a ON a.\`id\` = e.\`actorAgentId\`
     WHERE e.\`confirmationId\` = ?
     ORDER BY e.\`at\` ASC, e.\`id\` ASC`,
    confirmationId,
  );
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Seed activity from confirmation fields when the log table has no rows yet.
 * Never invent "assign" from the assignee, and never use assignee as saver. */
async function backfillActivityFromConfirmation(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  confirmationId: number,
) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      confirmedByAgentId: number | bigint | null;
      confirmedAt: Date | string | null;
      confirmationEditedAt: Date | string | null;
      trackingNumber: string | null;
    }>
  >(
    `SELECT \`confirmedByAgentId\`, \`confirmedAt\`, \`confirmationEditedAt\`, \`trackingNumber\`
     FROM \`CsOrderConfirmation\` WHERE \`id\` = ? LIMIT 1`,
    confirmationId,
  );
  const row = rows[0];
  if (!row) return;

  const tracking = String(row.trackingNumber || "").trim() || null;
  const confirmedByAgentId = row.confirmedByAgentId == null ? null : Number(row.confirmedByAgentId);
  const confirmedAt = asDate(row.confirmedAt);
  const editedAt = asDate(row.confirmationEditedAt);

  const seeds: Array<{
    actorAgentId: number | null;
    action: OrderActivityAction;
    detail: string;
    at: Date;
  }> = [];

  if (confirmedByAgentId != null && confirmedAt) {
    seeds.push({
      actorAgentId: confirmedByAgentId,
      action: "save",
      detail: "حفظ",
      at: confirmedAt,
    });
  }
  if (editedAt && confirmedByAgentId != null) {
    seeds.push({
      actorAgentId: confirmedByAgentId,
      action: "edit",
      detail: "تعديل",
      at: editedAt,
    });
  }

  seeds.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const seed of seeds) {
    await recordOrderActivity({
      confirmationId,
      actorAgentId: seed.actorAgentId,
      action: seed.action,
      detail: seed.detail,
      trackingNumber: tracking,
      at: seed.at,
    });
  }
}

let guessedCleanupPromise: Promise<void> | null = null;

/** Drop misleading inferred events and clear guessed saver ids (once per process). */
export async function cleanupGuessedOrderActivityAttribution() {
  if (!guessedCleanupPromise) {
    guessedCleanupPromise = runGuessedAttributionCleanup().catch((error) => {
      guessedCleanupPromise = null;
      throw error;
    });
  }
  await guessedCleanupPromise;
}

async function runGuessedAttributionCleanup() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await ensureOrderActivityTables();
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM \`CsOrderActivityEvent\` WHERE \`detail\` LIKE '%من سجل الأوردر%'`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[cs] purge synthetic activity:", message.slice(0, 200));
  }
  try {
    // MySQL: avoid "can't specify target table for update in FROM" via nested select.
    await prisma.$executeRawUnsafe(`
      UPDATE \`CsOrderConfirmation\`
      SET \`confirmedByAgentId\` = NULL
      WHERE \`status\` = 'CONFIRMED'
        AND \`confirmedByAgentId\` IS NOT NULL
        AND \`assignedAgentId\` IS NOT NULL
        AND \`confirmedByAgentId\` = \`assignedAgentId\`
        AND \`id\` NOT IN (
          SELECT \`confirmationId\` FROM (
            SELECT DISTINCT \`confirmationId\`
            FROM \`CsOrderActivityEvent\`
            WHERE \`action\` = 'save'
              AND (\`detail\` IS NULL OR \`detail\` NOT LIKE '%من سجل الأوردر%')
          ) AS real_saves
        )
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[cs] clear guessed confirmedByAgentId:", message.slice(0, 200));
  }
}

export async function listOrderActivity(confirmationId: number): Promise<OrderActivityRow[]> {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0) return [];
  await ensureOrderActivityTables();
  await cleanupGuessedOrderActivityAttribution();

  let rows = await fetchActivityRows(prisma, confirmationId);
  if (!rows.length) {
    await backfillActivityFromConfirmation(prisma, confirmationId);
    rows = await fetchActivityRows(prisma, confirmationId);
  }

  return mapActivityRows(rows);
}
