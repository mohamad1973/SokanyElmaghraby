import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { swapCategorySortOrder, updateCategoryMenuSelection } from "@/lib/category-menu-selection";
import { getWordPressCategoryTree } from "@/lib/menu";

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
    sortOrder?: number;
    parentOverride?: number | null;
    iconUrl?: string | null;
    clearIcon?: boolean;
    menuTitle?: string | null;
    clearMenuTitle?: boolean;
    move?: "up" | "down";
  };

  if (!Number.isInteger(numericCategoryId)) {
    return NextResponse.json({ message: "Invalid category payload." }, { status: 400 });
  }

  try {
    if (payload.move === "up" || payload.move === "down") {
      const wooTree = await getWordPressCategoryTree();
      return NextResponse.json(await swapCategorySortOrder(numericCategoryId, payload.move, wooTree));
    }

    if (!payload.slug) {
      return NextResponse.json({ message: "Invalid category payload." }, { status: 400 });
    }

    return NextResponse.json(
      await updateCategoryMenuSelection(
        {
          id: numericCategoryId,
          slug: payload.slug,
        },
        {
          slug: payload.slug,
          showInMenu: payload.showInMenu,
          sortOrder: payload.sortOrder,
          parentOverride: payload.parentOverride,
          iconUrl: payload.iconUrl,
          clearIcon: payload.clearIcon,
          menuTitle: payload.menuTitle,
          clearMenuTitle: payload.clearMenuTitle,
        },
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
