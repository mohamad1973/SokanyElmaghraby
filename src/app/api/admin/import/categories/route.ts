import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { importCategoriesFromWordPress } from "@/lib/admin-imports";
import { authOptions } from "@/lib/auth";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await importCategoriesFromWordPress());
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to import categories.",
      },
      { status: 500 },
    );
  }
}
