import { NextResponse } from "next/server";

import { getDriverReports } from "@/lib/dispatch/drivers";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = new Date();
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toParam ? new Date(toParam) : now;

  const reports = await getDriverReports(from, to);
  return NextResponse.json({ reports, from: from.toISOString(), to: to.toISOString() });
}
