import { NextResponse } from "next/server";

import { getCustomerSession } from "@/lib/customer-account";

type CheckoutPayload = {
  customer?: {
    name?: string;
    phone?: string;
    governorate?: string;
    address?: string;
  };
  paymentMethod?: "fawry" | "cod";
  useLoyaltyPoints?: boolean;
  items?: Array<{
    productId: number;
    quantity: number;
  }>;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as CheckoutPayload;
  const customer = await getCustomerSession();

  if (!payload.customer?.name || !payload.customer?.phone || !payload.items?.length) {
    return NextResponse.json(
      { message: "بيانات الطلب غير مكتملة." },
      { status: 400 },
    );
  }

  if (payload.paymentMethod === "fawry") {
    return NextResponse.json({
      message: "Fawry checkout will be created here after adding production credentials.",
      paymentMethod: "fawry",
      nextStep: "create_fawry_charge",
      customerId: customer?.customerId || null,
      useLoyaltyPoints: Boolean(customer && payload.useLoyaltyPoints),
    });
  }

  return NextResponse.json({
    message: "COD order will be created in WooCommerce here.",
    paymentMethod: "cod",
    nextStep: "create_woocommerce_order",
    customerId: customer?.customerId || null,
    useLoyaltyPoints: Boolean(customer && payload.useLoyaltyPoints),
  });
}

