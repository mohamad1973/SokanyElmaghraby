import type { Product } from "@/lib/types";

export const COMPARE_MAX = 4;
export const WISHLIST_STORAGE_KEY = "sokany-wishlist";
export const COMPARE_STORAGE_KEY = "sokany-compare";

export type ProductListEntry = {
  id: number;
  slug: string;
  name: string;
  image: string;
  price: string;
};

export function productToListEntry(
  product: Pick<Product, "id" | "slug" | "name" | "image" | "price">,
): ProductListEntry {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    image: product.image,
    price: product.price,
  };
}

export function isProductListEntry(value: unknown): value is ProductListEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ProductListEntry>;

  return (
    typeof entry.id === "number" &&
    typeof entry.slug === "string" &&
    typeof entry.name === "string" &&
    typeof entry.image === "string" &&
    typeof entry.price === "string"
  );
}

export function parseStoredEntries(value: string | null): ProductListEntry[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isProductListEntry);
  } catch {
    return [];
  }
}

export function mergeWishlistEntries(
  localEntries: ProductListEntry[],
  serverEntries: ProductListEntry[],
): ProductListEntry[] {
  const merged = new Map<number, ProductListEntry>();

  localEntries.forEach((entry) => merged.set(entry.id, entry));
  serverEntries.forEach((entry) => {
    if (!merged.has(entry.id)) {
      merged.set(entry.id, entry);
    }
  });

  return Array.from(merged.values());
}

export function getCompareOrder(compareList: ProductListEntry[], productId: number): number | null {
  const index = compareList.findIndex((entry) => entry.id === productId);

  return index === -1 ? null : index + 1;
}
