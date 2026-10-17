import { NextResponse } from "next/server";

import { bostaBoardRange, listBostaBoard, saveBostaBoardRow } from "@/lib/cs/bosta-board";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

async function boardAccess() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return { error: NextResponse.json({ message: "غير مصرح." }, { status: 401 }) };
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const allowed = viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor);
  if (!allowed) return { error: NextResponse.json({ message: "غير مصرح." }, { status: 403 }) };
  return { session, viewer };
}

export async function GET(request: Request) {
  const access = await boardAccess();
  if ("error" in access) return access.error;
  const url = new URL(request.url);
  const range = bostaBoardRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
  const rows = await listBostaBoard(range.from, range.to);
  return NextResponse.json({ from: range.from, to: range.to, rows });
}

export async function POST(request: Request) {
  const access = await boardAccess();
  if ("error" in access) return access.error;
  const body = (await request.json().catch(() => null)) as { confirmationId?: number } | null;
  const result = await saveBostaBoardRow(Number(body?.confirmationId), access.session.user.csAgentId!);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json(result);
}
