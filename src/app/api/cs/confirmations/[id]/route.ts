import { NextResponse } from "next/server";

import { saveCsConfirmation, setCsShippingCompany, resolveCsViewer } from "@/lib/cs/confirmations";
import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

type Body = {
  answers?: CsChecklistAnswerInput[];
  finalize?: boolean;
  failContact?: boolean;
  cancelOrder?: boolean;
  failReason?: string;
  shippingCompany?: "bosta" | "sayed_temima" | "" | null;
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

  // Supervisor-only quick update for shipping company from the queue
  if (
    body.shippingCompany !== undefined &&
    !body.answers &&
    !body.finalize &&
    !body.failContact &&
    !body.cancelOrder &&
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
    followUp: body.followUp,
  });

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message, missing: result.missing },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, status: result.status });
}
