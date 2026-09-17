import type { Metadata } from "next";

import { VendorRegisterForm } from "@/components/vendor-register-form";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "تسجيل فيندور",
};

export default function VendorRegisterPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-bold text-brand-gold">Tooliano × Sokany</p>
          <h1 className="mt-2 text-4xl font-bold text-zinc-950">كن فيندور</h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-zinc-600">
            اعرض منتجك للشراء الجماعي على واجهة سوكاني. الطلبات والمنتجات الأساسية من متجر سوكاني
            (WooCommerce)، والحملات الجماعية هنا.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-bold text-zinc-900 underline">
            العودة للرئيسية
          </Link>
        </div>
        <VendorRegisterForm />
      </div>
    </div>
  );
}
