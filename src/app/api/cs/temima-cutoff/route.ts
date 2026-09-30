import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listTemimaCutoffs, lockTemimaCutoff } from "@/lib/cs/temima-cutoff";
import { captureTemimaSheetFreeze } from "@/lib/cs/temima-sheet-edits";
import { requireCsSession } from "@/lib/session-guards";

async function viewerOrNull() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isSupervisor && !viewer.isAdmin) return null;
  if (viewer.isCourierSupervisor && !viewer.isAdmin && !viewer.isSupervisor) return null;
  return viewer;
}

export async function GET() {
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const cutoffs = await listTemimaCutoffs();
  return NextResponse.json({ cutoffs });
}

export async function POST(request: Request) {
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { now?: boolean; minutes?: number } | null;
  if (!body || (!body.now && !Number.isInteger(body.minutes))) {
    return NextResponse.json({ message: "الساعة غير صحيحة." }, { status: 400 });
  }
  const result = body.now ? await lockTemimaCutoff() : await lockTemimaCutoff(body.minutes);
  if (result.ok && !result.frozen) await captureTemimaSheetFreeze(result.dayYmd);
  return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
}
