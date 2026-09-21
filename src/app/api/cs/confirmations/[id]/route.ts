import { NextResponse } from "next/server";

import { saveCsConfirmation } from "@/lib/cs/confirmations";
import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

type Body = {
  answers?: CsChecklistAnswerInput[];
  finalize?: boolean;
  failContact?: boolean;
  failReason?: string;
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

  const result = await saveCsConfirmation({
    id: numericId,
    agentId: session.user.csAgentId,
    answers: body.answers || [],
    finalize: Boolean(body.finalize),
    failContact: Boolean(body.failContact),
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
