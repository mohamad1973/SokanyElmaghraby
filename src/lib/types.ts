export type Product = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  price: string;
  regularPrice?: string;
  salePrice?: string;
  image: string;
  category: string;
  shortDescription: string;
  description: string;
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
  children: MenuNode[];
};

