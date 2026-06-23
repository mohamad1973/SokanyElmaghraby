import { NextResponse } from "next/server";

import { clearCustomerSession } from "@/lib/customer-account";

export async function POST() {
  await clearCustomerSession();

  return NextResponse.json({ ok: true });
}
