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
  shortDescription: string;
  shortDescriptionHtml?: string;
  description: string;
  descriptionHtml?: string;
  stockStatus: "instock" | "outofstock" | "onbackorder";
  rating: string;
  attributes: Record<string, string>;
  featured?: boolean;
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
  permalink?: string;
  children: MenuNode[];
};

export type WooCategoryNode = Omit<MenuNode, "children" | "parent" | "count" | "image" | "permalink"> & {
  parent: number;
  count: number;
  image?: string;
  permalink: string;
  children: WooCategoryNode[];
};

export type CategoryMenuSelectionNode = Omit<WooCategoryNode, "children"> & {
  showInMenu: boolean;
  children: CategoryMenuSelectionNode[];
};

