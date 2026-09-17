import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import {
  applyCampaignDecision,
  GB_CAMPAIGN_DECISION,
  type CampaignDurationInput,
  type GbCampaignDecisionAction,
} from "@/lib/group-buy/campaign-decision";

type Body = {
  action?: GbCampaignDecisionAction;
  days?: number;
  hours?: number;
  minutes?: number;
};

const ALLOWED = new Set<string>(Object.values(GB_CAMPAIGN_DECISION));

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ message: "DATABASE_URL غير مضبوط." }, { status: 503 });
  }

  const { id } = await context.params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* empty */
  }

  if (!body.action || !ALLOWED.has(body.action)) {
    return NextResponse.json(
      { message: "الإجراء يجب أن يكون EXTEND أو EXECUTE أو CANCEL." },
      { status: 400 },
    );
  }

  const duration: CampaignDurationInput | undefined =
    body.action === GB_CAMPAIGN_DECISION.EXTEND
      ? { days: body.days, hours: body.hours, minutes: body.minutes }
      : undefined;

  const result = await applyCampaignDecision(id, body.action, duration);
  if (!result.ok) {
    return NextResponse.json({ message: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
