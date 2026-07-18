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

export const DEFAULT_BOSTA_WEBHOOK_SECRET = "sokany-bosta-webhook-secret";

export function getBostaWebhookSecret() {
  return process.env.BOSTA_WEBHOOK_SECRET || DEFAULT_BOSTA_WEBHOOK_SECRET;
}

export function buildBostaWebhookUrl() {
  const base = (process.env.NEXTAUTH_URL || "https://sokany-storefront.vercel.app").replace(/\/$/, "");
  return `${base}/api/webhooks/bosta/${getBostaWebhookSecret()}`;
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
  return bostaFetch<unknown>("/cities");
}

export type BostaCityOption = {
  id: string;
  nameAr: string;
  nameEn: string;
};

export type BostaDistrictOption = {
  id: string;
  nameAr: string;
  nameEn: string;
  cityId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of ["data", "cities", "list", "districts", "zones"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested;
    }

    const nestedRecord = asRecord(nested);
    if (nestedRecord) {
      for (const innerKey of ["data", "cities", "list", "districts", "zones"]) {
        if (Array.isArray(nestedRecord[innerKey])) {
          return nestedRecord[innerKey] as unknown[];
        }
      }
    }
  }

  return [];
}

function mapCity(item: unknown): BostaCityOption | null {
  const record = asRecord(item);
  if (!record) {
    return null;
  }

  const id = pickString(record._id, record.id, record.cityId, record.code);
  const nameAr = pickString(record.nameAr, record.name_ar, record.arabicName, record.nameOther, record.name);
  const nameEn = pickString(record.name, record.nameEn, record.name_en, record.englishName, nameAr);

  if (!id || !nameAr) {
    return null;
  }

  return { id, nameAr, nameEn: nameEn || nameAr };
}

function mapDistrict(item: unknown, fallbackCityId = ""): BostaDistrictOption | null {
  const record = asRecord(item);
  if (!record) {
    return null;
  }

  const zone = asRecord(record.zone) || asRecord(record.district) || record;
  const zoneRecord = asRecord(zone) || record;
  const city = asRecord(record.city) || asRecord(zoneRecord.city);

  const id = pickString(zoneRecord._id, zoneRecord.id, zoneRecord.districtId, record._id, record.id);
  const nameAr = pickString(
    zoneRecord.nameAr,
    zoneRecord.name_ar,
    zoneRecord.arabicName,
    zoneRecord.nameOther,
    zoneRecord.name,
    record.nameAr,
    record.name,
  );
  const nameEn = pickString(zoneRecord.name, zoneRecord.nameEn, zoneRecord.name_en, nameAr);
  const cityId = pickString(city?._id, city?.id, record.cityId, zoneRecord.cityId, fallbackCityId);

  if (!id || !nameAr) {
    return null;
  }

  return { id, nameAr, nameEn: nameEn || nameAr, cityId };
}

export async function getBostaCityOptions(): Promise<{ ok: true; cities: BostaCityOption[] } | { ok: false; message: string }> {
  const result = await listBostaCities();

  if (!result.ok) {
    return result;
  }

  const cities = unwrapList(result.data)
    .map(mapCity)
    .filter((city): city is BostaCityOption => Boolean(city));

  return { ok: true, cities };
}

export async function getBostaDistrictOptions(
  cityId: string,
): Promise<{ ok: true; districts: BostaDistrictOption[] } | { ok: false; message: string }> {
  const trimmedCityId = cityId.trim();

  if (!trimmedCityId) {
    return { ok: false, message: "معرّف المدينة مطلوب." };
  }

  const attempts = [
    `/cities/${encodeURIComponent(trimmedCityId)}/districts`,
    `/cities/${encodeURIComponent(trimmedCityId)}/zones`,
    `/cities/getDistricts/${encodeURIComponent(trimmedCityId)}`,
  ];

  for (const path of attempts) {
    const result = await bostaFetch<unknown>(path);

    if (!result.ok) {
      continue;
    }

    const districts = unwrapList(result.data)
      .map((item) => mapDistrict(item, trimmedCityId))
      .filter((district): district is BostaDistrictOption => Boolean(district))
      .filter((district) => !district.cityId || district.cityId === trimmedCityId);

    if (districts.length) {
      return { ok: true, districts };
    }
  }

  const allDistricts = await bostaFetch<unknown>(
    `/cities/getAllDistricts?countryId=60e4482c7cb7d4bc4849c4d5`,
  );

  if (allDistricts.ok) {
    const districts = unwrapList(allDistricts.data)
      .map((item) => mapDistrict(item, trimmedCityId))
      .filter((district): district is BostaDistrictOption => Boolean(district))
      .filter((district) => district.cityId === trimmedCityId);

    if (districts.length) {
      return { ok: true, districts };
    }
  }

  return { ok: false, message: "تعذر جلب مناطق المدينة من بوسطة." };
}
