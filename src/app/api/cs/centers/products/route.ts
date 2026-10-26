import { NextResponse } from "next/server";

import { resolveScAccess } from "@/lib/cs/sc-centers";
import { getProductDisplayCode } from "@/lib/product-display-code";
import { requireCsSession } from "@/lib/session-guards";
import { getThemeSettings } from "@/lib/theme-settings";
import { searchProducts } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  const access = await resolveScAccess(session.user.csAgentId);
  if (!access.canDesk && !access.canOpen) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const query = new URL(request.url).searchParams.get("q") || "";
  const [products, settings] = await Promise.all([searchProducts(query, 8), getThemeSettings()]);
  const codeMode = settings.productCard.codeMode;
  return NextResponse.json({
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      displayCode: getProductDisplayCode(product, codeMode),
      image: product.image,
    })),
  });
}
