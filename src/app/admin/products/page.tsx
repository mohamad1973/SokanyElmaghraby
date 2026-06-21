import Image from "next/image";
import Link from "next/link";

import { getProducts } from "@/lib/woocommerce";

import { ImportButton } from "../import-button";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getProducts(100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold text-zinc-950">Products</h1>
          <p className="mt-2 text-sm leading-7 text-zinc-600">
            عرض مباشر للمنتجات من WooCommerce داخل داشبورد Next.js.
          </p>
        </div>
        <ImportButton endpoint="/api/admin/import/products" label="Import products from WordPress" />
      </div>

      <div className="rounded-md border border-[#c3c4c7] bg-white shadow-sm">
        <div className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-4 py-3 text-sm font-bold">
          عدد المنتجات المعروضة: {products.length}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] border-collapse text-right text-sm">
            <thead className="bg-[#f6f7f7]">
              <tr>
                <th className="border-b border-[#c3c4c7] px-3 py-3">الصورة</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">المنتج</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">SKU</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">التصنيف</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">السعر</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">المخزون</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">فتح</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="odd:bg-white even:bg-[#f6f7f7]">
                  <td className="border-b border-[#dcdcde] px-3 py-3">
                    <div className="relative h-14 w-14 overflow-hidden rounded-md bg-zinc-100">
                      <Image src={product.image} alt={product.name} fill sizes="56px" className="object-contain" />
                    </div>
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-3">
                    <p className="font-bold text-[#2271b1]">{product.name}</p>
                    <p className="mt-1 max-w-md truncate text-xs text-zinc-500">{product.shortDescription}</p>
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-3 font-mono text-xs">{product.sku}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-3">{product.category}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-3 font-bold">{product.price} ج.م</td>
                  <td className="border-b border-[#dcdcde] px-3 py-3">{product.stockStatus}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-3">
                    <Link href={`/product/${product.slug}`} className="font-bold text-[#2271b1]">
                      عرض
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
