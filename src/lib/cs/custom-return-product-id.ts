/** Stable negative id for free-text / snapshot products (never collides with Woo product ids). */
export function customReturnProductId(text: string) {
  const normalized = text.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  const positive = (Math.abs(hash) % 900_000_000) + 100_000_000;
  return -positive;
}
