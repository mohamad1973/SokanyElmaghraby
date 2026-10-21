import "server-only";

import { isDisplayablePlaceName } from "@/lib/cs/resolve-location";

function hasNamedItems(items: unknown) {
  if (!Array.isArray(items)) return false;
  return items.some((raw) => {
    if (!raw || typeof raw !== "object") return false;
    return Boolean(String((raw as { name?: unknown }).name || "").trim());
  });
}

/** Fill missing product names / place fields from Woo when the CS snapshot is thin. */
export async function hydrateWaybillSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  wooOrderId: number,
): Promise<Record<string, unknown>> {
  const snap: Record<string, unknown> = { ...(snapshot || {}) };
  const named = hasNamedItems(snap.items);
  const govOk = isDisplayablePlaceName(String(snap.governorate || ""));
  if (named && govOk) return snap;
  try {
    const { getAdminOrder } = await import("@/lib/orders");
    const order = await getAdminOrder(String(wooOrderId));
    if (!order) return snap;
    if (!named && order.items?.length) snap.items = order.items;
    if (!govOk && isDisplayablePlaceName(order.governorate)) snap.governorate = order.governorate;
    if (!isDisplayablePlaceName(String(snap.area || "")) && isDisplayablePlaceName(order.area)) {
      snap.area = order.area;
    }
  } catch {
    /* keep the CS snapshot as-is */
  }
  return snap;
}
