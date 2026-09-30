import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cairoClock } from "@/lib/cs/order-window";
import { type TemimaCutoff } from "@/lib/cs/temima-sheet";

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

export async function lockTemimaCutoff() {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const clock = cairoClock(new Date().toISOString());
  if (!clock) return { ok: false as const, message: "الساعة غير صحيحة." };
  const dayYmd = clock.ymd;
  const minutes = clock.minutes;
  await prisma.csTemimaSheetCutoff.upsert({
    where: { dayYmd },
    create: { dayYmd, minutes },
    update: { minutes },
  });
  return { ok: true as const, dayYmd, minutes };
}
