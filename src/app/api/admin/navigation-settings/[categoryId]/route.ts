import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { updateCategoryMenuSetting } from "@/lib/category-menu-settings";

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
    isVisible?: boolean;
    isTrashed?: boolean;
    sortOrder?: number;
  };

  if (!Number.isInteger(numericCategoryId) || !payload.slug) {
    return NextResponse.json({ message: "Invalid category payload." }, { status: 400 });
  }

  try {
    const setting = await updateCategoryMenuSetting(
      {
        id: numericCategoryId,
        slug: payload.slug,
      },
      {
        isVisible: payload.isVisible,
        isTrashed: payload.isTrashed,
        sortOrder: payload.sortOrder,
      },
    );

    return NextResponse.json(setting);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to update navigation setting.",
      },
      { status: 500 },
    );
  }
}
