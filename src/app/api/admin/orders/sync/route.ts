import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { syncOrdersFromWooCommerce } from "@/lib/orders";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await syncOrdersFromWooCommerce();

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
