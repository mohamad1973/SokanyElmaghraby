import { NextResponse } from "next/server";

import { getProductDisplayCode } from "@/lib/product-display-code";
import { getThemeSettings } from "@/lib/theme-settings";
import { searchProducts } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const [products, settings] = await Promise.all([searchProducts(query, 8), getThemeSettings()]);
  const codeMode = settings.productCard.codeMode;

  return NextResponse.json({
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      displayCode: getProductDisplayCode(product, codeMode),
      price: product.price,
      image: product.image,
      stockStatus: product.stockStatus,
      stockQuantity: product.stockQuantity,
    })),
  });
}
