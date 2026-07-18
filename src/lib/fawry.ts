import "server-only";

import { createHash } from "crypto";

import { updateWooOrderStatus } from "@/lib/woocommerce-update";

const merchantCode = process.env.FAWRY_MERCHANT_CODE || "";
const securityKey = process.env.FAWRY_SECURITY_KEY || "";
const fawryBaseUrl = (process.env.FAWRY_BASE_URL || "https://atfawry.fawrystaging.com").replace(/\/$/, "");

export type FawryChargeInput = {
  orderId: number;
  orderNumber: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
};

function hasFawryCredentials() {
  return Boolean(merchantCode && securityKey);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Customer",
    lastName: parts.slice(1).join(" ") || ".",
  };
}

function buildReturnUrl() {
  const base = (process.env.NEXTAUTH_URL || "https://sokany-storefront.vercel.app").replace(/\/$/, "");
  return `${base}/checkout/thank-you`;
}

/**
 * Build a Fawry Express Checkout redirect URL (staging/production via FAWRY_BASE_URL).
 * Signature: SHA256(merchantCode + merchantRefNum + customerProfileId + returnUrl + itemId + qty + price + secureKey)
 * Simplified single-item charge for the full order amount.
 */
export function createFawryPaymentRedirect(input: FawryChargeInput): { ok: true; redirectUrl: string } | { ok: false; message: string } {
  if (!hasFawryCredentials()) {
    return {
      ok: false,
      message: "بيانات فوري غير مُعدّة. أضف FAWRY_MERCHANT_CODE و FAWRY_SECURITY_KEY.",
    };
  }

  const amount = Math.max(1, Math.round(input.amount * 100) / 100);
  const merchantRefNum = String(input.orderNumber || input.orderId);
  const customerProfileId = String(input.orderId);
  const returnUrl = `${buildReturnUrl()}?order=${encodeURIComponent(merchantRefNum)}&payment=fawry`;
  const itemId = `order-${input.orderId}`;
  const qty = 1;
  const price = amount.toFixed(2);
  const { firstName, lastName } = splitName(input.customerName);

  const signatureRaw =
    `${merchantCode}${merchantRefNum}${customerProfileId}${returnUrl}${itemId}${qty}${price}${securityKey}`;
  const signature = createHash("sha256").update(signatureRaw).digest("hex");

  const chargeRequest = {
    merchantCode,
    merchantRefNum,
    customerMobile: input.customerPhone.replace(/\D/g, "").replace(/^20/, "0").slice(-11) || input.customerPhone,
    customerEmail: input.customerEmail || "customer@sokany-eg.com",
    customerName: `${firstName} ${lastName}`.trim(),
    customerProfileId,
    language: "ar-eg",
    chargeItems: [
      {
        itemId,
        description: `SOKANY order ${merchantRefNum}`,
        price: Number(price),
        quantity: qty,
      },
    ],
    returnUrl,
    orderWebHookUrl: `${(process.env.NEXTAUTH_URL || "https://sokany-storefront.vercel.app").replace(/\/$/, "")}/api/fawry/callback`,
    signature,
    paymentMethod: "PayAtFawry",
  };

  const encoded = Buffer.from(JSON.stringify(chargeRequest)).toString("base64");
  const redirectUrl = `${fawryBaseUrl}/ECommercePlugin/FawryPay.jsp?chargeRequest=${encodeURIComponent(encoded)}`;

  return { ok: true, redirectUrl };
}

export function verifyFawryCallbackSignature(payload: Record<string, unknown>): boolean {
  if (!securityKey) {
    return false;
  }

  const provided = String(payload.signature || payload.messageSignature || "");
  if (!provided) {
    return false;
  }

  const merchantRefNum = String(payload.merchantRefNumber || payload.merchantRefNum || "");
  const amount = String(payload.orderAmount || payload.amount || "");
  const orderStatus = String(payload.orderStatus || payload.paymentStatus || "");
  const paymentMethod = String(payload.paymentMethod || "");
  const referenceNumber = String(payload.fawryRefNumber || payload.referenceNumber || "");

  const candidates = [
    `${merchantRefNum}${amount}${securityKey}`,
    `${referenceNumber}${merchantRefNum}${amount}${orderStatus}${securityKey}`,
    `${merchantCode}${merchantRefNum}${amount}${orderStatus}${paymentMethod}${securityKey}`,
  ];

  return candidates.some((raw) => createHash("sha256").update(raw).digest("hex").toLowerCase() === provided.toLowerCase());
}

export async function markOrderPaidFromFawry(orderId: number, note: string) {
  return updateWooOrderStatus(orderId, "processing", note);
}
