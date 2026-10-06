import { extractModelFromTitle, extractSkFromTitle } from "@/lib/product-display-code";

export type BalanceRow = {
  code: string;
  name: string;
  qty: number;
};

export type ParsedBalanceFile = {
  items: BalanceRow[];
  zeros: BalanceRow[];
  codeHeader: string;
  qtyHeader: string;
};

export type CatalogProduct = {
  id: number;
  name: string;
  sku: string;
  model: string;
  threshold: number;
  systemRecommends: boolean;
};

export type TransferMatrixRow = {
  code: string;
  name: string;
  productId: number;
  onlineQty: number;
  threshold: number;
  tenthQty: number;
  tenthHomeQty: number;
  systemRecommends: boolean;
};

export type UnmatchedBalance = {
  warehouse: string;
  code: string;
  name: string;
  qty: number;
  reason: string;
};

const ITEM_CODE_HEADER = "رمزالصنف";
const ACTUAL_QTY_HEADER = "الرصيدالفعلي";

const NAME_HEADERS = new Set([
  "اسم",
  "الاسم",
  "الصنف",
  "اسمالصنف",
  "البيان",
  "description",
  "name",
  "الوصف",
]);

function normHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-./\\|]+/g, "");
}

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function parseQty(value: unknown) {
  const text = cellText(value)
    .replace(/,/g, "")
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return null;
  return Math.max(0, Math.round(amount));
}

function codeKeys(code: string) {
  const compact = code.trim().toUpperCase().replace(/[\s_\-]+/g, "");
  if (!compact) return [];
  const keys = new Set<string>([compact]);
  const stripped = compact.replace(/^SK/, "");
  if (stripped) keys.add(stripped);
  const fromTitle = extractModelFromTitle(code) || extractSkFromTitle(code);
  if (fromTitle) keys.add(fromTitle.toUpperCase().replace(/[\s_\-]+/g, ""));
  const digits = compact.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length <= 8 && digits.length >= compact.replace(/\D/g, "").length) {
    keys.add(digits);
  }
  return [...keys];
}

export function sheetCodeKey(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

type CellSpan = { start: number; end: number };

function findHeaderSpan(cells: string[], target: string, blocked: Set<number>) {
  const candidates: Array<CellSpan & { rank: number }> = [];
  for (let width = 1; width <= 2; width += 1) {
    for (let start = 0; start <= cells.length - width; start += 1) {
      const end = start + width - 1;
      if (Array.from({ length: width }, (_, offset) => start + offset).some((index) => blocked.has(index))) continue;
      const slice = cells.slice(start, start + width);
      if (slice.every((part) => !normHeader(part))) continue;
      const forward = normHeader(slice.join(""));
      const backward = normHeader([...slice].reverse().join(""));
      let rank = 0;
      if (forward === target) rank = 4;
      else if (width === 2 && backward === target) rank = 3;
      else if (forward.includes(target)) rank = 2;
      else if (width === 2 && backward.includes(target)) rank = 1;
      else continue;
      candidates.push({ start, end, rank });
    }
  }
  candidates.sort(
    (a, b) => b.rank - a.rank || a.end - a.start - (b.end - b.start) || a.start - b.start,
  );
  const found = candidates[0];
  return found ? { start: found.start, end: found.end } : null;
}

function spanText(row: unknown[], span: CellSpan) {
  return Array.from({ length: span.end - span.start + 1 }, (_, offset) => cellText(row[span.start + offset]))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function blockedIndexes(spans: CellSpan[]) {
  const blocked = new Set<number>();
  for (const span of spans) {
    for (let index = span.start; index <= span.end; index += 1) blocked.add(index);
  }
  return blocked;
}

export function parseBalanceGrid(rows: unknown[][]): { ok: true; file: ParsedBalanceFile } | { ok: false; message: string } {
  const grid = rows
    .map((row) => (Array.isArray(row) ? row : []))
    .filter((row) => row.some((cell) => cellText(cell)));
  let headerIndex = -1;
  let codeSpan: CellSpan | null = null;
  let qtySpan: CellSpan | null = null;
  let nameSpan: CellSpan | null = null;
  for (let index = 0; index < grid.length; index += 1) {
    const cells = grid[index].map((cell) => cellText(cell));
    const code = findHeaderSpan(cells, ITEM_CODE_HEADER, new Set());
    if (!code) continue;
    const qty = findHeaderSpan(cells, ACTUAL_QTY_HEADER, blockedIndexes([code]));
    if (!qty) continue;
    headerIndex = index;
    codeSpan = code;
    qtySpan = qty;
    const nameBlocked = blockedIndexes([code, qty]);
    nameSpan =
      findHeaderSpan(cells, "اسمالصنف", nameBlocked) ||
      (() => {
        const nameIndex = cells.findIndex(
          (cell, cellIndex) => !nameBlocked.has(cellIndex) && NAME_HEADERS.has(normHeader(cell)),
        );
        return nameIndex >= 0 ? { start: nameIndex, end: nameIndex } : null;
      })();
    break;
  }
  if (headerIndex < 0 || !codeSpan || !qtySpan) {
    return {
      ok: false,
      message: "مش لاقي كلمة رمز الصنف أو الرصيد الفعلي في الملف.",
    };
  }
  const items: BalanceRow[] = [];
  const zeros: BalanceRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const code = spanText(row, codeSpan);
    const qty = parseQty(spanText(row, qtySpan));
    if (!code || qty == null || normHeader(code).includes(ITEM_CODE_HEADER)) continue;
    const entry = {
      code,
      name: nameSpan ? spanText(row, nameSpan) : "",
      qty,
    };
    if (qty === 0) zeros.push(entry);
    else items.push(entry);
  }
  if (!items.length && !zeros.length) {
    return { ok: false, message: "الملف فيه عناوين بس مفيش أصناف برصيد." };
  }
  return {
    ok: true,
    file: {
      items,
      zeros,
      codeHeader: spanText(grid[headerIndex], codeSpan),
      qtyHeader: spanText(grid[headerIndex], qtySpan),
    },
  };
}

const AMBIGUOUS = Symbol("ambiguous");

function indexProducts(products: CatalogProduct[]) {
  const map = new Map<string, CatalogProduct | typeof AMBIGUOUS>();
  const add = (key: string, product: CatalogProduct) => {
    if (!key) return;
    const existing = map.get(key);
    if (!existing) map.set(key, product);
    else if (existing !== AMBIGUOUS && existing.id !== product.id) map.set(key, AMBIGUOUS);
  };
  for (const product of products) {
    for (const key of [...codeKeys(product.model), ...codeKeys(product.sku), ...codeKeys(product.name)]) {
      add(key, product);
    }
  }
  return map;
}

function matchProduct(map: Map<string, CatalogProduct | typeof AMBIGUOUS>, row: BalanceRow) {
  for (const key of [...codeKeys(row.code), ...codeKeys(row.name)]) {
    const hit = map.get(key);
    if (hit && hit !== AMBIGUOUS) return hit;
  }
  return null;
}

function groupBalances(rows: BalanceRow[]) {
  const grouped = new Map<string, { code: string; name: string; qty: number }>();
  for (const row of rows) {
    const key = sheetCodeKey(row.code);
    if (!key) continue;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { code: row.code.trim(), name: row.name.trim(), qty: row.qty });
      continue;
    }
    current.qty += row.qty;
    if (!current.name && row.name.trim()) current.name = row.name.trim();
  }
  return grouped;
}

export function buildWarehouseTransferReport(input: {
  products: CatalogProduct[];
  online: BalanceRow[];
  onlineZeros?: BalanceRow[];
  tenth: BalanceRow[];
  tenthHome: BalanceRow[];
}) {
  const index = indexProducts(input.products);
  const onlineGroups = groupBalances([...(input.online || []), ...(input.onlineZeros || [])]);
  const onlineKeys = new Set(onlineGroups.keys());
  const tenthGroups = groupBalances(input.tenth.filter((row) => onlineKeys.has(sheetCodeKey(row.code))));
  const tenthHomeGroups = groupBalances(input.tenthHome.filter((row) => onlineKeys.has(sheetCodeKey(row.code))));
  const unmatched: UnmatchedBalance[] = [];
  const rows: TransferMatrixRow[] = [];

  for (const [key, entry] of onlineGroups) {
    const product = matchProduct(index, { code: entry.code, name: entry.name, qty: entry.qty });
    const tenthQty = tenthGroups.get(key)?.qty ?? 0;
    const tenthHomeQty = tenthHomeGroups.get(key)?.qty ?? 0;
    if (!product) {
      unmatched.push({
        warehouse: "أونلاين",
        code: entry.code,
        name: entry.name,
        qty: entry.qty,
        reason: "مش مطابق لصنف على الموقع",
      });
      continue;
    }
    if (product.threshold <= 0) {
      unmatched.push({
        warehouse: "أونلاين",
        code: entry.code,
        name: product.name || entry.name,
        qty: entry.qty,
        reason: "لم يُحفظ له حد طلب",
      });
      continue;
    }
    if (entry.qty > product.threshold) continue;
    if (tenthQty <= 0 && tenthHomeQty <= 0) continue;
    rows.push({
      code: entry.code,
      name: product.name || entry.name,
      productId: product.id,
      onlineQty: entry.qty,
      threshold: product.threshold,
      tenthQty,
      tenthHomeQty,
      systemRecommends: product.systemRecommends,
    });
  }

  rows.sort((a, b) => {
    if (a.systemRecommends !== b.systemRecommends) return a.systemRecommends ? -1 : 1;
    return a.onlineQty - b.onlineQty || a.name.localeCompare(b.name, "ar");
  });

  return { rows, unmatched };
}
