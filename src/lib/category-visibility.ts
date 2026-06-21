import "server-only";

import { getPrismaClient, isDatabaseConfigured } from "./db";
import type { Category, CategoryVisibilityNode, WooCategoryNode } from "./types";

type VisibilitySetting = {
  categoryId: number;
  slug: string;
  isVisibleOnFrontend: boolean;
};

export type VisibilitySettingsStatus = {
  databaseConfigured: boolean;
  settingsAvailable: boolean;
  error?: string;
};

export type CategoryVisibilityResult = {
  categories: CategoryVisibilityNode[];
  status: VisibilitySettingsStatus;
};

function applySettingsToTree(
  categories: WooCategoryNode[],
  settingsByCategoryId: Map<number, VisibilitySetting>,
): CategoryVisibilityNode[] {
  return categories.map((category) => {
    const setting = settingsByCategoryId.get(category.id);

    return {
      ...category,
      isVisibleOnFrontend: setting?.isVisibleOnFrontend ?? true,
      children: applySettingsToTree(category.children, settingsByCategoryId),
    };
  });
}

function filterVisibleTree(categories: CategoryVisibilityNode[]): CategoryVisibilityNode[] {
  return categories
    .filter((category) => category.isVisibleOnFrontend)
    .map((category) => ({
      ...category,
      children: filterVisibleTree(category.children),
    }));
}

async function getVisibilitySettingsMap(): Promise<{
  settings: Map<number, VisibilitySetting>;
  status: VisibilitySettingsStatus;
}> {
  if (!isDatabaseConfigured()) {
    return {
      settings: new Map(),
      status: {
        databaseConfigured: false,
        settingsAvailable: false,
        error: "DATABASE_URL is not configured.",
      },
    };
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      settings: new Map(),
      status: {
        databaseConfigured: false,
        settingsAvailable: false,
        error: "Database client is not available.",
      },
    };
  }

  try {
    const settings = await prisma.categoryVisibilitySetting.findMany();

    return {
      settings: new Map(settings.map((setting) => [setting.categoryId, setting])),
      status: {
        databaseConfigured: true,
        settingsAvailable: true,
      },
    };
  } catch (error) {
    return {
      settings: new Map(),
      status: {
        databaseConfigured: true,
        settingsAvailable: false,
        error: error instanceof Error ? error.message : "Failed to read visibility settings.",
      },
    };
  }
}

export async function getCategoriesWithVisibility(
  categories: WooCategoryNode[],
): Promise<CategoryVisibilityResult> {
  const { settings, status } = await getVisibilitySettingsMap();

  return {
    categories: applySettingsToTree(categories, settings),
    status,
  };
}

export async function getVisibleFrontendCategories(categories: WooCategoryNode[]) {
  const result = await getCategoriesWithVisibility(categories);

  return filterVisibleTree(result.categories);
}

export async function filterVisibleCategoryList(categories: Category[]): Promise<Category[]> {
  const { settings, status } = await getVisibilitySettingsMap();

  if (!status.settingsAvailable) {
    return categories;
  }

  return categories.filter((category) => settings.get(category.id)?.isVisibleOnFrontend !== false);
}

export async function updateCategoryVisibility(
  category: Pick<WooCategoryNode, "id" | "slug">,
  isVisibleOnFrontend: boolean,
) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return prisma.categoryVisibilitySetting.upsert({
    where: { categoryId: category.id },
    create: {
      categoryId: category.id,
      slug: category.slug,
      isVisibleOnFrontend,
    },
    update: {
      slug: category.slug,
      isVisibleOnFrontend,
    },
  });
}
