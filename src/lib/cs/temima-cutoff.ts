import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cairoClock, cairoTodayYmd } from "@/lib/cs/order-window";
import { hasTemimaFreezeDay, hasTemimaPrepareHold } from "@/lib/cs/temima-sheet-freeze";
import { type TemimaCutoff } from "@/lib/cs/temima-sheet";

export async function listTemimaCutoffs(): Promise<TemimaCutoff[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  const rows = await prisma.csTemimaSheetCutoff.findMany({
    orderBy: { dayYmd: "desc" },
    take: 400,
    select: { dayYmd: true, minutes: true },
  });
  return rows.map((row) => ({ dayYmd: row.dayYmd, minutes: row.minutes }));
}

export async function ensureTemimaDayCutoff(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma || !/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) {
    return { ok: false as const, message: "اليوم غير صحيح." };
  }
  const existing = await prisma.csTemimaSheetCutoff.findUnique({
    where: { dayYmd },
    select: { minutes: true },
  });
  if (existing) return { ok: true as const, dayYmd, minutes: existing.minutes };
  const clock = cairoClock(new Date().toISOString());
  if (!clock) return { ok: false as const, message: "الساعة غير صحيحة." };
  await prisma.csTemimaSheetCutoff.create({ data: { dayYmd, minutes: clock.minutes } });
  return { ok: true as const, dayYmd, minutes: clock.minutes };
}

export async function lockTemimaCutoff(chosenMinutes?: number, allowFrozen = false) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  let dayYmd = "";
  let minutes = 0;
  if (chosenMinutes == null) {
    const clock = cairoClock(new Date().toISOString());
    if (!clock) return { ok: false as const, message: "الساعة غير صحيحة." };
    dayYmd = clock.ymd;
    minutes = clock.minutes;
  } else if (!Number.isInteger(chosenMinutes) || chosenMinutes < 0 || chosenMinutes > 23 * 60 + 59) {
    return { ok: false as const, message: "الساعة غير صحيحة." };
  } else {
    dayYmd = cairoTodayYmd();
    minutes = chosenMinutes;
  }
  if (!allowFrozen && (await hasTemimaFreezeDay(dayYmd))) {
    const existing = await prisma.csTemimaSheetCutoff.findUnique({ where: { dayYmd }, select: { minutes: true } });
    return { ok: true as const, dayYmd, minutes: existing?.minutes ?? minutes, frozen: true as const };
  }
  if (await hasTemimaPrepareHold(dayYmd)) {
    return { ok: false as const, message: "اليوم متجهز يدويًا. استخدم قفل وتجميد من الشيت." };
  }
  await prisma.csTemimaSheetCutoff.upsert({
    where: { dayYmd },
    create: { dayYmd, minutes },
    update: { minutes },
  });
  return { ok: true as const, dayYmd, minutes, frozen: await hasTemimaFreezeDay(dayYmd) };
}
