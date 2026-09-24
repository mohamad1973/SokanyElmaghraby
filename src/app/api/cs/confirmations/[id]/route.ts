import { NextResponse } from "next/server";

import { saveCsConfirmation, setCsInvoiceNumber, setCsShippingCompany, resolveCsViewer } from "@/lib/cs/confirmations";
import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
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
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  shippingCompany?: "bosta" | "sayed_temima" | "" | null;
  salesOrderNumber?: string | null;
  invoiceNumber?: string | null;
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
};

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
    body.depositToPhone === undefined &&
    body.depositToMethod === undefined &&
    body.salesOrderNumber === undefined &&
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
    return NextResponse.json({ ok: true, invoiceNumber: result.invoiceNumber });
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
    body.depositToPhone === undefined &&
    body.depositToMethod === undefined &&
    body.salesOrderNumber === undefined &&
    body.invoiceNumber === undefined &&
    !body.postCancel &&
    !body.followUp
  ) {
    const viewer = await resolveCsViewer(session.user.csAgentId);
    if (!viewer.isSupervisor && !session.user.csIsSupervisor) {
      return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });
    }
    const company =
      body.shippingCompany === "bosta" || body.shippingCompany === "sayed_temima"
        ? body.shippingCompany
        : null;
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

  const result = await saveCsConfirmation({
    id: numericId,
    agentId: session.user.csAgentId,
    answers: body.answers || [],
    finalize: Boolean(body.finalize),
    failContact: Boolean(body.failContact),
    cancelOrder: Boolean(body.cancelOrder),
    failReason: body.failReason,
    trackingNumber: body.trackingNumber,
    waybillPrinted: body.waybillPrinted,
    depositAmount: body.depositAmount,
    depositPaid: body.depositPaid,
    depositPayMethod: body.depositPayMethod,
    depositFromNumber: body.depositFromNumber,
    depositToPhone: body.depositToPhone,
    depositToMethod: body.depositToMethod,
    salesOrderNumber: body.salesOrderNumber,
    postCancel: body.postCancel,
    followUp: body.followUp,
  });

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message, missing: result.missing },
      { status: 400 },
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
  });
}
