import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { deleteMediaAsset } from "@/lib/admin-media";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ message: "Invalid media id." }, { status: 400 });
  }

  const deleted = await deleteMediaAsset(numericId);

  if (!deleted) {
    return NextResponse.json({ message: "الملف غير موجود أو سبق حذفه." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
