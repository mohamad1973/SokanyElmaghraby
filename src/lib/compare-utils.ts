import { getProductSpecs } from "@/lib/product-spec-parser";
import type { Product } from "@/lib/types";

export type CompareMatrixRow = {
  attribute: string;
  values: string[];
};

const EMPTY_COMPARE_VALUE = "—";

export function formatCompareValue(value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "-") {
    return EMPTY_COMPARE_VALUE;
  }

  return trimmed;
}

export function buildAttributeOrder(products: Product[]): string[] {
  const orderedAttributes: string[] = [];
  const seen = new Set<string>();

  products.forEach((product) => {
    Object.keys(getProductSpecs(product)).forEach((attribute) => {
      if (!seen.has(attribute)) {
        seen.add(attribute);
        orderedAttributes.push(attribute);
      }
    });
  });

  return orderedAttributes;
}

export function buildCompareMatrix(products: Product[]): CompareMatrixRow[] {
  return buildAttributeOrder(products).map((attribute) => ({
    attribute,
    values: products.map((product) => formatCompareValue(getProductSpecs(product)[attribute])),
  }));
}

export function orderProductsByIds(products: Product[], ids: number[]): Product[] {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return ids
    .map((id) => productsById.get(id))
    .filter((product): product is Product => Boolean(product));
}
