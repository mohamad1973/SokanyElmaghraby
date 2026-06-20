import "server-only";

import { categories as fallbackCategories } from "./demo-data";
import type { MenuNode, WooCategoryNode } from "./types";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";

type StoreCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
  image?: {
    src?: string;
    thumbnail?: string;
  } | null;
  permalink?: string;
};

function hasProductsInTree(categories: StoreCategory[], category: StoreCategory): boolean {
  if (category.count > 0) {
    return true;
  }

  return categories
    .filter((child) => child.parent === category.id)
    .some((child) => hasProductsInTree(categories, child));
}

function buildCategoryTree(categories: StoreCategory[], parent = 0): WooCategoryNode[] {
  return categories
    .filter((category) => category.parent === parent && hasProductsInTree(categories, category))
    .map((category) => ({
      id: category.id,
      title: category.name,
      url: category.permalink || `${siteUrl}/product-category/${category.slug}/`,
      href: `/shop?category=${encodeURIComponent(category.slug)}`,
      type: "taxonomy",
      object: "product_cat",
      objectId: category.id,
      slug: category.slug,
      parent: category.parent,
      count: category.count,
      image: category.image?.thumbnail || category.image?.src,
      permalink: category.permalink || `${siteUrl}/product-category/${category.slug}/`,
      children: buildCategoryTree(categories, category.id),
    }));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getHeaderMenu(): Promise<MenuNode[]> {
  const { getVisibleCategoryTree } = await import("./category-menu-settings");

  return getVisibleCategoryTree();
}

export async function getWordPressCategoryTree(): Promise<WooCategoryNode[]> {
  const categories = await fetchJson<StoreCategory[]>(
    `${siteUrl}/wp-json/wc/store/v1/products/categories?per_page=100`,
  );

  if (categories?.length) {
    return buildCategoryTree(categories);
  }

  return buildCategoryTree(
    fallbackCategories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parent: category.parent || 0,
      count: category.productCount,
      permalink: `${siteUrl}/product-category/${category.slug}/`,
    })),
  );
}

