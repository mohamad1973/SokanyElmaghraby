/** Client-safe helpers (no server-only). */
export function parseWooOrderNumber(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return Number(digits) || 0;
}
