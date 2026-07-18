import { NextResponse } from "next/server";

import { getBostaDistrictOptions } from "@/lib/shipping/bosta-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cityId = searchParams.get("cityId")?.trim() || "";

  if (!cityId) {
    return NextResponse.json({ message: "cityId مطلوب.", districts: [] }, { status: 400 });
  }

  const result = await getBostaDistrictOptions(cityId);

  if (!result.ok) {
    return NextResponse.json({ message: result.message, districts: [] }, { status: 502 });
  }

  return NextResponse.json({ districts: result.districts });
}
