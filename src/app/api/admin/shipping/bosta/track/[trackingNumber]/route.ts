import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/session-guards";
import { trackBostaDelivery } from "@/lib/shipping/bosta-client";
import { getPrismaClient } from "@/lib/db";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";

type RouteContext = {
  params: Promise<{ trackingNumber: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { trackingNumber } = await context.params;
  const result = await trackBostaDelivery(trackingNumber);

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  const prisma = getPrismaClient();

  if (prisma && result.status) {
    await prisma.shipment.updateMany({
      where: { trackingNumber },
      data: { status: result.status, rawPayload: result.raw as object },
    });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    statusLabelAr: getBostaStatusLabelAr(result.status || ""),
    history: result.history,
  });
}
