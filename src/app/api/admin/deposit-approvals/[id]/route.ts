import { NextResponse } from "next/server";

import { decideDepositApproval, getDepositApprovalById } from "@/lib/cs/deposit-approvals";
import { requireAdminSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  const item = await getDepositApprovalById(numericId);
  if (!item) {
    return NextResponse.json({ message: "غير موجود." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function POST(request: Request, context: Context) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  let body: { decision?: string } = {};
  try {
    body = (await request.json()) as { decision?: string };
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json({ message: "قرار غير صالح." }, { status: 400 });
  }

  const result = await decideDepositApproval({ id: numericId, decision: body.decision });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
