import { NextResponse } from "next/server";

import { getCustomerSession } from "@/lib/customer-account";

export async function GET() {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ customer: null }, { status: 401 });
  }

  return NextResponse.json({ customer: session });
}
