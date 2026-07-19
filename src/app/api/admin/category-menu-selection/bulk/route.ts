import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { bulkUpdateCategoryMenuSelection } from "@/lib/category-menu-selection";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    items?: Array<{
      id: number;
      slug: string;
      showInMenu?: boolean;
      sortOrder?: number;
      parentOverride?: number | null;
      iconUrl?: string | null;
      clearIcon?: boolean;
    }>;
  };

  if (!Array.isArray(payload.items) || !payload.items.length) {
    return NextResponse.json({ message: "Invalid bulk payload." }, { status: 400 });
  }

  const items = payload.items.filter(
    (item) => Number.isInteger(item.id) && typeof item.slug === "string" && item.slug.length > 0,
  );

  if (!items.length) {
    return NextResponse.json({ message: "Invalid bulk payload." }, { status: 400 });
  }

  try {
    return NextResponse.json(await bulkUpdateCategoryMenuSelection(items));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to bulk update menu selection.",
      },
      { status: 500 },
    );
  }
}
