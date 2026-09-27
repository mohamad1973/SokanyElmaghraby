import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cairoTodayYmd } from "@/lib/cs/order-window";
import { cutoffMinutes, isValidTemimaCutoff, type TemimaCutoff } from "@/lib/cs/temima-sheet";

export async function listTemimaCutoffs(): Promise<TemimaCutoff[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  const rows = await prisma.csTemimaSheetCutoff.findMany({
    orderBy: { dayYmd: "desc" },
    take: 40,
    select: { dayYmd: true, minutes: true },
  });
  return rows.map((row) => ({ dayYmd: row.dayYmd, minutes: row.minutes }));
}

export async function lockTemimaCutoff(hour: number, minute: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!isValidTemimaCutoff(hour, minute)) {
    return { ok: false as const, message: "الساعة من 8:00 صباحاً إلى 4:00 عصراً." };
  }
  const dayYmd = cairoTodayYmd();
  const existing = await prisma.csTemimaSheetCutoff.findUnique({ where: { dayYmd }, select: { minutes: true } });
  if (existing) return { ok: false as const, message: "ساعة النهاردة اتقفلت ومش هتتغير." };
  try {
    await prisma.csTemimaSheetCutoff.create({ data: { dayYmd, minutes: cutoffMinutes(hour, minute) } });
  } catch {
    return { ok: false as const, message: "ساعة النهاردة اتقفلت ومش هتتغير." };
  }
  return { ok: true as const, dayYmd, minutes: cutoffMinutes(hour, minute) };
}
