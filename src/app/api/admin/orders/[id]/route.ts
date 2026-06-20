import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAdminOrder } from "@/lib/orders";

type OrderRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: OrderRouteProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const order = await getAdminOrder(id);

  if (!order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}

