import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { saveMenuStructure, type MenuStructureItem } from "@/lib/category-menu-selection";

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as { items?: MenuStructureItem[] };

  if (!Array.isArray(payload.items) || !payload.items.length) {
    return NextResponse.json({ message: "Invalid structure payload." }, { status: 400 });
  }

  const items = payload.items.filter(
    (item) =>
      Number.isInteger(item.id) &&
      typeof item.slug === "string" &&
      item.slug.length > 0 &&
      Number.isInteger(item.parentOverride) &&
      Number.isFinite(item.sortOrder),
  );

  if (!items.length) {
    return NextResponse.json({ message: "Invalid structure payload." }, { status: 400 });
  }

  try {
    return NextResponse.json(await saveMenuStructure(items));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to save menu structure.",
      },
      { status: 500 },
    );
  }
}
