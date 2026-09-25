import "server-only";

import type { AdminOrder } from "@/lib/orders";

import { findBostaCity, mapGovernorateToBostaCity } from "./bosta-zones";

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

export function bostaPhoneKey(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length >= 12) return digits.slice(2).replace(/^0/, "");
  return digits.replace(/^0/, "");
}

function normalizePhone(phone: string) {
  return bostaPhoneKey(phone);
}

function rowsFrom(list: unknown): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => (asRecord(item) ? [asRecord(item)!] : []));
}

function deliveryRecords(raw: unknown): Record<string, unknown>[] {
  const collected: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 4) return;
    if (Array.isArray(node)) {
      const rows = rowsFrom(node);
      if (rows.length) collected.push(...rows);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    for (const key of ["deliveries", "list", "results", "docs", "data"]) {
      const child = record[key];
      if (Array.isArray(child)) {
        const rows = rowsFrom(child);
        if (rows.length) collected.push(...rows);
      } else if (child && typeof child === "object") {
        visit(child, depth + 1);
      }
    }
  };
  visit(raw, 0);
  if (collected.length) return collected;
  const one = bostaPayload(raw);
  return one && rowTracking(one) ? [one] : [];
}

function rowTracking(row: Record<string, unknown>): string | null {
  const nested = asRecord(row.delivery) || asRecord(row.shipment);
  const candidates = [
    row.trackingNumber,
    row.tracking_number,
    row.trackingNo,
    nested?.trackingNumber,
    nested?.tracking_number,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function collectText(value: unknown, out: string[], depth = 0) {
  if (depth > 6 || out.length > 120) return;
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const item of Object.values(record)) collectText(item, out, depth + 1);
}

function rowHasPhone(row: Record<string, unknown>, phoneKey: string) {
  const tail = phoneKey.slice(-10);
  const texts: string[] = [];
  collectText(row, texts);
  return texts.some((value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return false;
    return bostaPhoneKey(value) === phoneKey || digits.endsWith(tail);
  });
}

function rowName(row: Record<string, unknown>) {
  const receiver = asRecord(row.receiver) || {};
  return [receiver.firstName, receiver.lastName, row.receiverName, row.customerName].filter(Boolean).join(" ");
}

function nameOverlap(left: string, right: string) {
  const words = left
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const other = new Set(right.toLowerCase().split(/\s+/));
  return words.filter((word) => other.has(word)).length;
}

export type BostaCustomerLookup = {
  details: BostaLiveDetails | null;
  error: string | null;
};

export async function findBostaDeliveryByCustomer(input: {
  phone: string;
  name?: string | null;
  cod?: number | null;
}): Promise<BostaCustomerLookup> {
  const phoneKey = bostaPhoneKey(input.phone);
  if (phoneKey.length < 10) {
    return { details: null, error: "رقم الموبايل غير مكتمل للبحث في بوسطة." };
  }
  const variants = [`0${phoneKey}`, phoneKey, `20${phoneKey}`, `+20${phoneKey}`];
  const found: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  const remember = (rows: Record<string, unknown>[]) => {
    let added = 0;
    for (const row of rows) {
      const key = rowTracking(row) || JSON.stringify(row).slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(row);
      added += 1;
    }
    return added;
  };
  const phoneHit = () => found.some((row) => rowHasPhone(row, phoneKey));

  const searched = await bostaFetch("/deliveries/search", {
    method: "POST",
    body: JSON.stringify({
      mobilePhones: variants,
      phones: variants,
      phone: variants[0],
      mobilePhone: variants[0],
      receiverPhone: variants[0],
      pageNumber: 0,
      pageLimit: 50,
      limit: 50,
    }),
  });
  if (searched.ok) remember(deliveryRecords(searched.data));
  else errors.push(searched.message);

  if (!phoneHit()) {
    const query = new URLSearchParams({
      pageNumber: "0",
      pageLimit: "50",
      limit: "50",
      phone: variants[0],
      mobilePhone: variants[0],
      receiverPhone: variants[0],
    });
    const filtered = await bostaFetch(`/deliveries?${query.toString()}`);
    if (filtered.ok) remember(deliveryRecords(filtered.data));
    else errors.push(filtered.message);
  }

  if (!phoneHit()) {
    for (let page = 0; page < 8; page += 1) {
      const listed = await bostaFetch(`/deliveries?pageNumber=${page}&pageLimit=50&limit=50`);
      if (!listed.ok) {
        errors.push(listed.message);
        break;
      }
      const pageRows = deliveryRecords(listed.data);
      if (!pageRows.length) break;
      const added = remember(pageRows);
      if (phoneHit()) break;
      if (!added && page > 0) break;
    }
  }

  const matched = found.filter((row) => rowHasPhone(row, phoneKey));
  if (!matched.length) {
    return {
      details: null,
      error: errors[0] || "مفيش بوليصة على بوسطة بنفس موبايل العميل.",
    };
  }

  const finished = (row: Record<string, unknown>) =>
    /delivered|returned|cancel|terminated|^45$|^46$|^48$|^49$/.test(
      String(readBostaStatus(row) || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
    );
  const active = matched.filter((row) => !finished(row));
  const pool = active.length ? active : matched;
  const expectedCod = input.cod != null && Number.isFinite(input.cod) ? input.cod : null;
  const ranked = pool
    .map((row) => {
      const details = readBostaLiveDetails(row);
      const trackingNumber = details.trackingNumber || rowTracking(row);
      const codScore = expectedCod != null && details.cod != null && Math.abs(details.cod - expectedCod) < 1 ? 100 : 0;
      const sameName = input.name ? nameOverlap(input.name, rowName(row)) * 20 : 0;
      const created = Date.parse(String(row.createdAt || row.updatedAt || "")) || 0;
      return { details: { ...details, trackingNumber }, score: codScore + sameName, created };
    })
    .sort((a, b) => b.score - a.score || b.created - a.created);

  const picked = ranked[0];
  const tracking = picked?.details.trackingNumber;
  if (!tracking) {
    return { details: null, error: "بوسطة رجّعت شحنة من غير رقم تتبع." };
  }
  const live = await fetchCsBostaDelivery(tracking);
  const full = live.ok ? readBostaLiveDetails(live.data) : picked.details;
  return {
    details: {
      trackingNumber: full.trackingNumber || tracking,
      deliveryId: full.deliveryId || picked.details.deliveryId,
      status: full.status || picked.details.status,
      shippingFee: full.shippingFee ?? picked.details.shippingFee,
      cod: full.cod ?? picked.details.cod,
      lastEvent: full.lastEvent || picked.details.lastEvent,
    },
    error: null,
  };
}

function rowBusinessReference(row: Record<string, unknown>) {
  const nested = asRecord(row.delivery) || asRecord(row.shipment) || {};
  return String(row.businessReference || row.business_reference || nested.businessReference || "").trim();
}

function sameOrderReference(left: string, right: string) {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  return da.length >= 3 && da === db;
}

export async function findBostaDeliveryByOrderReference(input: {
  wooOrderId: number;
  wooOrderNumber: string;
}): Promise<BostaCustomerLookup> {
  const refs = [...new Set([String(input.wooOrderId), String(input.wooOrderNumber || "").trim()].filter((value) => value && value !== "0"))];
  if (!refs.length) return { details: null, error: "رقم الأوردر غير موجود للبحث في بوسطة." };

  const found: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const remember = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const key = rowTracking(row) || rowBusinessReference(row) || JSON.stringify(row).slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(row);
    }
  };

  for (const ref of refs) {
    const searched = await bostaFetch("/deliveries/search", {
      method: "POST",
      body: JSON.stringify({
        businessReference: ref,
        businessReferences: refs,
        pageNumber: 0,
        pageLimit: 20,
        limit: 20,
      }),
    });
    if (searched.ok) remember(deliveryRecords(searched.data));
    const query = new URLSearchParams({
      pageNumber: "0",
      pageLimit: "20",
      limit: "20",
      businessReference: ref,
    });
    const listed = await bostaFetch(`/deliveries?${query.toString()}`);
    if (listed.ok) remember(deliveryRecords(listed.data));
  }

  const matched = found.filter((row) => refs.some((ref) => sameOrderReference(rowBusinessReference(row), ref)));
  if (!matched.length) return { details: null, error: null };

  const finished = (row: Record<string, unknown>) =>
    /delivered|returned|cancel|terminated|^45$|^46$|^48$|^49$/.test(
      String(readBostaStatus(row) || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
    );
  const active = matched.filter((row) => !finished(row));
  const pool = active.length ? active : matched;
  const ranked = pool
    .map((row) => {
      const details = readBostaLiveDetails(row);
      const trackingNumber = details.trackingNumber || rowTracking(row);
      const created = Date.parse(String(row.createdAt || row.updatedAt || "")) || 0;
      return { details: { ...details, trackingNumber }, created };
    })
    .filter((row) => row.details.trackingNumber)
    .sort((a, b) => b.created - a.created);

  const picked = ranked[0];
  if (!picked?.details.trackingNumber) return { details: null, error: null };
  const live = await fetchCsBostaDelivery(picked.details.trackingNumber);
  if (live.ok) {
    const payload = bostaPayload(live.data);
    const liveRef = payload ? rowBusinessReference(payload) : "";
    if (liveRef && !refs.some((ref) => sameOrderReference(liveRef, ref))) {
      return { details: null, error: null };
    }
    const full = readBostaLiveDetails(live.data);
    return {
      details: {
        trackingNumber: full.trackingNumber || picked.details.trackingNumber,
        deliveryId: full.deliveryId || picked.details.deliveryId,
        status: full.status || picked.details.status,
        shippingFee: full.shippingFee ?? picked.details.shippingFee,
        cod: full.cod ?? picked.details.cod,
        lastEvent: full.lastEvent || picked.details.lastEvent,
      },
      error: null,
    };
  }
  return { details: picked.details, error: null };
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

export type CsBostaParty = {
  name: string;
  phone: string;
  secondPhone?: string;
  governorate: string;
  area: string;
  address: string;
  landmarks?: string;
  cod: number;
  reference: string;
  notes?: string;
};

export function bostaPayload(raw: unknown): Record<string, unknown> | null {
  const root = asRecord(raw);
  if (!root) return null;
  const nested = asRecord(root.data);
  if (nested && (nested.trackingNumber || nested.state || nested._id || nested.pricing || nested.shipmentFees)) {
    return nested;
  }
  return root;
}

function readAmount(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const amount = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function readBostaShippingFee(raw: unknown): number | null {
  const root = bostaPayload(raw);
  if (!root) return null;
  const pricing = asRecord(root.pricing) || asRecord(root.shipmentPricing) || asRecord(root.price);
  const candidates = [
    pricing?.shippingFee,
    pricing?.priceAfterVat,
    pricing?.priceBeforeVat,
    root.shipmentFees,
    root.shippingFee,
    root.priceAfterVat,
  ];
  for (const candidate of candidates) {
    const amount = readAmount(candidate);
    if (amount !== null) return amount;
  }
  return null;
}

export function readBostaStatus(raw: unknown): string | null {
  const root = bostaPayload(raw);
  if (!root) return null;
  const state = root.state;
  if (typeof state === "string" || typeof state === "number") return String(state);
  const stateRecord = asRecord(state);
  const value = stateRecord?.value ?? stateRecord?.code ?? root.status ?? root.currentStatus;
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export type BostaLiveDetails = {
  trackingNumber: string | null;
  deliveryId: string | null;
  status: string | null;
  shippingFee: number | null;
  cod: number | null;
  lastEvent: string | null;
};

function eventLine(raw: unknown): string | null {
  const event = asRecord(raw);
  if (!event) return null;
  const state = asRecord(event.state);
  const label = String(state?.value || event.state || event.msg || event.message || "").trim();
  const place = String(event.hub || event.exceptionReason || "").trim();
  const when = String(event.timestamp || event.date || event.time || "").trim();
  const text = [label, place].filter(Boolean).join(" — ");
  if (!text) return null;
  return when ? `${text} · ${when}` : text;
}

export function readBostaLiveDetails(raw: unknown): BostaLiveDetails {
  const root = bostaPayload(raw);
  const events = root?.TransitEvents || root?.timeline || root?.history || root?.trackingEvents;
  const list = Array.isArray(events) ? events : [];
  const last = list.length ? eventLine(list[list.length - 1]) : null;
  return {
    trackingNumber: root?.trackingNumber
      ? String(root.trackingNumber)
      : root?.tracking_number
        ? String(root.tracking_number)
        : root?.trackingNo
          ? String(root.trackingNo)
          : null,
    deliveryId: root?._id ? String(root._id) : null,
    status: readBostaStatus(raw),
    shippingFee: readBostaShippingFee(raw),
    cod: readAmount(root?.cod),
    lastEvent: last,
  };
}

function deliveryPayload(party: CsBostaParty, city: { code: string; nameAr: string }) {
  const { firstName, lastName } = splitCustomerName(party.name);
  return {
    type: 10,
    cod: party.cod,
    specs: { packageType: "Parcel", size: "SMALL" },
    dropOffAddress: {
      city: city.code,
      zone: party.area || city.nameAr,
      firstLine: party.address,
      secondLine: party.landmarks || party.area || "",
    },
    receiver: {
      firstName,
      lastName,
      phone: normalizePhone(party.phone),
      ...(party.secondPhone ? { secondPhone: normalizePhone(party.secondPhone) } : {}),
    },
    businessReference: party.reference,
    notes: party.notes || party.landmarks || "",
    webhookUrl: buildBostaWebhookUrl(),
  };
}

export async function createCsBostaDelivery(party: CsBostaParty): Promise<BostaDeliveryResult> {
  const city = findBostaCity(party.governorate);
  if (!city) {
    return { ok: false, message: `المحافظة «${party.governorate || "—"}» غير معروفة عند بوسطة.` };
  }
  const result = await bostaFetch<{ _id?: string; trackingNumber?: string }>("/deliveries", {
    method: "POST",
    body: JSON.stringify(deliveryPayload(party, city)),
  });
  if (!result.ok) return { ok: false, message: result.message };
  const details = readBostaLiveDetails(result.data);
  return {
    ok: true,
    message: "تم إنشاء بوليصة بوسطة.",
    deliveryId: details.deliveryId || undefined,
    trackingNumber: details.trackingNumber || undefined,
    raw: bostaPayload(result.data) || result.data,
  };
}

export async function updateCsBostaDelivery(trackingNumber: string, party: CsBostaParty) {
  const city = findBostaCity(party.governorate);
  if (!city) {
    return { ok: false as const, locked: false, message: `المحافظة «${party.governorate || "—"}» غير معروفة عند بوسطة.` };
  }
  const full = deliveryPayload(party, city);
  const result = await bostaFetch(`/deliveries/business/${encodeURIComponent(trackingNumber)}`, {
    method: "PUT",
    body: JSON.stringify({
      receiver: full.receiver,
      dropOffAddress: full.dropOffAddress,
      notes: full.notes,
      cod: full.cod,
    }),
  });
  if (!result.ok) {
    const locked = /picked|cannot|not allowed|already|terminated|received/i.test(result.message);
    return {
      ok: false as const,
      locked,
      message: locked ? "بوسطة قفلت تعديل البوليصة بعد استلام المندوب." : result.message,
    };
  }
  return { ok: true as const, locked: false, message: "تم تحديث بوليصة بوسطة.", raw: result.data };
}

export async function fetchCsBostaDelivery(trackingNumber: string) {
  const business = await bostaFetch(`/deliveries/business/${encodeURIComponent(trackingNumber)}`);
  if (business.ok) return business;
  return bostaFetch(`/deliveries/track/${encodeURIComponent(trackingNumber)}`);
}
