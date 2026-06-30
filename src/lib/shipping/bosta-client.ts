import "server-only";

import type { AdminOrder } from "@/lib/orders";

import { mapGovernorateToBostaCity } from "./bosta-zones";

const bostaApiKey = process.env.BOSTA_API_KEY;

function resolveBostaBaseUrl() {
  const raw = (process.env.BOSTA_BASE_URL || "https://app.bosta.co").replace(/\/$/, "");

  if (raw.includes("business.bosta.co")) {
    return "https://app.bosta.co";
  }

  return raw;
}

const bostaBaseUrl = resolveBostaBaseUrl();

export type BostaDeliveryResult = {
  ok: boolean;
  message: string;
  deliveryId?: string;
  trackingNumber?: string;
  raw?: unknown;
};

export type BostaTrackResult = {
  ok: boolean;
  message: string;
  status?: string;
  statusLabelAr?: string;
  history?: unknown[];
  raw?: unknown;
};

function hasBostaCredentials() {
  return Boolean(bostaApiKey);
}

async function bostaFetch<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  if (!hasBostaCredentials()) {
    return {
      ok: false,
      message: "مفتاح Bosta API غير موجود. أضف BOSTA_API_KEY في متغيرات البيئة.",
    };
  }

  const url = `${bostaBaseUrl}/api/v2${path}`;

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: bostaApiKey!,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    const bodyText = await response.text().catch(() => "");
    let parsed: unknown = null;

    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = bodyText;
    }

    if (!response.ok) {
      const detail =
        typeof parsed === "object" && parsed && "message" in parsed
          ? String((parsed as { message?: string }).message)
          : bodyText.slice(0, 250);

      return {
        ok: false,
        message: `Bosta API ${response.status}: ${detail || "تعذر تنفيذ الطلب"}`,
      };
    }

    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, message: "تعذر الاتصال بـ Bosta API." };
  }
}

function splitCustomerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "Customer";
  const lastName = parts.slice(1).join(" ") || ".";
  return { firstName, lastName };
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("20") && digits.length >= 12) {
    return digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
}

export function buildBostaWebhookUrl() {
  const secret = process.env.BOSTA_WEBHOOK_SECRET || "sokany-bosta-webhook";
  const siteUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const base = process.env.NEXTAUTH_URL || siteUrl;
  return `${base.replace(/\/$/, "")}/api/webhooks/bosta/${secret}`;
}

export async function createBostaDelivery(order: AdminOrder, codAmount?: number): Promise<BostaDeliveryResult> {
  const city = mapGovernorateToBostaCity(order.governorate);
  const { firstName, lastName } = splitCustomerName(order.customerName);
  const cod = codAmount ?? (Number.parseFloat(order.total) || 0);

  const payload = {
    type: 10,
    cod,
    specs: {
      packageType: "Parcel",
      size: "SMALL",
    },
    dropOffAddress: {
      city: city.code,
      zone: order.area || city.nameAr,
      firstLine: order.address,
      secondLine: order.area || "",
    },
    receiver: {
      firstName,
      lastName,
      phone: normalizePhone(order.phone),
    },
    businessReference: String(order.id),
    notes: `WooCommerce order #${order.number}`,
    webhookUrl: buildBostaWebhookUrl(),
  };

  const result = await bostaFetch<{ _id?: string; trackingNumber?: string; message?: string }>("/deliveries", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const data = result.data;

  return {
    ok: true,
    message: "تم إنشاء شحنة Bosta بنجاح.",
    deliveryId: data._id,
    trackingNumber: data.trackingNumber,
    raw: data,
  };
}

export async function trackBostaDelivery(trackingNumber: string): Promise<BostaTrackResult> {
  const result = await bostaFetch<{ state?: { value?: string }; TransitEvents?: unknown[] }>(
    `/deliveries/track/${encodeURIComponent(trackingNumber)}`,
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const status = result.data.state?.value || "unknown";

  return {
    ok: true,
    message: "تم جلب حالة الشحنة.",
    status,
    history: result.data.TransitEvents as unknown[] | undefined,
    raw: result.data,
  };
}

export async function getBostaDeliveryByTracking(trackingNumber: string) {
  return bostaFetch(`/deliveries/track/${encodeURIComponent(trackingNumber)}`);
}

export async function cancelBostaDelivery(deliveryId: string) {
  return bostaFetch(`/deliveries/${encodeURIComponent(deliveryId)}/terminate`, {
    method: "DELETE",
  });
}

export async function listBostaCities() {
  return bostaFetch<unknown[]>("/cities");
}
