import { NextResponse } from "next/server";

import { getBostaCityOptions } from "@/lib/shipping/bosta-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getBostaCityOptions();

  if (!result.ok) {
    return NextResponse.json({ message: result.message, cities: [] }, { status: 502 });
  }

  return NextResponse.json({ cities: result.cities });
}
