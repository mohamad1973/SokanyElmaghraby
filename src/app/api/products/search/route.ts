import { NextResponse } from "next/server";

import { searchProducts } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const products = await searchProducts(query, 8);

  return NextResponse.json({
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      price: product.price,
      image: product.image,
    })),
  });
}
