export type Product = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  price: string;
  regularPrice?: string;
  salePrice?: string;
  image: string;
  images?: string[];
  category: string;
  categorySlug?: string;
  shortDescription: string;
  shortDescriptionHtml?: string;
  description: string;
  descriptionHtml?: string;
  stockStatus: "instock" | "outofstock" | "onbackorder";
  /** Available units when Woo manage_stock is on; omitted when not managed numerically. */
  stockQuantity?: number;
  rating: string;
  attributes: Record<string, string>;
  featured?: boolean;
};

export type ProductReview = {
  id: number;
  reviewer: string;
  rating: number;
  review: string;
  dateCreated: string;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string;
  productCount: number;
  parent?: number;
  image?: string;
};

export type MenuNode = {
  id: number;
  title: string;
  url: string;
  href: string;
  type: string;
  object: string;
  objectId: number;
  slug: string;
  parent?: number;
  count?: number;
  image?: string;
  iconUrl?: string;
  permalink?: string;
  children: MenuNode[];
};

export type WooCategoryNode = Omit<MenuNode, "children" | "parent" | "count" | "image" | "permalink" | "iconUrl"> & {
  parent: number;
  count: number;
  image?: string;
  iconUrl?: string;
  permalink: string;
  children: WooCategoryNode[];
};

export type CategoryMenuSelectionNode = Omit<WooCategoryNode, "children"> & {
  showInMenu: boolean;
  sortOrder: number;
  /** null = use Woo parent; 0 = root; otherwise custom parent id */
  parentOverride: number | null;
  children: CategoryMenuSelectionNode[];
};

