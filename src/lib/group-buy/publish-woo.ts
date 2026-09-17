import "server-only";

import type { GbProductSubmission } from "@prisma/client";

import { getPrismaClient } from "@/lib/db";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

type WooProduct = {
  id: number;
  permalink?: string;
};

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

function buildPayload(submission: GbProductSubmission) {
  const retail = submission.suggestedRetailPrice ?? submission.suggestedGroupPrice ?? 0;
  const group = submission.suggestedGroupPrice ?? retail;
  const description =
    submission.productDescription?.trim() ||
    `فرصة شراء جماعي: ${submission.productName}`;

  const payload: Record<string, unknown> = {
    name: submission.productName,
    type: "simple",
    status: "publish",
    catalog_visibility: "visible",
    description,
    short_description: `شراء جماعي — الكمية المستهدفة ${submission.suggestedQuantity}`,
    regular_price: String(retail > 0 ? retail : group),
    manage_stock: true,
    stock_quantity: Math.max(0, submission.suggestedQuantity - submission.reservedQuantity),
    stock_status: "instock",
    categories: [{ name: submission.productType || "Group Buy" }],
    images: submission.productImageUrl
      ? [{ src: submission.productImageUrl, alt: submission.productName }]
      : [],
    meta_data: [
      { key: "_sokany_gb_submission_id", value: submission.id },
      { key: "_sokany_group_buy", value: "yes" },
      { key: "_sokany_product_condition", value: submission.productCondition },
    ],
  };

  if (group > 0 && retail > 0 && group < retail) {
    payload.sale_price = String(group);
  }

  return payload;
}

async function wooWrite<T>(
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  if (!hasWooCredentials()) {
    return { ok: false, message: "بيانات WooCommerce غير مُعدّة على السيرفر." };
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      let message = `WooCommerce ${response.status}`;
      try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        if (text) message = `${message}: ${text.slice(0, 220)}`;
      }
      return { ok: false, message };
    }

    return { ok: true, data: text ? (JSON.parse(text) as T) : ({} as T) };
  } catch {
    return { ok: false, message: "تعذر الاتصال بووكومرس." };
  }
}

export type PublishWooResult =
  | { ok: true; wooProductId: number }
  | { ok: false; message: string };

/** إنشاء أو تحديث منتج الحملة على Woo (sokany-eg.com). */
export async function publishSubmissionToWoo(
  submission: GbProductSubmission,
): Promise<PublishWooResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const payload = buildPayload(submission);

  const result = submission.wooProductId
    ? await wooWrite<WooProduct>(`products/${submission.wooProductId}`, "PUT", payload)
    : await wooWrite<WooProduct>("products", "POST", payload);

  if (!result.ok) {
    await prisma.gbProductSubmission.update({
      where: { id: submission.id },
      data: { wooSyncStatus: "failed" },
    });
    return { ok: false, message: result.message };
  }

  const wooProductId = result.data.id;
  await prisma.gbProductSubmission.update({
    where: { id: submission.id },
    data: {
      wooProductId,
      wooSyncStatus: "synced",
      publishedOnStore: true,
    },
  });

  return { ok: true, wooProductId };
}
