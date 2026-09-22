import { NextResponse } from "next/server";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  RETURN_REASONS,
  createReturnEvent,
  invalidateTransfersAnalyticsCache,
  listReturnEvents,
} from "@/lib/cs/transfers-analytics";
import { requireCsSession } from "@/lib/session-guards";

async function requireTransfersAccess() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) return null;
  return { session, viewer };
}

export async function GET() {
  const access = await requireTransfersAccess();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const returns = await listReturnEvents(150);
  return NextResponse.json({ returns, reasons: RETURN_REASONS });
}

export async function POST(request: Request) {
  const access = await requireTransfersAccess();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  let body: {
    wooOrderId?: number;
    wooOrderNumber?: string;
    productId?: number;
    productName?: string;
    sku?: string;
    quantity?: number;
    reason?: string;
    reasonNote?: string;
    isManufacturingDefect?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const result = await createReturnEvent({
    wooOrderId: body.wooOrderId,
    wooOrderNumber: body.wooOrderNumber,
    productId: Number(body.productId),
    productName: String(body.productName || ""),
    sku: body.sku,
    quantity: Number(body.quantity) || 1,
    reason: String(body.reason || ""),
    reasonNote: body.reasonNote,
    isManufacturingDefect: Boolean(body.isManufacturingDefect),
    createdByAgentId: access.session.user.csAgentId,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  invalidateTransfersAnalyticsCache();
  return NextResponse.json({ ok: true });
}
