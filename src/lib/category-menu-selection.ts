import "server-only";

import { getPrismaClient, isDatabaseConfigured } from "./db";
import type { Category, CategoryMenuSelectionNode, WooCategoryNode } from "./types";

type MenuSelectionSetting = {
  categoryId: number;
  slug: string;
  showInMenu: boolean;
};

export type MenuSelectionStatus = {
  databaseConfigured: boolean;
  settingsAvailable: boolean;
  error?: string;
};

export type CategoryMenuSelectionResult = {
  categories: CategoryMenuSelectionNode[];
  status: MenuSelectionStatus;
};

async function ensureMenuSelectionTable(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CategoryMenuSelection\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`categoryId\` INT NOT NULL,
      \`slug\` VARCHAR(191) NOT NULL,
      \`showInMenu\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`CategoryMenuSelection_categoryId_key\`(\`categoryId\`),
      INDEX \`CategoryMenuSelection_slug_idx\`(\`slug\`),
      INDEX \`CategoryMenuSelection_showInMenu_idx\`(\`showInMenu\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

function applySettingsToTree(
  categories: WooCategoryNode[],
  settingsByCategoryId: Map<number, MenuSelectionSetting>,
): CategoryMenuSelectionNode[] {
  return categories.map((category) => {
    const setting = settingsByCategoryId.get(category.id);

    return {
      ...category,
      showInMenu: setting?.showInMenu ?? false,
      children: applySettingsToTree(category.children, settingsByCategoryId),
    };
  });
}

function hasSelectedDescendant(category: CategoryMenuSelectionNode): boolean {
  return category.children.some((child) => child.showInMenu || hasSelectedDescendant(child));
}

function filterMenuTree(categories: CategoryMenuSelectionNode[]): CategoryMenuSelectionNode[] {
  return categories
    .filter((category) => category.showInMenu || hasSelectedDescendant(category))
    .map((category) => ({
      ...category,
      children: filterMenuTree(category.children),
    }));
}

async function getSelectionSettingsMap(): Promise<{
  settings: Map<number, MenuSelectionSetting>;
  status: MenuSelectionStatus;
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
    await ensureMenuSelectionTable(prisma);

    const settings = await prisma.categoryMenuSelection.findMany();

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
        error: error instanceof Error ? error.message : "Failed to read menu selections.",
      },
    };
  }
}

export async function getCategoriesWithMenuSelection(
  categories: WooCategoryNode[],
): Promise<CategoryMenuSelectionResult> {
  const { settings, status } = await getSelectionSettingsMap();

  return {
    categories: applySettingsToTree(categories, settings),
    status,
  };
}

export async function getSelectedMenuCategories(categories: WooCategoryNode[]) {
  const result = await getCategoriesWithMenuSelection(categories);

  if (!result.status.settingsAvailable) {
    return categories;
  }

  return filterMenuTree(result.categories);
}

export async function filterSelectedCategoryList(categories: Category[]): Promise<Category[]> {
  const { settings, status } = await getSelectionSettingsMap();

  if (!status.settingsAvailable) {
    return categories;
  }

  return categories.filter((category) => settings.get(category.id)?.showInMenu === true);
}

export async function updateCategoryMenuSelection(
  category: Pick<WooCategoryNode, "id" | "slug">,
  showInMenu: boolean,
) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureMenuSelectionTable(prisma);

  return prisma.categoryMenuSelection.upsert({
    where: { categoryId: category.id },
    create: {
      categoryId: category.id,
      slug: category.slug,
      showInMenu,
    },
    update: {
      slug: category.slug,
      showInMenu,
    },
  });
}
