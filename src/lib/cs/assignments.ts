import "server-only";

import { Prisma } from "@prisma/client";

import { ensureCsTables } from "@/lib/cs/agents";
import { cairoTodayYmd, cairoYmdBounds, isWithinCairoDateRange } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

export function parseWooOrderNumber(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return Number(digits) || 0;
}

export async function listAssignmentsDetailed(opts?: { fromYmd?: string; toYmd?: string }) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const fromYmd = opts?.fromYmd?.trim() || "";
  const toYmd = opts?.toYmd?.trim() || "";
  let where: { createdAt?: { gte: Date; lt: Date } } | undefined;
  if (fromYmd && toYmd) {
    const from = cairoYmdBounds(fromYmd);
    const to = cairoYmdBounds(toYmd);
    if (from && to) {
      where = { createdAt: { gte: from.start, lt: to.endExclusive } };
    }
  }

  const rows = await prisma.csOrderAssignment.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  const agents = await prisma.csAgent.findMany();
  const byId = new Map(agents.map((a) => [a.id, a]));
  const agentIds = [...new Set(rows.map((row) => row.agentId))];
  const assigned =
    agentIds.length > 0
      ? await prisma.csOrderConfirmation.findMany({
          where: { assignedAgentId: { in: agentIds } },
          select: { assignedAgentId: true, wooOrderNumber: true },
        })
      : [];

  return rows.map((row) => {
    const visible = assigned.filter((order) => {
      if (order.assignedAgentId !== row.agentId) return false;
      const number = parseWooOrderNumber(order.wooOrderNumber);
      return number >= row.wooOrderNumberFrom && number <= row.wooOrderNumberTo;
    }).length;
    return {
      id: row.id,
      agentId: row.agentId,
      wooOrderNumberFrom: row.wooOrderNumberFrom,
      wooOrderNumberTo: row.wooOrderNumberTo,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      agentName: byId.get(row.agentId)?.name || `مسؤول #${row.agentId}`,
      countEstimate: visible,
    };
  });
}

/** Unassigned confirmations with order number after last pre-today distribution max. */
export async function listPendingAfterLastDistribution(limit = 500) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { lastTo: 0, pending: [] as Array<{ id: number; wooOrderNumber: string; orderNum: number }> };
  }
  await ensureCsTables();

  const today = cairoYmdBounds(cairoTodayYmd());
  let lastTo = 0;
  if (today) {
    const prior = await prisma.csOrderAssignment.findMany({
      where: { createdAt: { lt: today.start } },
      select: { wooOrderNumberFrom: true, wooOrderNumberTo: true },
    });
    for (const row of prior) {
      lastTo = Math.max(lastTo, row.wooOrderNumberFrom, row.wooOrderNumberTo);
    }
  }

  const take = Math.max(1, Math.min(2000, Math.floor(limit)));
  const rows = await prisma.$queryRaw<Array<{ id: number; wooOrderNumber: string; orderNum: bigint | number }>>`
    SELECT id, wooOrderNumber,
      CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) AS orderNum
    FROM CsOrderConfirmation
    WHERE assignedAgentId IS NULL
      AND CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) > ${lastTo}
    ORDER BY orderNum ASC
    LIMIT ${Prisma.raw(String(take))}
  `;

  const pending = rows.map((row) => ({
    id: Number(row.id),
    wooOrderNumber: row.wooOrderNumber,
    orderNum: Number(row.orderNum) || 0,
  }));

  return { lastTo, pending };
}

export async function getAssignmentRangesForAgent(agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as Array<{ from: number; to: number }>;
  await ensureCsTables();
  try {
    const rows = await prisma.csOrderAssignment.findMany({ where: { agentId } });
    return rows.map((row) => ({
      from: Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo),
      to: Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo),
    }));
  } catch (error) {
    console.error("[cs] getAssignmentRangesForAgent:", error);
    await ensureCsTables();
    try {
      const rows = await prisma.csOrderAssignment.findMany({ where: { agentId } });
      return rows.map((row) => ({
        from: Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo),
        to: Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo),
      }));
    } catch {
      return [];
    }
  }
}

export function orderNumberInRanges(orderNumber: string, ranges: Array<{ from: number; to: number }>) {
  if (ranges.length === 0) return false;
  const n = parseWooOrderNumber(orderNumber);
  return ranges.some((r) => n >= r.from && n <= r.to);
}

type CsDb = NonNullable<ReturnType<typeof getPrismaClient>>;

async function stampOrdersInRange(prisma: CsDb, agentId: number, from: number, to: number) {
  await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET assignedAgentId = ${agentId}
    WHERE CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) BETWEEN ${from} AND ${to}
  `;
  const counted = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT COUNT(*) AS n
    FROM CsOrderConfirmation
    WHERE assignedAgentId = ${agentId}
      AND CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) BETWEEN ${from} AND ${to}
  `;
  return Number(counted[0]?.n ?? 0);
}

async function unstampOrdersInRange(prisma: CsDb, agentId: number, from: number, to: number) {
  await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET assignedAgentId = NULL
    WHERE assignedAgentId = ${agentId}
      AND CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) BETWEEN ${from} AND ${to}
  `;
}

export async function createAssignment(input: {
  agentId: number;
  wooOrderNumberFrom: number;
  wooOrderNumberTo: number;
  createdById: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const from = Math.min(input.wooOrderNumberFrom, input.wooOrderNumberTo);
  const to = Math.max(input.wooOrderNumberFrom, input.wooOrderNumberTo);
  if (!from || !to) return { ok: false as const, message: "أرقام الأوردر غير صالحة." };

  const agent = await prisma.csAgent.findUnique({ where: { id: input.agentId } });
  if (!agent || !agent.isActive) return { ok: false as const, message: "مسؤول خدمة العملاء غير موجود." };

  const row = await prisma.csOrderAssignment.create({
    data: {
      agentId: input.agentId,
      wooOrderNumberFrom: from,
      wooOrderNumberTo: to,
      createdById: input.createdById,
    },
  });

  const stamped = await stampOrdersInRange(prisma, input.agentId, from, to);

  return { ok: true as const, assignment: row, stamped };
}

export async function deleteAssignment(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  const row = await prisma.csOrderAssignment.findUnique({ where: { id } });
  if (!row) return { ok: false as const, message: "التوزيع غير موجود." };
  const from = Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo);
  const to = Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo);
  await unstampOrdersInRange(prisma, row.agentId, from, to);
  await prisma.csOrderAssignment.delete({ where: { id } });
  return { ok: true as const };
}

/** One pass over today's saved ranges so a missed stamp still reaches the agent sheet. */
export async function restampTodayAssignmentsOnce() {
  const prisma = getPrismaClient();
  if (!prisma) return { stamped: 0 };
  await ensureCsTables();
  const day = cairoTodayYmd();
  const already = await prisma.$queryRaw<Array<{ dayYmd: string }>>`
    SELECT dayYmd FROM CsAssignmentRestamp WHERE dayYmd = ${day} LIMIT 1
  `;
  if (already.length) return { stamped: 0 };

  const bounds = cairoYmdBounds(day);
  if (!bounds) return { stamped: 0 };
  const rows = await prisma.csOrderAssignment.findMany({
    where: { createdAt: { gte: bounds.start, lt: bounds.endExclusive } },
    orderBy: { createdAt: "asc" },
  });
  let stamped = 0;
  for (const row of rows) {
    const from = Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo);
    const to = Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo);
    stamped += await stampOrdersInRange(prisma, row.agentId, from, to);
  }
  await prisma.$executeRaw`
    INSERT IGNORE INTO CsAssignmentRestamp (dayYmd) VALUES (${day})
  `;
  return { stamped };
}

export async function fairSplitAssign(input: {
  agentIds: number[];
  confirmationIds?: number[];
  governorate?: string;
  area?: string;
  createdById: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const { isWithinCairoTodayOrYesterday } = await import("@/lib/cs/order-window");

  const agentIds = [...new Set(input.agentIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (agentIds.length < 2) return { ok: false as const, message: "اختاري مسؤولين اثنين على الأقل." };

  const agents = await prisma.csAgent.findMany({ where: { id: { in: agentIds }, isActive: true } });
  if (agents.length !== agentIds.length) {
    return { ok: false as const, message: "أحد المسؤولين غير موجود أو غير نشط." };
  }

  function locMatch(haystack: string | null | undefined, needle: string) {
    if (!needle) return true;
    const h = String(haystack || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    const n = needle.trim().replace(/\s+/g, " ").toLowerCase();
    if (!h || !n) return false;
    return h === n || h.includes(n) || n.includes(h);
  }

  let rows: Awaited<ReturnType<typeof prisma.csOrderConfirmation.findMany>>;

  if (input.confirmationIds?.length) {
    // Visible-queue mode: distribute exactly these IDs
    rows = await prisma.csOrderConfirmation.findMany({
      where: { id: { in: input.confirmationIds } },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) {
      return { ok: false as const, message: "لا توجد أوردرات ظاهرة للتوزيع. زامني القائمة أولاً." };
    }
  } else {
    rows = await prisma.csOrderConfirmation.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    // Same default window as the main queue (today + yesterday)
    rows = rows.filter((row) => {
      const snap = row.customerSnapshot as { dateCreated?: string } | null;
      return isWithinCairoTodayOrYesterday(snap?.dateCreated);
    });
    if (input.governorate || input.area) {
      rows = rows.filter((row) => {
        const snap = row.customerSnapshot as { governorate?: string; area?: string } | null;
        if (input.governorate && !locMatch(snap?.governorate, input.governorate)) return false;
        if (input.area && !locMatch(snap?.area, input.area)) return false;
        return true;
      });
    }
    if (rows.length === 0) {
      return {
        ok: false as const,
        message: "لا توجد أوردرات ظاهرة (اليوم/أمس) للتوزيع. زامني أو اتركي فلتر المحافظة فارغاً.",
      };
    }
  }

  // Contiguous blocks by order number (not round-robin):
  // agent1 gets lowest N, agent2 next block, … — non-overlapping ranges.
  rows = [...rows].sort(
    (a, b) => parseWooOrderNumber(a.wooOrderNumber) - parseWooOrderNumber(b.wooOrderNumber),
  );

  const n = rows.length;
  const k = agentIds.length;
  const base = Math.floor(n / k);
  const rem = n % k;

  const ranges: Array<{ agentId: number; from: number; to: number; count: number }> = [];
  let assigned = 0;
  let cursor = 0;

  for (let i = 0; i < k; i++) {
    const size = base + (i < rem ? 1 : 0);
    if (size <= 0) continue;
    const chunk = rows.slice(cursor, cursor + size);
    cursor += size;
    const agentId = agentIds[i];
    const nums = chunk.map((r) => parseWooOrderNumber(r.wooOrderNumber)).filter((x) => x > 0);
    if (!nums.length) continue;

    for (const row of chunk) {
      await prisma.csOrderConfirmation.update({
        where: { id: row.id },
        data: { assignedAgentId: agentId },
      });
      assigned += 1;
    }

    const from = Math.min(...nums);
    const to = Math.max(...nums);
    await prisma.csOrderAssignment.create({
      data: {
        agentId,
        wooOrderNumberFrom: from,
        wooOrderNumberTo: to,
        createdById: input.createdById,
      },
    });
    ranges.push({ agentId, from, to, count: chunk.length });
  }

  return {
    ok: true as const,
    assigned,
    perAgent: Math.ceil(n / k),
    ranges,
  };
}

export async function ruleBasedAssign(input: {
  mode: "shipping" | "paid" | "region_agent" | "region_shipping";
  createdById: number;
  governorate?: string;
  area?: string;
  /** agentId keyed by shipping company / paid / region */
  rules: Array<{
    agentId?: number;
    shippingCompany?: "bosta" | "sayed_temima";
    paidOnline?: boolean;
    governorate?: string;
    area?: string;
  }>;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  let rows = await prisma.csOrderConfirmation.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  if (input.governorate || input.area) {
    rows = rows.filter((row) => {
      const snap = row.customerSnapshot as { governorate?: string; area?: string } | null;
      if (input.governorate && snap?.governorate !== input.governorate) return false;
      if (input.area && snap?.area !== input.area) return false;
      return true;
    });
  }

  let updated = 0;
  const monaHeld = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM CsOrderConfirmation WHERE monaCourierId IS NOT NULL
  `;
  const monaIds = new Set(monaHeld.map((item) => Number(item.id)));

  for (const row of rows) {
    const snap = row.customerSnapshot as {
      governorate?: string;
      area?: string;
      paidOnlineHighlight?: boolean;
      paymentState?: string;
    } | null;

    if (input.mode === "shipping") {
      for (const rule of input.rules) {
        if (!rule.agentId || !rule.shippingCompany) continue;
        if (row.shippingCompany === rule.shippingCompany) {
          await prisma.csOrderConfirmation.update({
            where: { id: row.id },
            data: { assignedAgentId: rule.agentId },
          });
          updated += 1;
          break;
        }
      }
    } else if (input.mode === "paid") {
      for (const rule of input.rules) {
        if (!rule.agentId || rule.paidOnline === undefined) continue;
        const snapPayment =
          snap?.paymentState ||
          (snap?.paidOnlineHighlight ? "paid" : "cod");
        const isPaid = snapPayment === "paid";
        if (isPaid === rule.paidOnline) {
          await prisma.csOrderConfirmation.update({
            where: { id: row.id },
            data: { assignedAgentId: rule.agentId },
          });
          updated += 1;
          break;
        }
      }
    } else if (input.mode === "region_agent") {
      for (const rule of input.rules) {
        if (!rule.agentId) continue;
        if (rule.governorate && snap?.governorate !== rule.governorate) continue;
        if (rule.area && snap?.area !== rule.area) continue;
        if (!rule.governorate && !rule.area) continue;
        await prisma.csOrderConfirmation.update({
          where: { id: row.id },
          data: { assignedAgentId: rule.agentId },
        });
        updated += 1;
        break;
      }
    } else if (input.mode === "region_shipping") {
      for (const rule of input.rules) {
        if (!rule.shippingCompany) continue;
        if (rule.governorate && snap?.governorate !== rule.governorate) continue;
        if (rule.area && snap?.area !== rule.area) continue;
        if (!rule.governorate && !rule.area) continue;
        if (rule.shippingCompany === "sayed_temima" && monaIds.has(row.id)) continue;
        await prisma.csOrderConfirmation.update({
          where: { id: row.id },
          data: { shippingCompany: rule.shippingCompany },
        });
        updated += 1;
        break;
      }
    }
  }

  return { ok: true as const, updated };
}

type ShippingAssignRule = {
  agentId: number;
  shippingCompany: "bosta" | "sayed_temima";
  orderFrom: number | null;
  orderTo: number | null;
};

function orderInShippingWindow(
  orderNum: number,
  dateIso: string,
  rule: ShippingAssignRule,
  fromYmd: string,
  toYmd: string,
) {
  if (rule.orderFrom) {
    if (orderNum < rule.orderFrom) return false;
    if (rule.orderTo && orderNum > rule.orderTo) return false;
    return orderNum > 0;
  }
  return isWithinCairoDateRange(dateIso, fromYmd, toYmd);
}

function segmentsWithoutForeignOrders(
  orders: Array<{ id: number; num: number }>,
  occupied: Set<number>,
) {
  const sorted = [...orders].filter((order) => order.num > 0).sort((a, b) => a.num - b.num);
  const chosen = new Set(sorted.map((order) => order.num));
  const segments: Array<{ from: number; to: number; ids: number[] }> = [];
  if (!sorted.length) return segments;
  let from = sorted[0].num;
  let ids = [sorted[0].id];
  let prev = sorted[0].num;
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index];
    let blocked = false;
    for (const num of occupied) {
      if (num > prev && num < next.num && !chosen.has(num)) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      segments.push({ from, to: prev, ids });
      from = next.num;
      ids = [next.id];
    } else {
      ids.push(next.id);
    }
    prev = next.num;
  }
  segments.push({ from, to: prev, ids });
  return segments;
}

export async function assignByShippingCompany(input: {
  createdById: number;
  fromYmd: string;
  toYmd: string;
  rules: ShippingAssignRule[];
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const rules = input.rules.filter((rule) => rule.agentId > 0 && (rule.shippingCompany === "bosta" || rule.shippingCompany === "sayed_temima"));
  if (!rules.length) return { ok: false as const, message: "اختاري مسؤول لشركة شحن واحدة على الأقل." };
  for (const rule of rules) {
    if (rule.orderTo && !rule.orderFrom) {
      return { ok: false as const, message: "اكتبي رقم «من» قبل رقم «إلى»." };
    }
    if (rule.orderFrom && rule.orderTo && rule.orderTo < rule.orderFrom) {
      return { ok: false as const, message: "رقم «إلى» لازم يكون بعد رقم «من»." };
    }
  }
  const needsDays = rules.some((rule) => !rule.orderFrom);
  if (needsDays && (!cairoYmdBounds(input.fromYmd) || !cairoYmdBounds(input.toYmd) || input.fromYmd > input.toYmd)) {
    return { ok: false as const, message: "حددي أيام التوزيع، أو اكتبي رقم أوردر البداية." };
  }

  const agents = await prisma.csAgent.findMany({
    where: { id: { in: [...new Set(rules.map((rule) => rule.agentId))] }, isActive: true },
  });
  if (agents.length !== new Set(rules.map((rule) => rule.agentId)).size) {
    return { ok: false as const, message: "أحد المسؤولين غير موجود أو غير نشط." };
  }

  const openRows = await prisma.$queryRaw<
    Array<{
      id: number;
      wooOrderNumber: string;
      shippingCompany: string | null;
      createdAt: Date;
      dateCreated: string | null;
    }>
  >`
    SELECT id, wooOrderNumber, shippingCompany, createdAt,
      JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.dateCreated')) AS dateCreated
    FROM CsOrderConfirmation
    WHERE assignedAgentId IS NULL
  `;

  const open = openRows.map((row) => ({
    id: Number(row.id),
    num: parseWooOrderNumber(row.wooOrderNumber),
    shippingCompany: String(row.shippingCompany || "").trim(),
    dateIso: row.dateCreated || row.createdAt.toISOString(),
  }));

  const taken = new Set<number>();
  const counts = { bosta: 0, temima: 0 };
  const ranges: Array<{ agentId: number; shippingCompany: string; from: number; to: number; count: number }> = [];

  for (const rule of rules) {
    const matched = open.filter((row) => {
      if (taken.has(row.id) || row.shippingCompany !== rule.shippingCompany) return false;
      return orderInShippingWindow(row.num, row.dateIso, rule, input.fromYmd, input.toYmd);
    });
    if (!matched.length) continue;
    const nums = matched.map((row) => row.num).filter((num) => num > 0);
    if (!nums.length) continue;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const existing = await prisma.$queryRaw<Array<{ orderNum: bigint | number }>>`
      SELECT CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) AS orderNum
      FROM CsOrderConfirmation
      WHERE CAST(REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED) BETWEEN ${min} AND ${max}
    `;
    const occupied = new Set(existing.map((row) => Number(row.orderNum)));
    const segments = segmentsWithoutForeignOrders(matched, occupied);
    for (const segment of segments) {
      const updated = await prisma.csOrderConfirmation.updateMany({
        where: { id: { in: segment.ids }, assignedAgentId: null },
        data: { assignedAgentId: rule.agentId },
      });
      if (!updated.count) continue;
      await prisma.csOrderAssignment.create({
        data: {
          agentId: rule.agentId,
          wooOrderNumberFrom: segment.from,
          wooOrderNumberTo: segment.to,
          createdById: input.createdById,
        },
      });
      for (const id of segment.ids) taken.add(id);
      if (rule.shippingCompany === "bosta") counts.bosta += updated.count;
      else counts.temima += updated.count;
      ranges.push({
        agentId: rule.agentId,
        shippingCompany: rule.shippingCompany,
        from: segment.from,
        to: segment.to,
        count: updated.count,
      });
    }
  }

  const unscoped = open.filter((row) => {
    if (row.shippingCompany || taken.has(row.id)) return false;
    return rules.some((rule) => orderInShippingWindow(row.num, row.dateIso, rule, input.fromYmd, input.toYmd));
  }).length;

  return { ok: true as const, ...counts, unscoped, ranges };
}
