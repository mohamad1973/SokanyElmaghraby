import { NextResponse } from "next/server";

import { ensureCsBostaWaybill, persistWaybillParty, refreshCsBostaWaybill, syncCsBostaWaybill } from "@/lib/cs/bosta-waybill";
import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { isHomeConfirmOnlyAgent } from "@/lib/cs/home-confirm";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  if (await isHomeConfirmOnlyAgent(session.user.csAgentId)) {
    return NextResponse.json({ message: "غير مصرح لتأكيدات المنزل." }, { status: 403 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  let body: { action?: string; answers?: CsChecklistAnswerInput[] } = {};
  try {
    body = (await request.json()) as { action?: string; answers?: CsChecklistAnswerInput[] };
  } catch {
    body = {};
  }

  if (body.action === "update") {
    const persisted = await persistWaybillParty(numericId, Array.isArray(body.answers) ? body.answers : undefined);
    if (!persisted.ok) {
      return NextResponse.json({ message: persisted.message }, { status: 400 });
    }
    if (!persisted.trackingNumber || String(persisted.shippingCompany || "").trim() !== "bosta") {
      return NextResponse.json({
        ok: true,
        trackingNumber: persisted.trackingNumber,
        message: "تم حفظ بيانات البوليصة.",
      });
    }
    const state = await syncCsBostaWaybill({
      confirmationId: numericId,
      wooOrderId: persisted.wooOrderId,
      wooOrderNumber: persisted.wooOrderNumber,
      shippingCompany: persisted.shippingCompany,
      trackingNumber: persisted.trackingNumber,
      bostaStatus: persisted.bostaStatus,
      bostaShippingFee: persisted.bostaShippingFee,
      answers: persisted.answers,
      snapshot: persisted.snapshot,
      orderTotalDelta: persisted.orderTotalDelta,
      depositAmount: persisted.depositAmount,
      depositPaid: persisted.depositPaid,
      depositApprovalStatus: persisted.depositApprovalStatus,
      preserveShippingCompany: true,
    });
    return NextResponse.json({
      ...state,
      ok: true,
      message: state.message || "تم حفظ بيانات البوليصة.",
    });
  }

  if (body.action === "create") {
    const created = await ensureCsBostaWaybill(numericId, {
      answers: Array.isArray(body.answers) ? body.answers : undefined,
      preserveShippingCompany: true,
    });
    if (!created.ok) {
      return NextResponse.json({ message: created.message }, { status: 400 });
    }
    return NextResponse.json({
      ...created.state,
      created: created.created,
      ok: true,
      message: created.created
        ? created.state.message || "تم إنشاء بوليصة بوسطة وربطها بالأوردر."
        : "البوليصة موجودة واتربطت بالأوردر.",
    });
  }

  const state = await refreshCsBostaWaybill(numericId);
  if (!state) {
    return NextResponse.json({ message: "الطلب غير موجود." }, { status: 404 });
  }

  return NextResponse.json(state);
}
