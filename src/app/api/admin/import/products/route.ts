import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { importProductsFromWordPress } from "@/lib/admin-imports";
import { authOptions } from "@/lib/auth";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await importProductsFromWordPress());
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to import products.",
      },
      { status: 500 },
    );
  }
}
