import { NextResponse } from "next/server";

import { getCsConfirmation, startCsConfirmation } from "@/lib/cs/confirmations";
import { isHomeConfirmOnlyAgent } from "@/lib/cs/home-confirm";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  if (await isHomeConfirmOnlyAgent(session.user.csAgentId)) {
    const confirmation = await getCsConfirmation(numericId);
    if (!confirmation || confirmation.assignedAgentId !== session.user.csAgentId) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }
  }

  const result = await startCsConfirmation(numericId, session.user.csAgentId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, confirmation: result.confirmation });
}
