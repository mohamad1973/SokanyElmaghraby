import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  recordWarehouseSheetPrintBatch,
  summarizeWarehouseSheetDay,
} from "@/lib/cs/warehouse-sheet-print";
import { requireCsSession } from "@/lib/session-guards";

function canManageWarehouseSheet(viewer: {
  isAdmin?: boolean;
  isSupervisor?: boolean;
  isCourierSupervisor?: boolean;
}) {
  return Boolean(viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor));
}

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!canManageWarehouseSheet(viewer)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  const url = new URL(request.url);
  const dayYmd = url.searchParams.get("day") || "";
  const shippingCompany = url.searchParams.get("shipping") || "bosta";
  const summary = await summarizeWarehouseSheetDay(dayYmd, shippingCompany);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!canManageWarehouseSheet(viewer)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
    dayYmd?: string;
    shippingCompany?: string;
    reprint?: boolean;
  } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.map((id) => Number(id)) : [];
  const result = await recordWarehouseSheetPrintBatch({
    ids,
    dayYmd: String(body?.dayYmd || ""),
    shippingCompany: String(body?.shippingCompany || "bosta"),
    agentId: session.user.csAgentId,
    reprint: Boolean(body?.reprint),
  });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    batchNo: result.batchNo,
    orderCount: result.orderCount,
    kind: result.kind,
    batches: result.batches,
    message: "message" in result ? result.message : undefined,
  });
}
