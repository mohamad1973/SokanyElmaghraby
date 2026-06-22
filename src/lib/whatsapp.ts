import "server-only";

import type { AdminOrder } from "./orders";

type WhatsAppSendResult = {
  ok: boolean;
  message: string;
};

const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const whatsappRecipient = process.env.WHATSAPP_ADMIN_RECIPIENT || "201000260262";
const whatsappTemplateName = process.env.WHATSAPP_ORDER_TEMPLATE_NAME;

function formatOrderItems(order: AdminOrder) {
  return order.items
    .map((item) => `- ${item.name} | Qty: ${item.quantity} | Value: ${item.total} ${order.currency}`)
    .join("\n");
}

export function formatNewOrderWhatsAppMessage(order: AdminOrder) {
  return [
    "طلب جديد من SOKANY Egypt",
    `رقم الطلب: #${order.number}`,
    `العميل: ${order.customerName}`,
    `الموبايل: ${order.phone}`,
    `العنوان: ${order.address}`,
    `المحافظة: ${order.governorate}`,
    `المنطقة: ${order.area}`,
    `الدفع: ${order.paymentMethod}`,
    `الإجمالي: ${order.total} ${order.currency}`,
    "الأصناف:",
    formatOrderItems(order),
  ].join("\n");
}

export async function sendNewOrderWhatsApp(order: AdminOrder): Promise<WhatsAppSendResult> {
  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    return {
      ok: false,
      message:
        "WhatsApp Cloud API غير مكتمل. أضف WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID في Vercel.",
    };
  }

  const url = `https://graph.facebook.com/v20.0/${whatsappPhoneNumberId}/messages`;
  const body = whatsappTemplateName
    ? {
        messaging_product: "whatsapp",
        to: whatsappRecipient,
        type: "template",
        template: {
          name: whatsappTemplateName,
          language: { code: "ar" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: order.number },
                { type: "text", text: order.customerName },
                { type: "text", text: order.phone },
                { type: "text", text: `${order.total} ${order.currency}` },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: whatsappRecipient,
        type: "text",
        text: {
          preview_url: false,
          body: formatNewOrderWhatsAppMessage(order),
        },
      };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");

    return {
      ok: false,
      message: `تعذر إرسال واتساب. Meta API status: ${response.status}. ${errorBody.slice(0, 250)}`,
    };
  }

  return {
    ok: true,
    message: "تم إرسال رسالة واتساب للطلب الجديد.",
  };
}
