import { NextResponse } from "next/server";

import {
  getReorderProducts,
  updateProductReorderThreshold,
  type StockStatusFilter,
} from "@/lib/reorder-report";
import { requireAdminSession } from "@/lib/session-guards";

function parseStockStatus(value: string | null): StockStatusFilter | undefined {
  if (value === "instock" || value === "outofstock") {
    return value;
  }

  return undefined;
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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
    const message = error instanceof Error ? error.message : "تعذر جلب تقرير حد الطلب.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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
