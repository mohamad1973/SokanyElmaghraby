import "server-only";

import { categories as fallbackCategories } from "./demo-data";
import type { MenuNode } from "./types";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";

type StoreCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
};

function hasProductsInTree(categories: StoreCategory[], category: StoreCategory): boolean {
  if (category.count > 0) {
    return true;
  }

  return categories
    .filter((child) => child.parent === category.id)
    .some((child) => hasProductsInTree(categories, child));
}

function buildCategoryTree(categories: StoreCategory[], parent = 0): MenuNode[] {
  return categories
    .filter((category) => category.parent === parent && hasProductsInTree(categories, category))
    .map((category) => ({
      id: category.id,
      title: category.name,
      url: `${siteUrl}/product-category/${category.slug}/`,
      href: `/shop?category=${encodeURIComponent(category.slug)}`,
      type: "taxonomy",
      object: "product_cat",
      objectId: category.id,
      slug: category.slug,
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
    })),
  );
}

