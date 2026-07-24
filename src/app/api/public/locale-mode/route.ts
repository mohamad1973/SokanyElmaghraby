import { NextResponse } from "next/server";

import { getThemeSettings } from "@/lib/theme-settings";

export const revalidate = 30;

export async function GET() {
  const settings = await getThemeSettings();
  const mode = settings.localeMode === "ar-only" ? "ar-only" : "bilingual";

  return NextResponse.json(
    { mode },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
