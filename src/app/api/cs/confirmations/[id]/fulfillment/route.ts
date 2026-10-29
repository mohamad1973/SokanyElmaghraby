import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  createFulfillmentFromOrder,
  listFulfillmentChildren,
  type FulfillmentCarrier,
  type FulfillmentKind,
  type FulfillmentLine,
} from "@/lib/cs/fulfillment-return";
import { listMonaCourierAgents, monaCourierBucketFromName } from "@/lib/cs/mona-courier";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

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

  const items = await listFulfillmentChildren(numericId);
  const couriers = (await listMonaCourierAgents()).map((agent) => ({
    id: agent.id,
    name: agent.name,
    bucket: monaCourierBucketFromName(agent.name),
  }));
  return NextResponse.json({ items, couriers });
}

export async function POST(request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  await resolveCsViewer(session.user.csAgentId);

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  let body: {
    kind?: string;
    desk?: string;
    monaCourierId?: number | null;
    collectAmount?: number | string | null;
    outbound?: FulfillmentLine | null;
    returning?: FulfillmentLine | null;
    phone?: string | null;
    address?: string | null;
    governorate?: string | null;
    area?: string | null;
    customerName?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const kind: FulfillmentKind | null =
    body.kind === "return" || body.kind === "exchange" ? body.kind : null;
  const desk: FulfillmentCarrier | null =
    body.desk === "sayed_temima" || body.desk === "eid" || body.desk === "momen" || body.desk === "bosta"
      ? body.desk
      : null;
  if (!kind || !desk) {
    return NextResponse.json({ message: "اختَر نوع العملية والحساب." }, { status: 400 });
  }

  const result = await createFulfillmentFromOrder({
    parentId: numericId,
    agentId: session.user.csAgentId,
    kind,
    desk,
    allowAnyParent: true,
    monaCourierId: body.monaCourierId ?? null,
    collectAmount: body.collectAmount,
    outbound: body.outbound,
    returning: body.returning,
    phone: body.phone,
    address: body.address,
    governorate: body.governorate,
    area: body.area,
    customerName: body.customerName,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        message: result.message,
        confirmationId: "confirmationId" in result ? result.confirmationId : undefined,
        wooOrderNumber: "wooOrderNumber" in result ? result.wooOrderNumber : undefined,
        kind: "kind" in result ? result.kind : undefined,
        desk: "desk" in result ? result.desk : undefined,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(result);
}
