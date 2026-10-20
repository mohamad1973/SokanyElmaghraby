/** Bosta fields for a Temima / Eid / Momen return or exchange waybill. */

export type DeskFulfillmentKind = "return" | "exchange";

export type FulfillmentWaybillDraft = {
  deliveryKind: DeskFulfillmentKind;
  /**
   * Amount printed on the Bosta sticker.
   * Return (type 25): refund value paid to the customer.
   * Exchange (type 30): cash collected from the customer (0 when refunding a difference).
   */
  cod: number;
  description: string;
  itemsCount: number;
};

type SnapshotItem = {
  name?: unknown;
  quantity?: unknown;
  role?: unknown;
};

function moneyAbs(snapshot: Record<string, unknown>) {
  const absField = Number(snapshot.settlementAbs);
  if (Number.isFinite(absField) && absField > 0) return Math.round(absField * 100) / 100;
  const raw = String(snapshot.waybillTotal ?? snapshot.total ?? "")
    .trim()
    .replace(/,/g, "");
  const parsed = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function directionOf(snapshot: Record<string, unknown>, abs: number): "collect" | "refund" | "none" {
  const explicit = String(snapshot.settlementDirection || "").trim();
  if (explicit === "collect" || explicit === "refund" || explicit === "none") return explicit;
  const raw = String(snapshot.waybillTotal ?? snapshot.total ?? "").trim();
  if (raw.startsWith("-")) return "refund";
  if (abs > 0) return "collect";
  return "none";
}

function formatMoney(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function cleanItemName(name: string) {
  return name
    .replace(/\s*\((خارج|راجع)\)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatItemLine(item: SnapshotItem) {
  const name = cleanItemName(String(item.name || ""));
  if (!name) return null;
  const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
  return { text: qty > 1 ? `${name} ×${qty}` : name, qty };
}

function itemParts(items: unknown) {
  const list = Array.isArray(items) ? (items as SnapshotItem[]) : [];
  const outbound: string[] = [];
  const returning: string[] = [];
  let count = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const line = formatItemLine(item);
    if (!line) continue;
    count += line.qty;
    const role = String(item.role || "").trim();
    if (role === "outbound") outbound.push(line.text);
    else returning.push(line.text);
  }
  return { outbound, returning, count };
}

/**
 * Desk return/exchange → Bosta description + COD.
 * Description always starts with استرجاع / استبدال and lists outbound + return product names.
 */
export function fulfillmentWaybillDraft(
  snapshot: Record<string, unknown> | null | undefined,
): FulfillmentWaybillDraft | null {
  const kind = String(snapshot?.fulfillmentKind || "").trim();
  if (kind !== "return" && kind !== "exchange") return null;
  const snap = snapshot || {};
  const abs = moneyAbs(snap);
  const direction = directionOf(snap, abs);
  const items = itemParts(snap.items);
  const kindLabel = kind === "return" ? "استرجاع" : "استبدال";
  const parts: string[] = [kindLabel];
  if (kind === "exchange" && items.outbound.length) {
    parts.push(`خارج: ${items.outbound.join(" + ")}`);
  }
  if (items.returning.length) {
    parts.push(`راجع: ${items.returning.join(" + ")}`);
  } else if (!items.outbound.length) {
    parts.push(kindLabel);
  }

  let cod = 0;
  if (kind === "return") {
    // CRP (type 25): print the refund amount as the sticker value.
    if (abs > 0) cod = abs;
  } else if (direction === "collect" && abs > 0) {
    cod = abs;
  } else if (direction === "refund" && abs > 0) {
    parts.push(`رد فرق ${formatMoney(abs)} ج.م`);
  }

  const description = parts.join(" — ").replace(/\s+/g, " ").trim().slice(0, 500);
  return {
    deliveryKind: kind,
    cod,
    description,
    itemsCount: Math.max(1, items.count || 1),
  };
}

/** Type 25 picks the parcel up from the customer. Type 30 delivers the replacement there. */
export function deskFulfillmentDeliveryFields(input: {
  kind: DeskFulfillmentKind;
  cod: number;
  description: string;
  itemsCount: number;
  address: Record<string, unknown>;
}) {
  const kindLabel = input.kind === "return" ? "استرجاع" : "استبدال";
  const description = input.description.trim().slice(0, 500) || kindLabel;
  const specs = {
    packageType: "Parcel",
    size: "SMALL",
    packageDetails: {
      description,
      itemsCount: Math.max(1, Math.round(Number(input.itemsCount) || 1)),
    },
  };
  const cod = Math.max(0, Math.round(Number(input.cod) * 100) / 100);
  if (input.kind === "return") {
    return { type: 25 as const, cod, specs, pickupAddress: input.address };
  }
  return { type: 30 as const, cod, specs, dropOffAddress: input.address };
}
