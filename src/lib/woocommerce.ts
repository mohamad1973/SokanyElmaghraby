import "server-only";

import { categories as fallbackCategories, products as fallbackProducts } from "./demo-data";
import type { Category, Product } from "./types";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

type WooImage = {
  src?: string;
};

type WooCategory = {
  id: number;
  name: string;
  slug: string;
  parent?: number;
  image?: WooImage | null;
};

type WooAttribute = {
  name: string;
  options?: string[];
};

type WooProduct = {
  id: number;
  name: string;
  slug: string;
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  images?: WooImage[];
  categories?: WooCategory[];
  short_description?: string;
  description?: string;
  stock_status?: Product["stockStatus"];
  average_rating?: string;
  attributes?: WooAttribute[];
};

type StoreApiImage = {
  src?: string;
  thumbnail?: string;
  alt?: string;
};

type StoreApiProduct = {
  id: number;
  name: string;
  slug: string;
  sku?: string;
  short_description?: string;
  description?: string;
  average_rating?: string;
  is_in_stock?: boolean;
  is_on_backorder?: boolean;
  on_sale?: boolean;
  prices?: {
    price?: string;
    regular_price?: string;
    sale_price?: string;
    currency_minor_unit?: number;
  };
  images?: StoreApiImage[];
  categories?: WooCategory[];
  attributes?: Array<{
    name: string;
    terms?: string[];
  }>;
};

type StoreApiCategory = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  count?: number;
  parent?: number;
  image?: StoreApiImage | null;
};

function stripHtml(value = "") {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

async function wooFetch<T>(path: string): Promise<T | null> {
  if (!hasWooCredentials()) {
    return null;
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${authToken}`,
      },
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

async function storeFetch<T>(path: string): Promise<T | null> {
  const url = new URL(`/wp-json/wc/store/v1/${path}`, siteUrl);

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

function mapProduct(product: WooProduct): Product {
  const images = product.images?.map((image) => image.src).filter((src): src is string => Boolean(src)) || [];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku || `SOKANY-${product.id}`,
    price: product.price || product.sale_price || product.regular_price || "0",
    regularPrice: product.regular_price,
    salePrice: product.sale_price,
    image: images[0] || "/product-placeholder.svg",
    images,
    category: product.categories?.[0]?.name || "منتجات سوكاني",
    categorySlug: product.categories?.[0]?.slug,
    shortDescription:
      stripHtml(product.short_description) || "منتج أصلي من سوكاني بضمان مؤسسة المغربي.",
    shortDescriptionHtml: product.short_description || "",
    description:
      stripHtml(product.description) || "تفاصيل المنتج يتم تحديثها من لوحة WooCommerce.",
    descriptionHtml: product.description || "",
    stockStatus: product.stock_status || "instock",
    rating: product.average_rating || "0",
    attributes:
      product.attributes?.reduce<Record<string, string>>((acc, attribute) => {
        acc[attribute.name] = attribute.options?.join("، ") || "";
        return acc;
      }, {}) || {},
  };
}

function formatStorePrice(value?: string, minorUnit = 0) {
  if (!value) {
    return "0";
  }

  const numericValue = Number(value) / 10 ** minorUnit;

  if (Number.isNaN(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: minorUnit,
  }).format(numericValue);
}

function mapStoreProduct(product: StoreApiProduct): Product {
  const price = formatStorePrice(product.prices?.price, product.prices?.currency_minor_unit);
  const regularPrice = formatStorePrice(
    product.prices?.regular_price,
    product.prices?.currency_minor_unit,
  );
  const salePrice = formatStorePrice(product.prices?.sale_price, product.prices?.currency_minor_unit);
  const images = product.images
    ?.map((image) => image.src || image.thumbnail)
    .filter((src): src is string => Boolean(src)) || [];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku || `SOKANY-${product.id}`,
    price,
    regularPrice,
    salePrice: product.on_sale ? salePrice : undefined,
    image: images[0] || "/product-placeholder.svg",
    images,
    category: product.categories?.[0]?.name || "منتجات سوكاني",
    categorySlug: product.categories?.[0]?.slug,
    shortDescription:
      stripHtml(product.short_description) || "منتج أصلي من سوكاني بضمان مؤسسة المغربي.",
    shortDescriptionHtml: product.short_description || "",
    description:
      stripHtml(product.description) || "تفاصيل المنتج يتم تحديثها من لوحة WooCommerce.",
    descriptionHtml: product.description || "",
    stockStatus: product.is_on_backorder
      ? "onbackorder"
      : product.is_in_stock
        ? "instock"
        : "outofstock",
    rating: product.average_rating || "0",
    attributes:
      product.attributes?.reduce<Record<string, string>>((acc, attribute) => {
        acc[attribute.name] = attribute.terms?.join("، ") || "";
        return acc;
      }, {}) || {},
  };
}

function hasRealProductImage(product: Product) {
  return Boolean(product.images?.length && product.image && !product.image.includes("product-placeholder"));
}

async function getCategoryIdBySlug(slug?: string) {
  if (!slug) {
    return null;
  }

  const storeData = await storeFetch<StoreApiCategory[]>(
    `products/categories?slug=${encodeURIComponent(slug)}`,
  );

  if (storeData?.[0]?.id) {
    return storeData[0].id;
  }

  const wooData = await wooFetch<WooCategory[]>(
    `products/categories?slug=${encodeURIComponent(slug)}`,
  );

  return wooData?.[0]?.id || null;
}

async function getCategoryIdsBySlug(slug?: string) {
  if (!slug) {
    return [];
  }

  const categories = await storeFetch<StoreApiCategory[]>("products/categories?per_page=100");
  const selectedCategory = categories?.find((category) => category.slug === slug);

  if (!categories?.length || !selectedCategory) {
    const categoryId = await getCategoryIdBySlug(slug);

    return categoryId ? [categoryId] : [];
  }

  const descendantIds = new Set<number>([selectedCategory.id]);
  let foundChild = true;

  while (foundChild) {
    foundChild = false;

    categories.forEach((category) => {
      if (category.parent && descendantIds.has(category.parent) && !descendantIds.has(category.id)) {
        descendantIds.add(category.id);
        foundChild = true;
      }
    });
  }

  return Array.from(descendantIds);
}

function uniqueProducts(products: Product[], limit: number) {
  const productsById = new Map<number, Product>();

  products.forEach((product) => {
    productsById.set(product.id, product);
  });

  return Array.from(productsById.values()).slice(0, limit);
}

export async function getProducts(limit = 12, categorySlug?: string): Promise<Product[]> {
  const categoryIds = await getCategoryIdsBySlug(categorySlug);
  const categoryId = categoryIds[0];
  const categoryQuery = categoryId ? `&category=${categoryId}` : "";
  const data = categoryIds.length > 1
    ? (
        await Promise.all(
          categoryIds.map((id) => wooFetch<WooProduct[]>(`products?per_page=${limit}&status=publish&category=${id}`)),
        )
      ).flatMap((categoryProducts) => categoryProducts || [])
    : await wooFetch<WooProduct[]>(`products?per_page=${limit}&status=publish${categoryQuery}`);

  if (data?.length) {
    return uniqueProducts(data.map(mapProduct).filter(hasRealProductImage), limit);
  }

  const storeData = categoryIds.length > 1
    ? (
        await Promise.all(
          categoryIds.map((id) => storeFetch<StoreApiProduct[]>(`products?per_page=${limit}&category=${id}`)),
        )
      ).flatMap((categoryProducts) => categoryProducts || [])
    : await storeFetch<StoreApiProduct[]>(
        `products?per_page=${limit}${categoryId ? `&category=${categoryId}` : ""}`,
      );

  if (storeData?.length) {
    return uniqueProducts(storeData.map(mapStoreProduct).filter(hasRealProductImage), limit);
  }

  return fallbackProducts.filter(hasRealProductImage).slice(0, limit);
}

export async function getFeaturedProducts(limit = 8, minimumCount = 4): Promise<Product[]> {
  const data = await wooFetch<WooProduct[]>(`products?featured=true&per_page=${limit}&status=publish`);

  if (data?.length) {
    const featuredProducts = data.map(mapProduct).filter(hasRealProductImage);

    if (featuredProducts.length >= minimumCount) {
      return featuredProducts.slice(0, limit);
    }

    const supplementalData = await wooFetch<WooProduct[]>(
      `products?per_page=${limit}&status=publish&orderby=popularity`,
    );

    return uniqueProducts(
      [
        ...featuredProducts,
        ...(supplementalData?.map(mapProduct).filter(hasRealProductImage) || []),
      ],
      limit,
    );
  }

  const storeData = await storeFetch<StoreApiProduct[]>(`products?per_page=${limit}&orderby=popularity`);

  if (storeData?.length) {
    return storeData.map(mapStoreProduct).filter(hasRealProductImage).slice(0, limit);
  }

  const featuredFallbackProducts = fallbackProducts.filter((product) => product.featured && hasRealProductImage(product));

  if (featuredFallbackProducts.length >= minimumCount) {
    return featuredFallbackProducts.slice(0, limit);
  }

  return uniqueProducts(
    [
      ...featuredFallbackProducts,
      ...fallbackProducts.filter(hasRealProductImage),
    ],
    limit,
  );
}

export async function searchProducts(query: string, limit = 8): Promise<Product[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const data = await wooFetch<WooProduct[]>(
    `products?per_page=${limit}&status=publish&search=${encodeURIComponent(trimmedQuery)}`,
  );

  if (data?.length) {
    return data.map(mapProduct).filter(hasRealProductImage);
  }

  const storeData = await storeFetch<StoreApiProduct[]>(
    `products?per_page=${limit}&search=${encodeURIComponent(trimmedQuery)}`,
  );

  if (storeData?.length) {
    return storeData.map(mapStoreProduct).filter(hasRealProductImage);
  }

  const normalizedQuery = trimmedQuery.toLowerCase();

  return fallbackProducts
    .filter((product) =>
      hasRealProductImage(product) &&
      [product.name, product.sku, product.category, product.shortDescription].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
    .slice(0, limit);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const data = await wooFetch<WooProduct[]>(`products?slug=${slug}&status=publish`);

  if (data?.length) {
    return mapProduct(data[0]);
  }

  const storeData = await storeFetch<StoreApiProduct[]>(`products?slug=${slug}`);

  if (storeData?.length) {
    return mapStoreProduct(storeData[0]);
  }

  return fallbackProducts.find((product) => product.slug === slug) || null;
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const categoryProducts = product.categorySlug
    ? await getProducts(limit + 1, product.categorySlug)
    : await getProducts(limit + 1);

  const related = categoryProducts.filter((item) => item.id !== product.id).slice(0, limit);

  if (related.length >= limit || !product.categorySlug) {
    return related;
  }

  const supplemental = (await getProducts(limit + 1))
    .filter((item) => item.id !== product.id && !related.some((existing) => existing.id === item.id))
    .slice(0, limit - related.length);

  return [...related, ...supplemental];
}

export async function getProductsByIds(ids: number[]): Promise<Product[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0))).slice(0, 4);

  if (!uniqueIds.length) {
    return [];
  }

  const data = await wooFetch<WooProduct[]>(
    `products?include=${uniqueIds.join(",")}&per_page=${uniqueIds.length}&status=publish`,
  );

  if (data?.length) {
    const productsById = new Map(data.map((item) => [item.id, mapProduct(item)]));

    return uniqueIds
      .map((id) => productsById.get(id))
      .filter((product): product is Product => Boolean(product));
  }

  const storeData = await storeFetch<StoreApiProduct[]>(
    `products?include=${uniqueIds.join(",")}&per_page=${uniqueIds.length}`,
  );

  if (storeData?.length) {
    const productsById = new Map(storeData.map((item) => [item.id, mapStoreProduct(item)]));

    return uniqueIds
      .map((id) => productsById.get(id))
      .filter((product): product is Product => Boolean(product));
  }

  const fallbackById = new Map(fallbackProducts.map((product) => [product.id, product]));

  return uniqueIds
    .map((id) => fallbackById.get(id))
    .filter((product): product is Product => Boolean(product));
}

export async function getCategories(): Promise<Category[]> {
  const data = await wooFetch<Array<WooCategory & { count?: number; description?: string }>>(
    "products/categories?per_page=20&hide_empty=true",
  );

  if (data?.length) {
    const categories = data.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: stripHtml(category.description) || "مجموعة مختارة من منتجات سوكاني الأصلية.",
      productCount: category.count || 0,
      parent: category.parent || 0,
      image: category.image?.src,
    }));

    const { filterSelectedCategoryList } = await import("./category-menu-selection");

    return filterSelectedCategoryList(categories);
  }

  const storeData = await storeFetch<StoreApiCategory[]>("products/categories?per_page=30");

  if (storeData?.length) {
    const categories = storeData
      .filter((category) => category.count !== 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: stripHtml(category.description) || "مجموعة مختارة من منتجات سوكاني الأصلية.",
        productCount: category.count || 0,
        parent: category.parent || 0,
        image: category.image?.thumbnail || category.image?.src,
      }));

    const { filterSelectedCategoryList } = await import("./category-menu-selection");

    return filterSelectedCategoryList(categories);
  }

  return fallbackCategories;
}

