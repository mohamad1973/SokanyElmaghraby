import type { Product } from "./types";

export const CART_STORAGE_KEY = "sokany-cart";

export type CartItem = {
  id: number;
  slug: string;
  name: string;
  price: string;
  image: string;
  qty: number;
  stockStatus: "instock" | "outofstock" | "onbackorder";
  stockQuantity?: number;
};

/** Max units a customer can select for a product. */
export function getMaxOrderQuantity(product: Pick<Product, "stockStatus" | "stockQuantity">): number {
  if (product.stockStatus === "outofstock") {
    return 0;
  }

  if (typeof product.stockQuantity === "number" && Number.isFinite(product.stockQuantity)) {
    return Math.max(0, Math.floor(product.stockQuantity));
  }

  return 20;
}

export function parseCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: CartItem[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = Number(record.id);
    const qty = Number(record.qty);
    const slug = typeof record.slug === "string" ? record.slug : "";
    const name = typeof record.name === "string" ? record.name : "";
    const price = typeof record.price === "string" ? record.price : String(record.price ?? "0");
    const image = typeof record.image === "string" ? record.image : "/product-placeholder.svg";
    const stockStatus =
      record.stockStatus === "outofstock" || record.stockStatus === "onbackorder"
        ? record.stockStatus
        : "instock";
    const stockQuantity =
      typeof record.stockQuantity === "number" && Number.isFinite(record.stockQuantity)
        ? Math.max(0, Math.floor(record.stockQuantity))
        : undefined;

    if (!Number.isFinite(id) || id < 1 || !slug || !name || !Number.isFinite(qty) || qty < 1) {
      continue;
    }

    items.push({
      id,
      slug,
      name,
      price,
      image,
      qty: Math.floor(qty),
      stockStatus,
      ...(stockQuantity !== undefined ? { stockQuantity } : {}),
    });
  }

  return items;
}

export function cartLineTotal(item: CartItem): number {
  const unit = Number(String(item.price).replace(/,/g, ""));
  if (!Number.isFinite(unit)) {
    return 0;
  }

  return unit * item.qty;
}

export function formatCartMoney(amount: number): string {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/** Arabic piece count: قطعة / قطعتين / N قطع */
export function formatCartPieceLabel(count: number): string {
  const safe = Math.max(0, Math.floor(count));

  if (safe === 1) {
    return "قطعة";
  }

  if (safe === 2) {
    return "قطعتين";
  }

  if (safe >= 3 && safe <= 10) {
    return `${safe} قطع`;
  }

  return `${safe} قطعة`;
}

export function formatCartAddedMessage(count: number, prefix?: string): string {
  const pieces = formatCartPieceLabel(count);
  const base = `لديك ${pieces} في السلة`;

  if (prefix) {
    return `${prefix} — ${base}`;
  }

  return `تمت الإضافة — ${base}`;
}
