import "server-only";

import { getPrismaClient, isDatabaseConfigured } from "./db";
import type { Category, CategoryMenuSelectionNode, WooCategoryNode } from "./types";

export type MenuSelectionSetting = {
  categoryId: number;
  slug: string;
  showInMenu: boolean;
  sortOrder: number;
  parentOverride: number | null;
  iconUrl: string | null;
  menuTitle: string | null;
};

export type CategoryMenuUpdateInput = {
  slug: string;
  showInMenu?: boolean;
  sortOrder?: number;
  parentOverride?: number | null;
  iconUrl?: string | null;
  clearIcon?: boolean;
  menuTitle?: string | null;
  clearMenuTitle?: boolean;
};

export type MenuSelectionStatus = {
  databaseConfigured: boolean;
  settingsAvailable: boolean;
  error?: string;
};

export type CategoryMenuSelectionResult = {
  categories: CategoryMenuSelectionNode[];
  flatCategories: CategoryMenuSelectionNode[];
  status: MenuSelectionStatus;
};

async function ensureMenuSelectionTable(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CategoryMenuSelection\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`categoryId\` INT NOT NULL,
      \`slug\` VARCHAR(191) NOT NULL,
      \`showInMenu\` BOOLEAN NOT NULL DEFAULT false,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`parentOverride\` INT NULL,
      \`iconUrl\` VARCHAR(500) NULL,
      \`menuTitle\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`CategoryMenuSelection_categoryId_key\`(\`categoryId\`),
      INDEX \`CategoryMenuSelection_slug_idx\`(\`slug\`),
      INDEX \`CategoryMenuSelection_showInMenu_idx\`(\`showInMenu\`),
      INDEX \`CategoryMenuSelection_sortOrder_idx\`(\`sortOrder\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  const alterStatements = [
    "ALTER TABLE `CategoryMenuSelection` ADD COLUMN `sortOrder` INT NOT NULL DEFAULT 0",
    "ALTER TABLE `CategoryMenuSelection` ADD COLUMN `parentOverride` INT NULL",
    "ALTER TABLE `CategoryMenuSelection` ADD COLUMN `iconUrl` VARCHAR(500) NULL",
    "ALTER TABLE `CategoryMenuSelection` ADD COLUMN `menuTitle` VARCHAR(191) NULL",
  ];

  for (const statement of alterStatements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch {
      // Column already exists
    }
  }
}

function flattenWooTree(categories: WooCategoryNode[]): WooCategoryNode[] {
  const result: WooCategoryNode[] = [];

  function walk(nodes: WooCategoryNode[]) {
    for (const node of nodes) {
      result.push({
        ...node,
        children: [],
      });
      if (node.children.length) {
        walk(node.children);
      }
    }
  }

  walk(categories);
  return result;
}

function resolveEffectiveParent(wooParent: number, parentOverride: number | null): number {
  if (parentOverride === null) {
    return wooParent;
  }

  return parentOverride;
}

function wouldCreateCycle(
  categoryId: number,
  nextParentId: number,
  parentById: Map<number, number>,
): boolean {
  if (nextParentId === 0) {
    return false;
  }

  if (nextParentId === categoryId) {
    return true;
  }

  let current = nextParentId;
  const visited = new Set<number>();

  while (current > 0) {
    if (current === categoryId) {
      return true;
    }

    if (visited.has(current)) {
      break;
    }

    visited.add(current);
    current = parentById.get(current) ?? 0;
  }

  return false;
}

function rebuildMenuTree(
  flat: Array<
    WooCategoryNode & {
      showInMenu: boolean;
      sortOrder: number;
      parentOverride: number | null;
      menuTitle: string | null;
      effectiveParent: number;
    }
  >,
  parentId = 0,
): CategoryMenuSelectionNode[] {
  return flat
    .filter((category) => category.effectiveParent === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ar"))
    .map((category) => ({
      id: category.id,
      title: category.title,
      url: category.url,
      href: category.href,
      type: category.type,
      object: category.object,
      objectId: category.objectId,
      slug: category.slug,
      parent: category.effectiveParent,
      count: category.count,
      image: category.image,
      iconUrl: category.iconUrl,
      permalink: category.permalink,
      showInMenu: category.showInMenu,
      sortOrder: category.sortOrder,
      parentOverride: category.parentOverride,
      menuTitle: category.menuTitle,
      children: rebuildMenuTree(flat, category.id),
    }));
}

function applyOverridesToCategories(
  wooTree: WooCategoryNode[],
  settingsByCategoryId: Map<number, MenuSelectionSetting>,
): { tree: CategoryMenuSelectionNode[]; flat: CategoryMenuSelectionNode[] } {
  const flatWoo = flattenWooTree(wooTree);

  const withSettings = flatWoo.map((category, index) => {
    const setting = settingsByCategoryId.get(category.id);
    const parentOverride = setting?.parentOverride ?? null;
    const sortOrder = setting?.sortOrder ?? index * 10;

    return {
      ...category,
      iconUrl: setting?.iconUrl || undefined,
      showInMenu: setting?.showInMenu ?? false,
      sortOrder,
      parentOverride,
      menuTitle: setting?.menuTitle ?? null,
      effectiveParent: resolveEffectiveParent(category.parent, parentOverride),
    };
  });

  // Guard against cycles from bad overrides: fall back to woo parent
  const parentById = new Map(withSettings.map((item) => [item.id, item.effectiveParent]));

  for (const item of withSettings) {
    if (wouldCreateCycle(item.id, item.effectiveParent, parentById)) {
      item.effectiveParent = item.parent;
      item.parentOverride = null;
      parentById.set(item.id, item.parent);
    }
  }

  const tree = rebuildMenuTree(withSettings);
  const flat = flattenSelectionTree(tree);

  return { tree, flat };
}

function flattenSelectionTree(nodes: CategoryMenuSelectionNode[]): CategoryMenuSelectionNode[] {
  const result: CategoryMenuSelectionNode[] = [];

  function walk(list: CategoryMenuSelectionNode[]) {
    for (const node of list) {
      result.push({ ...node, children: [] });
      if (node.children.length) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return result;
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

function toMenuNodes(categories: CategoryMenuSelectionNode[]): CategoryMenuSelectionNode[] {
  return categories.map((category) => ({
    ...category,
    title: category.menuTitle?.trim() || category.title,
    children: toMenuNodes(category.children),
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
      settings: new Map(
        settings.map((setting) => [
          setting.categoryId,
          {
            categoryId: setting.categoryId,
            slug: setting.slug,
            showInMenu: setting.showInMenu,
            sortOrder: setting.sortOrder ?? 0,
            parentOverride: setting.parentOverride ?? null,
            iconUrl: setting.iconUrl ?? null,
            menuTitle: setting.menuTitle ?? null,
          },
        ]),
      ),
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

function wooTreeAsSelection(categories: WooCategoryNode[]): CategoryMenuSelectionNode[] {
  return categories.map((category, index) => ({
    ...category,
    showInMenu: false,
    sortOrder: index * 10,
    parentOverride: null,
    menuTitle: null,
    children: wooTreeAsSelection(category.children),
  }));
}

export async function getCategoriesWithMenuSelection(
  categories: WooCategoryNode[],
): Promise<CategoryMenuSelectionResult> {
  const { settings, status } = await getSelectionSettingsMap();

  if (!status.settingsAvailable) {
    const tree = wooTreeAsSelection(categories);
    return {
      categories: tree,
      flatCategories: flattenSelectionTree(tree),
      status,
    };
  }

  const { tree, flat } = applyOverridesToCategories(categories, settings);

  return {
    categories: tree,
    flatCategories: flat,
    status,
  };
}

export async function getSelectedMenuCategories(categories: WooCategoryNode[]) {
  const result = await getCategoriesWithMenuSelection(categories);

  if (!result.status.settingsAvailable) {
    return categories;
  }

  return toMenuNodes(filterMenuTree(result.categories));
}

export async function filterSelectedCategoryList(categories: Category[]): Promise<Category[]> {
  const { settings, status } = await getSelectionSettingsMap();

  if (!status.settingsAvailable) {
    return categories;
  }

  return categories.filter((category) => settings.get(category.id)?.showInMenu === true);
}

export async function bulkUpdateCategoryMenuSelection(
  items: Array<Pick<WooCategoryNode, "id" | "slug"> & CategoryMenuUpdateInput>,
) {
  const results = [];

  for (const item of items) {
    const { id, slug, ...input } = item;
    results.push(await updateCategoryMenuSelection({ id, slug }, { slug, ...input }));
  }

  return { ok: true as const, count: results.length, results };
}

export async function updateCategoryMenuSelection(
  category: Pick<WooCategoryNode, "id" | "slug">,
  input: CategoryMenuUpdateInput,
) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureMenuSelectionTable(prisma);

  const existing = await prisma.categoryMenuSelection.findUnique({
    where: { categoryId: category.id },
  });

  const showInMenu = typeof input.showInMenu === "boolean" ? input.showInMenu : (existing?.showInMenu ?? false);
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.floor(input.sortOrder)
      : (existing?.sortOrder ?? 0);

  let parentOverride: number | null =
    input.parentOverride === undefined ? (existing?.parentOverride ?? null) : input.parentOverride;

  if (parentOverride !== null && parentOverride === category.id) {
    parentOverride = null;
  }

  let iconUrl: string | null = existing?.iconUrl ?? null;
  if (input.clearIcon) {
    iconUrl = null;
  } else if (typeof input.iconUrl === "string") {
    iconUrl = input.iconUrl.trim() || null;
  }

  let menuTitle: string | null = existing?.menuTitle ?? null;
  if (input.clearMenuTitle) {
    menuTitle = null;
  } else if (typeof input.menuTitle === "string") {
    menuTitle = input.menuTitle.trim() || null;
  } else if (input.menuTitle === null) {
    menuTitle = null;
  }

  return prisma.categoryMenuSelection.upsert({
    where: { categoryId: category.id },
    create: {
      categoryId: category.id,
      slug: category.slug || input.slug,
      showInMenu,
      sortOrder,
      parentOverride,
      iconUrl,
      menuTitle,
    },
    update: {
      slug: category.slug || input.slug,
      showInMenu,
      sortOrder,
      parentOverride,
      iconUrl,
      menuTitle,
    },
  });
}

export type MenuStructureItem = {
  id: number;
  slug: string;
  parentOverride: number;
  sortOrder: number;
  showInMenu?: boolean;
  menuTitle?: string | null;
  iconUrl?: string | null;
};

export async function saveMenuStructure(items: MenuStructureItem[]) {
  const parentById = new Map(items.map((item) => [item.id, item.parentOverride]));

  for (const item of items) {
    let parentOverride = item.parentOverride;
    if (parentOverride === item.id || wouldCreateCycle(item.id, parentOverride, parentById)) {
      parentOverride = 0;
      parentById.set(item.id, 0);
    }

    await updateCategoryMenuSelection(
      { id: item.id, slug: item.slug },
      {
        slug: item.slug,
        showInMenu: item.showInMenu !== false,
        sortOrder: item.sortOrder,
        parentOverride,
        menuTitle: item.menuTitle,
        iconUrl: item.iconUrl,
      },
    );
  }

  return { ok: true as const, count: items.length };
}

export async function swapCategorySortOrder(categoryId: number, direction: "up" | "down", wooTree: WooCategoryNode[]) {
  const result = await getCategoriesWithMenuSelection(wooTree);
  const current = result.flatCategories.find((item) => item.id === categoryId);

  if (!current) {
    throw new Error("Category not found.");
  }

  const siblings =
    current.parent === 0
      ? result.categories
      : findInTree(result.categories, current.parent)?.children || [];

  const index = siblings.findIndex((item) => item.id === categoryId);
  const swapWith = direction === "up" ? siblings[index - 1] : siblings[index + 1];

  if (!swapWith || index < 0) {
    return { ok: true, swapped: false };
  }

  await updateCategoryMenuSelection(
    { id: current.id, slug: current.slug },
    {
      slug: current.slug,
      sortOrder: swapWith.sortOrder,
      showInMenu: current.showInMenu,
      parentOverride: current.parentOverride,
      iconUrl: current.iconUrl || null,
    },
  );
  await updateCategoryMenuSelection(
    { id: swapWith.id, slug: swapWith.slug },
    {
      slug: swapWith.slug,
      sortOrder: current.sortOrder,
      showInMenu: swapWith.showInMenu,
      parentOverride: swapWith.parentOverride,
      iconUrl: swapWith.iconUrl || null,
    },
  );

  return { ok: true, swapped: true };
}

function findInTree(tree: CategoryMenuSelectionNode[], id: number): CategoryMenuSelectionNode | null {
  for (const node of tree) {
    if (node.id === id) {
      return node;
    }

    const child = findInTree(node.children, id);
    if (child) {
      return child;
    }
  }

  return null;
}
