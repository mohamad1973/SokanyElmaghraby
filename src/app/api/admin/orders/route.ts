import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAdminOrders } from "@/lib/orders";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  return NextResponse.json(
    await getAdminOrders({
      page: searchParams.get("page") || "1",
      perPage: searchParams.get("per_page") || "50",
      status: searchParams.get("status") || "all",
      search: searchParams.get("search") || "",
    }),
  );
}

