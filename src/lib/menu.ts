import "server-only";

import type { MenuNode } from "./types";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";

type WordPressMenuNode = {
  id: number;
  title: string;
  url: string;
  type: string;
  object: string;
  objectId: number;
  slug: string;
  children?: WordPressMenuNode[];
};

type StoreCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
};

function normalizeCategoryHref(node: Pick<WordPressMenuNode, "object" | "slug" | "url">) {
  if ((node.object === "product_cat" || node.url.includes("/product-category/")) && node.slug) {
    return `/shop?category=${encodeURIComponent(node.slug)}`;
  }

  if (node.url.startsWith(siteUrl)) {
    const url = new URL(node.url);
    return `${url.pathname}${url.search}`;
  }

  return node.url || "/";
}

function normalizeWordPressMenu(nodes: WordPressMenuNode[]): MenuNode[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    url: node.url,
    href: normalizeCategoryHref(node),
    type: node.type,
    object: node.object,
    objectId: node.objectId,
    slug: node.slug,
    children: normalizeWordPressMenu(node.children || []),
  }));
}

function buildCategoryTree(categories: StoreCategory[], parent = 0): MenuNode[] {
  return categories
    .filter((category) => category.parent === parent && category.count > 0)
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
  const wordpressMenu = await fetchJson<WordPressMenuNode[]>(`${siteUrl}/wp-json/sokany/v1/menu`);

  if (wordpressMenu?.length) {
    return normalizeWordPressMenu(wordpressMenu);
  }

  const categories = await fetchJson<StoreCategory[]>(
    `${siteUrl}/wp-json/wc/store/v1/products/categories?per_page=100`,
  );

  if (!categories?.length) {
    return [];
  }

  return buildCategoryTree(categories);
}

