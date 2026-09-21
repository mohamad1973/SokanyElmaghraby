import { BOSTA_CITY_MAP } from "@/lib/shipping/bosta-zones";

function metaValue(meta: Array<{ key: string; value?: unknown }> | undefined, keys: string[]) {
  if (!meta?.length) return "";
  for (const key of keys) {
    const hit = meta.find((m) => m.key === key || m.key.toLowerCase() === key.toLowerCase());
    const val = String(hit?.value ?? "").trim();
    if (val) return val;
  }
  return "";
}

export function looksLikeLocationCode(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (/^EG-?\d{1,2}$/i.test(v)) return true;
  if (/^EG\d{1,2}$/i.test(v)) return true;
  if (/^[a-f0-9]{20,}$/i.test(v)) return true;
  if (/^\d{4,}$/.test(v)) return true;
  return false;
}

/** Normalize EG-01 / EG01 / eg-01 / eg 01 → EG01 */
function normalizeEgCode(value: string) {
  const m = value.trim().toUpperCase().replace(/\s+/g, "").match(/^EG-?(\d{1,2})$/);
  if (!m) return "";
  return `EG${m[1].padStart(2, "0")}`;
}

export function resolveArabicGovernorate(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value || value === "غير محدد") return "";

  const direct = BOSTA_CITY_MAP[value] || BOSTA_CITY_MAP[value.toLowerCase()];
  if (direct?.nameAr) return direct.nameAr;

  const eg = normalizeEgCode(value);
  if (eg) {
    for (const entry of Object.values(BOSTA_CITY_MAP)) {
      const codeNorm = entry.code.toUpperCase().replace(/-/g, "");
      if (codeNorm === eg) return entry.nameAr;
    }
  }

  // Match "EG-01" style against map codes loosely
  const upper = value.toUpperCase().replace(/[\s_-]/g, "");
  for (const entry of Object.values(BOSTA_CITY_MAP)) {
    const code = entry.code.toUpperCase().replace(/[\s_-]/g, "");
    if (code === upper) return entry.nameAr;
  }

  if (!looksLikeLocationCode(value)) return value;
  return value;
}

export function parseStateComposite(state: string | null | undefined) {
  const raw = String(state || "").trim();
  if (!raw || !/[-–—]/.test(raw)) return null;
  const parts = raw.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { area: parts[0], governorate: parts.slice(1).join(" - ") };
}

export type LocationFields = {
  governorate: string;
  area: string;
  address: string;
};

/**
 * Resolve Arabic governorate/area for display — safe on old snapshots that stored EG01 codes.
 */
export function resolveSnapshotLocation(input: {
  governorate?: string | null;
  area?: string | null;
  address?: string | null;
  state?: string | null;
  address_2?: string | null;
  city?: string | null;
}): LocationFields {
  const fromState = parseStateComposite(input.state);

  let governorate =
    resolveArabicGovernorate(input.governorate) ||
    resolveArabicGovernorate(input.city) ||
    resolveArabicGovernorate(fromState?.governorate) ||
    "";

  let area = String(input.area || input.address_2 || fromState?.area || "").trim();

  if (looksLikeLocationCode(governorate) && fromState?.governorate) {
    governorate = resolveArabicGovernorate(fromState.governorate) || governorate;
  }
  if ((!area || area === "غير محدد" || looksLikeLocationCode(area)) && fromState?.area) {
    area = fromState.area;
  }
  if (looksLikeLocationCode(area)) {
    area = fromState?.area || "";
  }

  // If address blob contains "area — governorate" leftovers, try parse
  const addr = String(input.address || "").trim();
  if ((!area || area === "غير محدد") && addr.includes("—")) {
    const bits = addr.split(/\s*—\s*/).map((b) => b.trim()).filter(Boolean);
    if (bits.length >= 2) {
      // often street — area — governorate OR street — area
      if (bits.length >= 3) {
        if (!area) area = bits[1];
        if (!governorate || looksLikeLocationCode(governorate)) {
          governorate = resolveArabicGovernorate(bits[2]) || governorate;
        }
      }
    }
  }

  governorate = resolveArabicGovernorate(governorate) || governorate || "غير محدد";
  area = area && !looksLikeLocationCode(area) ? area : area || "غير محدد";
  if (looksLikeLocationCode(area)) area = "غير محدد";

  return {
    governorate,
    area,
    address: addr || "غير محدد",
  };
}

export function extractLocationFromWooBilling(order: {
  billing?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
  };
  shipping?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
  };
  meta_data?: Array<{ key: string; value?: unknown }>;
}): LocationFields {
  const meta = order.meta_data || [];
  const metaGov = metaValue(meta, [
    "_sokany_governorate",
    "sokany_governorate",
    "bosta_city_name",
    "_bosta_city_name",
    "bosta_cityName",
  ]);
  const metaArea = metaValue(meta, [
    "_sokany_area",
    "sokany_area",
    "bosta_district_name",
    "_bosta_district_name",
    "bosta_zone_name",
    "bosta_districtName",
  ]);

  const fromState =
    parseStateComposite(order.billing?.state) || parseStateComposite(order.shipping?.state);

  let governorate =
    resolveArabicGovernorate(metaGov) ||
    resolveArabicGovernorate(order.billing?.city) ||
    resolveArabicGovernorate(order.shipping?.city) ||
    resolveArabicGovernorate(fromState?.governorate) ||
    "";

  let area =
    metaArea ||
    order.billing?.address_2?.trim() ||
    order.shipping?.address_2?.trim() ||
    fromState?.area ||
    "";

  if (looksLikeLocationCode(governorate) && fromState?.governorate) {
    governorate = resolveArabicGovernorate(fromState.governorate) || governorate;
  }
  if ((!area || looksLikeLocationCode(area)) && fromState?.area) {
    area = fromState.area;
  }
  if (looksLikeLocationCode(area)) area = metaArea || fromState?.area || "";

  const street =
    order.billing?.address_1?.trim() || order.shipping?.address_1?.trim() || "غير محدد";

  return resolveSnapshotLocation({
    governorate,
    area,
    address: street,
    state: order.billing?.state || order.shipping?.state,
  });
}
