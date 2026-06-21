import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { updateCategoryMenuSelection } from "@/lib/category-menu-selection";

type RouteContext = {
  params: Promise<{
    categoryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { categoryId } = await context.params;
  const numericCategoryId = Number(categoryId);
  const payload = (await request.json()) as {
    slug?: string;
    showInMenu?: boolean;
  };

  if (!Number.isInteger(numericCategoryId) || !payload.slug) {
    return NextResponse.json({ message: "Invalid category payload." }, { status: 400 });
  }

  if (typeof payload.showInMenu !== "boolean") {
    return NextResponse.json({ message: "Menu selection value is required." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await updateCategoryMenuSelection(
        {
          id: numericCategoryId,
          slug: payload.slug,
        },
        payload.showInMenu,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to update menu selection.",
      },
      { status: 500 },
    );
  }
}
