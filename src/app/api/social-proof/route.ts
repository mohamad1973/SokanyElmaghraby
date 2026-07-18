import { NextResponse } from "next/server";

import {
  listSocialProofCatalogProducts,
  listSocialProofEvents,
} from "@/lib/social-proof";

export const dynamic = "force-dynamic";

export async function GET() {
  const [events, products] = await Promise.all([
    listSocialProofEvents(10),
    listSocialProofCatalogProducts(24),
  ]);

  return NextResponse.json({
    events,
    products,
  });
}
