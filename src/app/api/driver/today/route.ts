import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/db";
import { requireDriverSession } from "@/lib/session-guards";

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function GET() {
  const session = await requireDriverSession();

  if (!session?.user.driverId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const run = await prisma.deliveryRun.findUnique({
    where: {
      driverId_runDate: {
        driverId: session.user.driverId,
        runDate: todayDateOnly(),
      },
    },
    include: {
      assignments: {
        include: { shipment: true },
        orderBy: { sequence: "asc" },
      },
    },
  });

  return NextResponse.json({
    run,
    summary: {
      total: run?.assignments.length || 0,
      delivered: run?.assignments.filter((item) => item.status === "delivered").length || 0,
      pending: run?.assignments.filter((item) => item.status !== "delivered" && item.status !== "failed").length || 0,
      codTotal: run ? Number(run.totalCod) : 0,
    },
  });
}
