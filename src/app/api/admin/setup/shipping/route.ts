import { NextResponse } from "next/server";

import { getShippingBootstrapStatus, initializeShippingDatabase, seedDefaultDeliveryZones } from "@/lib/shipping/bootstrap";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const status = await getShippingBootstrapStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };

  if (body.action === "seed-zones") {
    const result = await seedDefaultDeliveryZones();
    const status = await getShippingBootstrapStatus();
    return NextResponse.json({ ...result, status }, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "init-db") {
    const result = await initializeShippingDatabase();
    const status = await getShippingBootstrapStatus();
    return NextResponse.json({ ...result, status }, { status: result.ok ? 200 : 400 });
  }

  const status = await getShippingBootstrapStatus();
  return NextResponse.json({ ok: true, status });
}
