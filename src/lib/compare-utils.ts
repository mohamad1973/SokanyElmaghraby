import type { Product } from "@/lib/types";

export type CompareMatrixRow = {
  attribute: string;
  values: string[];
};

export function buildCompareMatrix(products: Product[]): CompareMatrixRow[] {
  const attributeNames = new Set<string>();

  products.forEach((product) => {
    Object.keys(product.attributes).forEach((key) => attributeNames.add(key));
  });

  return Array.from(attributeNames)
    .sort((left, right) => left.localeCompare(right, "ar"))
    .map((attribute) => ({
      attribute,
      values: products.map((product) => product.attributes[attribute] || "—"),
    }));
}
