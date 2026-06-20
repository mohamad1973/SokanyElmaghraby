import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getThemeSettings, updateThemeSettings, type ThemeSettings } from "@/lib/theme-settings";

async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return false;
  }

  return true;
}

export async function GET() {
  if (!(await requireSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getThemeSettings());
}

export async function POST(request: Request) {
  if (!(await requireSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const settings = (await request.json()) as ThemeSettings;

  try {
    return NextResponse.json(await updateThemeSettings(settings));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to update settings.",
      },
      { status: 500 },
    );
  }
}

