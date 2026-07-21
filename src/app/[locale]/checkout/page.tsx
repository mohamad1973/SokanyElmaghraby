import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout-form";

export const metadata: Metadata = {
  title: "إتمام الطلب",
  description: "إتمام طلب منتجات سوكاني مع دعم فوري أو كاش عند الاستلام.",
};

export default function CheckoutPage() {
  return (
    <div className="py-12">
      <CheckoutForm />
    </div>
  );
}
