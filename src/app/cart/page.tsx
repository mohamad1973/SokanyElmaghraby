import type { Metadata } from "next";

import { CartPageContent } from "@/components/cart-page-content";

export const metadata: Metadata = {
  title: "سلة المشتريات",
};

export default function CartPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <CartPageContent />
      </div>
    </div>
  );
}
