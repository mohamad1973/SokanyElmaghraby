import { NextResponse } from "next/server";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  getReorderProducts,
  updateProductReorderThreshold,
  type StockStatusFilter,
} from "@/lib/reorder-report";
import { requireCsSession } from "@/lib/session-guards";

async function requireTransfersAccess() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) return null;
  return session;
}

function parseStockStatus(value: string | null): StockStatusFilter | undefined {
  if (value === "instock" || value === "outofstock") return value;
  return undefined;
}

export async function GET(request: Request) {
  const session = await requireTransfersAccess();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const lowOnly = searchParams.get("lowOnly") === "1" || searchParams.get("lowOnly") === "true";
  const search = searchParams.get("search") || undefined;
  const categoryRaw = searchParams.get("categoryId");
  const categoryId = categoryRaw ? Number(categoryRaw) : undefined;
  const stockStatus = parseStockStatus(searchParams.get("stockStatus"));

  try {
    const result = await getReorderProducts({
      lowOnly,
      search,
      categoryId:
        categoryId !== undefined && Number.isFinite(categoryId) && categoryId > 0
          ? categoryId
          : undefined,
      stockStatus,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر جلب تقرير المخزون.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireTransfersAccess();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | { productId?: number; threshold?: number }
    | null;

  const productId = Number(body?.productId);
  const threshold = Number(body?.threshold);

  if (!Number.isFinite(productId) || productId < 1) {
    return NextResponse.json({ message: "معرّف المنتج مطلوب." }, { status: 400 });
  }

  if (!Number.isFinite(threshold) || threshold < 0) {
    return NextResponse.json({ message: "حد الطلب يجب أن يكون صفراً أو أكثر." }, { status: 400 });
  }

  const result = await updateProductReorderThreshold(productId, threshold);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 502 });
  }

  return NextResponse.json({ product: result.product });
}
