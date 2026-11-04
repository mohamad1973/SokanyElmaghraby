import { NextResponse } from "next/server";

import {
  getCsConfirmation,
  saveCsConfirmation,
  setCsHandedToCarrier,
  setCsInvoiceNumber,
  setCsShippingCompany,
  resolveCsViewer,
} from "@/lib/cs/confirmations";
import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { getCsCarrierByCode } from "@/lib/cs/sokany-waybill";
import { usesSokanyWaybillPrint } from "@/lib/cs/sokany-waybill-types";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

type Body = {
  answers?: CsChecklistAnswerInput[];
  finalize?: boolean;
  failContact?: boolean;
  cancelOrder?: boolean;
  failReason?: string;
  trackingNumber?: string | null;
  waybillPrinted?: boolean;
  depositAmount?: number | string | null;
  depositPaid?: boolean;
  depositPayMethod?: string | null;
  depositFromNumber?: string | null;
  depositInstapayName?: string | null;
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  orderTotalDelta?: number | string | null;
  shippingCompany?: string | null;
  salesOrderNumber?: string | null;
  invoiceNumber?: string | null;
  handedToCarrier?: boolean;
  postCancel?: {
    invoice?: "before" | "after" | "";
    systemNo?: string | null;
    refundPaid?: boolean;
  };
  followUp?: {
    handedToCarrier?: boolean;
    deliveredToCustomer?: boolean;
    customerFollowUp?: boolean;
  };
  sheetDayChoice?: "previous" | "today";
};

export async function GET(_request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }
  const confirmation = await getCsConfirmation(numericId);
  if (!confirmation) {
    return NextResponse.json({ message: "الأوردر غير موجود." }, { status: 404 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (viewer.isHomeConfirmOnly && confirmation.assignedAgentId !== session.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const carrier = await getCsCarrierByCode(String(confirmation.shippingCompany || ""));
  const snap = (confirmation.customerSnapshot || null) as Record<string, unknown> | null;
  const row = confirmation as { trackingNumber?: string | null; waybillPrinted?: boolean | null };
  const text = (key: string) =>
    String(confirmation.answers.find((answer) => answer.itemKey === key)?.value || "").trim();
  const snapshot: Record<string, unknown> | null = snap
    ? {
        ...snap,
        customerName: String(snap.customerName || text("customer_name") || "").trim() || snap.customerName,
        phone: String(snap.phone || text("primary_phone") || "").trim() || snap.phone,
        address: String(snap.address || text("address_complete") || "").trim() || snap.address,
        governorate: String(snap.governorate || text("governorate_confirm") || "").trim() || snap.governorate,
        area: String(snap.area || text("area_confirm") || "").trim() || snap.area,
      }
    : snap;
  return NextResponse.json({
    ok: true,
    confirmationId: confirmation.id,
    status: confirmation.status,
    shippingCompany: confirmation.shippingCompany,
    trackingNumber: row.trackingNumber || (typeof snapshot?.trackingNumber === "string" ? snapshot.trackingNumber : null),
    waybillPrinted: Boolean(row.waybillPrinted),
    sokanyWaybill: usesSokanyWaybillPrint(confirmation.shippingCompany, carrier?.waybillProvider === "sokany"),
    snapshot,
  });
}

export async function PUT(request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  if (
    body.invoiceNumber !== undefined &&
    body.shippingCompany === undefined &&
    !body.answers &&
    !body.finalize &&
    !body.failContact &&
    !body.cancelOrder &&
    body.trackingNumber === undefined &&
    body.waybillPrinted === undefined &&
    body.depositAmount === undefined &&
    body.depositPaid === undefined &&
    body.depositPayMethod === undefined &&
    body.depositFromNumber === undefined &&
    body.depositInstapayName === undefined &&
    body.depositToPhone === undefined &&
    body.depositToMethod === undefined &&
    body.orderTotalDelta === undefined &&
    body.salesOrderNumber === undefined &&
    body.handedToCarrier === undefined &&
    !body.postCancel &&
    !body.followUp
  ) {
    const result = await setCsInvoiceNumber({
      id: numericId,
      invoiceNumber: body.invoiceNumber,
      agentId: session.user.csAgentId,
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      invoiceNumber: result.invoiceNumber,
      invoiceNumberAt: result.invoiceNumberAt,
    });
  }

  // Supervisor-only quick update for shipping company from the queue
  if (
    body.shippingCompany !== undefined &&
    !body.answers &&
    !body.finalize &&
    !body.failContact &&
    !body.cancelOrder &&
    body.trackingNumber === undefined &&
    body.waybillPrinted === undefined &&
    body.depositAmount === undefined &&
    body.depositPaid === undefined &&
    body.depositPayMethod === undefined &&
    body.depositFromNumber === undefined &&
    body.depositInstapayName === undefined &&
    body.depositToPhone === undefined &&
    body.depositToMethod === undefined &&
    body.orderTotalDelta === undefined &&
    body.salesOrderNumber === undefined &&
    body.invoiceNumber === undefined &&
    body.handedToCarrier === undefined &&
    !body.postCancel &&
    !body.followUp
  ) {
    const viewer = await resolveCsViewer(session.user.csAgentId);
    if (!viewer.isSupervisor && !session.user.csIsSupervisor) {
      return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });
    }
    const company = typeof body.shippingCompany === "string" ? body.shippingCompany : null;
    const result = await setCsShippingCompany({
      id: numericId,
      shippingCompany: company,
      agentId: session.user.csAgentId,
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, shippingCompany: result.shippingCompany });
  }

  if (
    typeof body.handedToCarrier === "boolean" &&
    body.shippingCompany === undefined &&
    !body.answers &&
    !body.finalize &&
    !body.failContact &&
    !body.cancelOrder &&
    body.trackingNumber === undefined &&
    body.waybillPrinted === undefined &&
    body.depositAmount === undefined &&
    body.depositPaid === undefined &&
    body.depositPayMethod === undefined &&
    body.depositFromNumber === undefined &&
    body.depositInstapayName === undefined &&
    body.depositToPhone === undefined &&
    body.depositToMethod === undefined &&
    body.orderTotalDelta === undefined &&
    body.salesOrderNumber === undefined &&
    body.invoiceNumber === undefined &&
    !body.postCancel &&
    !body.followUp
  ) {
    const viewer = await resolveCsViewer(session.user.csAgentId);
    const allowed =
      viewer.isAdmin ||
      Boolean(session.user.csIsAdmin) ||
      ((viewer.isSupervisor || Boolean(session.user.csIsSupervisor)) && !viewer.isCourierSupervisor);
    if (!allowed) {
      return NextResponse.json({ message: "للأدمن ومشرفة خدمة العملاء فقط." }, { status: 403 });
    }
    const result = await setCsHandedToCarrier({
      id: numericId,
      handedToCarrier: body.handedToCarrier,
      agentId: session.user.csAgentId,
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      handedToCarrier: result.handedToCarrier,
      handedToCarrierAt: result.handedToCarrierAt,
    });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const homeConfirmMode = Boolean(viewer.isHomeConfirmOnly);
  if (homeConfirmMode) {
    const confirmation = await getCsConfirmation(numericId);
    if (!confirmation || confirmation.assignedAgentId !== session.user.csAgentId) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }
  }
  const result = await saveCsConfirmation({
    id: numericId,
    agentId: session.user.csAgentId,
    answers: body.answers || [],
    finalize: Boolean(body.finalize),
    failContact: Boolean(body.failContact),
    cancelOrder: Boolean(body.cancelOrder),
    failReason: body.failReason,
    trackingNumber: homeConfirmMode ? undefined : body.trackingNumber,
    waybillPrinted: homeConfirmMode ? undefined : body.waybillPrinted,
    depositAmount: homeConfirmMode ? undefined : body.depositAmount,
    depositPaid: homeConfirmMode ? undefined : body.depositPaid,
    depositPayMethod: homeConfirmMode ? undefined : body.depositPayMethod,
    depositFromNumber: homeConfirmMode ? undefined : body.depositFromNumber,
    depositInstapayName: homeConfirmMode ? undefined : body.depositInstapayName,
    depositToPhone: homeConfirmMode ? undefined : body.depositToPhone,
    depositToMethod: homeConfirmMode ? undefined : body.depositToMethod,
    orderTotalDelta: homeConfirmMode ? undefined : body.orderTotalDelta,
    salesOrderNumber: homeConfirmMode ? undefined : body.salesOrderNumber,
    postCancel: homeConfirmMode ? undefined : body.postCancel,
    followUp: homeConfirmMode ? undefined : body.followUp,
    sheetDayChoice: homeConfirmMode ? undefined : body.sheetDayChoice,
    canEditSavedInfo: viewer.isAdmin || Boolean(session.user.csIsAdmin),
    homeConfirmMode,
  });

  if (!result.ok) {
    const needsSheetDayChoice = "needsSheetDayChoice" in result && result.needsSheetDayChoice;
    return NextResponse.json(
      {
        message: result.message,
        missing: result.missing,
        needsSheetDayChoice: needsSheetDayChoice || undefined,
        closedDayYmd: "closedDayYmd" in result ? result.closedDayYmd : undefined,
        closedDayLabel: "closedDayLabel" in result ? result.closedDayLabel : undefined,
      },
      { status: needsSheetDayChoice ? 409 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    bostaMessage: "bostaMessage" in result ? result.bostaMessage : null,
    trackingNumber: "trackingNumber" in result ? result.trackingNumber : undefined,
    bostaStatus: "bostaStatus" in result ? result.bostaStatus : undefined,
    bostaStatusLabel: "bostaStatusLabel" in result ? result.bostaStatusLabel : undefined,
    bostaShippingFee: "bostaShippingFee" in result ? result.bostaShippingFee : undefined,
    bostaSyncedAt: "bostaSyncedAt" in result ? result.bostaSyncedAt : undefined,
    bostaSyncError: "bostaSyncError" in result ? result.bostaSyncError : undefined,
    cod: "cod" in result ? result.cod : undefined,
    lastEvent: "lastEvent" in result ? result.lastEvent : undefined,
  });
}
