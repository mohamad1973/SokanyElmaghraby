export type ProductCodeMode = "titleSk" | "titleModel";

const SK_TITLE_PATTERN = /\bSK-?\d{3,8}[A-Z0-9]*\b/i;
const MODEL_TITLE_PATTERN = /موديل[:\s]+(\S+)|model[:\s]+(\S+)/i;

export function extractSkFromTitle(name: string): string | null {
  const match = name.match(SK_TITLE_PATTERN);
  return match?.[0]?.trim().toUpperCase() || null;
}

export function extractModelFromTitle(name: string): string | null {
  const match = name.match(MODEL_TITLE_PATTERN);
  const value = match?.[1] || match?.[2];
  return value?.trim() || null;
}

export function getProductDisplayCode(
  product: { name: string; sku: string },
  mode: ProductCodeMode,
): string {
  const extracted =
    mode === "titleModel" ? extractModelFromTitle(product.name) : extractSkFromTitle(product.name);

  return extracted || product.sku;
}

export function getProductCodeLabel(mode: ProductCodeMode): string {
  return mode === "titleModel" ? "الموديل" : "SKU";
}
