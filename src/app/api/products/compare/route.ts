import { NextResponse } from "next/server";

import { getProductsByIds } from "@/lib/woocommerce";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, 4);

  if (!ids.length) {
    return NextResponse.json({ products: [] });
  }

  const products = await getProductsByIds(ids);

  return NextResponse.json({ products });
}
