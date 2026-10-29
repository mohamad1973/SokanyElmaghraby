/** Client-safe helpers (no server-only). */
export function parseWooOrderNumber(value: string | number | null | undefined) {
  const stripped = String(value ?? "").replace(/-(R|X)\d+$/i, "");
  const digits = stripped.replace(/\D/g, "");
  return Number(digits) || 0;
}
