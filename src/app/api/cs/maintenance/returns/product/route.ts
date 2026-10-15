import { NextResponse } from "next/server";

import { saveBostaReturnProduct } from "@/lib/cs/bosta-return-product";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenance) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    trackingNumber?: string;
    productId?: number;
    productName?: string;
    productCode?: string;
  } | null;
  const result = await saveBostaReturnProduct({
    trackingNumber: String(body?.trackingNumber || ""),
    productId: Number(body?.productId),
    productName: String(body?.productName || ""),
    productCode: String(body?.productCode || ""),
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ product: result.product });
}
