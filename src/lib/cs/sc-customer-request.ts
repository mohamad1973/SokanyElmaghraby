export const SC_CUSTOMER_REQUESTS = [
  { id: "inspect_return_to_customer", label: "استرجاع للفحص ويعود للعميل" },
  { id: "cash_refund", label: "استرجاع بمقابل نقدي" },
  { id: "exchange_new", label: "استبدال بجديد" },
  { id: "exchange_other", label: "استبدال بمنتج آخر" },
] as const;

export type ScCustomerRequestId = (typeof SC_CUSTOMER_REQUESTS)[number]["id"];

const LABEL_BY_ID = Object.fromEntries(SC_CUSTOMER_REQUESTS.map((row) => [row.id, row.label])) as Record<
  ScCustomerRequestId,
  string
>;

export function isScCustomerRequestId(value: string): value is ScCustomerRequestId {
  return SC_CUSTOMER_REQUESTS.some((row) => row.id === value);
}

/** Maps stored code to Arabic; keeps legacy free-text as-is. */
export function customerRequestLabel(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isScCustomerRequestId(text)) return LABEL_BY_ID[text];
  return text;
}
