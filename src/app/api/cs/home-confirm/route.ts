import { NextResponse } from "next/server";

import {
  drainUnassignedHomeConfirmPending,
  listHomeConfirmShifts,
  saveHomeConfirmShifts,
  stampHomeConfirmRange,
} from "@/lib/cs/home-confirm";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

async function requireSupervisor() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isSupervisor && !session.user.csIsSupervisor) return null;
  return session;
}

export async function GET() {
  const session = await requireSupervisor();
  if (!session) return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });
  const data = await listHomeConfirmShifts();
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(request: Request) {
  const session = await requireSupervisor();
  if (!session) return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });

  let body: {
    mode?: "shifts" | "range";
    shifts?: Array<{ agentId?: number; isAvailable?: boolean; startHm?: string; endHm?: string }>;
    agentId?: number;
    from?: number;
    to?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  if (body.mode === "range") {
    const result = await stampHomeConfirmRange({
      agentId: Number(body.agentId),
      from: Number(body.from),
      to: Number(body.to),
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true, stamped: result.stamped });
  }

  const result = await saveHomeConfirmShifts(
    (body.shifts || [])
      .filter((row) => Number(row.agentId) > 0)
      .map((row) => ({
        agentId: Number(row.agentId),
        isAvailable: Boolean(row.isAvailable),
        startHm: row.startHm,
        endHm: row.endHm,
      })),
  );
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  try {
    await drainUnassignedHomeConfirmPending();
  } catch (error) {
    console.error("[cs] home-confirm drain after shift save failed", error);
  }
  const data = await listHomeConfirmShifts();
  return NextResponse.json({ ok: true, ...data });
}
