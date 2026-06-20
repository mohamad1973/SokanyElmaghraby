import "server-only";

import { getPrismaClient, isDatabaseConfigured } from "./db";
import { getWordPressCategoryTree } from "./menu";
import type { ManagedCategoryNode, WooCategoryNode } from "./types";

type CategorySetting = {
  categoryId: number;
  slug: string;
  isVisible: boolean;
  isTrashed: boolean;
  sortOrder: number;
};

export type CategoryMenuSettingsStatus = {
  databaseConfigured: boolean;
  settingsAvailable: boolean;
  error?: string;
};

export type CategoryMenuSettingsResult = {
  categories: ManagedCategoryNode[];
  trashedCategories: ManagedCategoryNode[];
  status: CategoryMenuSettingsStatus;
};

function flattenCategories(categories: ManagedCategoryNode[]): ManagedCategoryNode[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

function applySettings(
  categories: WooCategoryNode[],
  settingsByCategoryId: Map<number, CategorySetting>,
): ManagedCategoryNode[] {
  return categories
    .map((category, index) => {
      const setting = settingsByCategoryId.get(category.id);

      return {
        ...category,
        isVisible: setting?.isVisible ?? true,
        isTrashed: setting?.isTrashed ?? false,
        sortOrder: setting?.sortOrder ?? index,
        children: applySettings(category.children, settingsByCategoryId),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ar"));
}

function filterVisibleCategories(categories: ManagedCategoryNode[]): ManagedCategoryNode[] {
  return categories
    .filter((category) => category.isVisible && !category.isTrashed)
    .map((category) => ({
      ...category,
      children: filterVisibleCategories(category.children),
    }));
}

function filterActiveCategories(categories: ManagedCategoryNode[]): ManagedCategoryNode[] {
  return categories
    .filter((category) => !category.isTrashed)
    .map((category) => ({
      ...category,
      children: filterActiveCategories(category.children),
    }));
}

async function getSettingsMap(): Promise<{
  settings: Map<number, CategorySetting>;
  status: CategoryMenuSettingsStatus;
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
    const settings = await prisma.categoryMenuSetting.findMany();

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
        error: error instanceof Error ? error.message : "Failed to read menu settings.",
      },
    };
  }
}

export async function getManagedCategoryTree(): Promise<CategoryMenuSettingsResult> {
  const [categories, { settings, status }] = await Promise.all([
    getWordPressCategoryTree(),
    getSettingsMap(),
  ]);
  const managedCategories = applySettings(categories, settings);
  const flattened = flattenCategories(managedCategories);

  return {
    categories: filterActiveCategories(managedCategories),
    trashedCategories: flattened.filter((category) => category.isTrashed),
    status,
  };
}

export async function getVisibleCategoryTree() {
  const result = await getManagedCategoryTree();

  return filterVisibleCategories(result.categories);
}

export async function updateCategoryMenuSetting(
  category: Pick<WooCategoryNode, "id" | "slug">,
  data: Partial<Pick<CategorySetting, "isVisible" | "isTrashed" | "sortOrder">>,
) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return prisma.categoryMenuSetting.upsert({
    where: { categoryId: category.id },
    create: {
      categoryId: category.id,
      slug: category.slug,
      isVisible: data.isVisible ?? true,
      isTrashed: data.isTrashed ?? false,
      sortOrder: data.sortOrder ?? 0,
    },
    update: {
      slug: category.slug,
      ...data,
    },
  });
}
