/** Match CS order-card areas to a courier's area list. */

export function compactArea(value: string) {
  return value
    .trim()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/^ال/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function areasMatch(orderArea: string, courierArea: string) {
  const order = compactArea(orderArea);
  const zone = compactArea(courierArea);
  if (!order || !zone) return false;
  if (order === zone) return true;
  if (order.length >= 4 && zone.length >= 4 && (order.startsWith(zone) || zone.startsWith(order))) return true;
  return false;
}

export function orderMatchesAreas(orderArea: string, courierAreas: string[]) {
  return courierAreas.some((area) => areasMatch(orderArea, area));
}

export function parseCourierAreas(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 40);
  } catch {
    return [];
  }
}

export function serializeCourierAreas(areas: string[]) {
  return JSON.stringify(
    [...new Set(areas.map((area) => area.trim()).filter((area) => area.length > 0 && area.length <= 80))].slice(0, 40),
  );
}
