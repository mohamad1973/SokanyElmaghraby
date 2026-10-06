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
};

export type WarehouseBalance = {
  productId: number;
  onlineQty: number | null;
  tenthQty: number | null;
  tenthHomeQty: number | null;
};

const ITEM_NAME_HEADER = "اسمالصنف";
const ACTUAL_QTY_HEADER = "الرصيدالفعلي";

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

export function normStockName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\u0640/g, "")
    .replace(/[\s_\-./\\|]+/g, "");
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
  let nameSpan: CellSpan | null = null;
  let qtySpan: CellSpan | null = null;
  for (let index = 0; index < grid.length; index += 1) {
    const cells = grid[index].map((cell) => cellText(cell));
    const name = findHeaderSpan(cells, ITEM_NAME_HEADER, new Set());
    if (!name) continue;
    const qty = findHeaderSpan(cells, ACTUAL_QTY_HEADER, blockedIndexes([name]));
    if (!qty) continue;
    headerIndex = index;
    nameSpan = name;
    qtySpan = qty;
    break;
  }
  if (headerIndex < 0 || !nameSpan || !qtySpan) {
    return {
      ok: false,
      message: "مش لاقي كلمة اسم الصنف أو الرصيد الفعلي في الملف.",
    };
  }
  const items: BalanceRow[] = [];
  const zeros: BalanceRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const name = spanText(row, nameSpan);
    const qty = parseQty(spanText(row, qtySpan));
    if (!name || qty == null || normHeader(name).includes(ITEM_NAME_HEADER)) continue;
    const entry = { code: name, name, qty };
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
      codeHeader: spanText(grid[headerIndex], nameSpan),
      qtyHeader: spanText(grid[headerIndex], qtySpan),
    },
  };
}

function matchByName(products: CatalogProduct[], rawName: string) {
  const key = normStockName(rawName);
  if (!key) return null;
  const exact = products.filter((product) => normStockName(product.name) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = products.filter((product) => {
    const name = normStockName(product.name);
    const shorter = Math.min(key.length, name.length);
    if (shorter < 6) return false;
    return name.includes(key) || key.includes(name);
  });
  return partial.length === 1 ? partial[0] : null;
}

export function assignWarehouseBalances(input: {
  products: CatalogProduct[];
  online: BalanceRow[];
  tenth: BalanceRow[];
  tenthHome: BalanceRow[];
}) {
  const totals = new Map<number, WarehouseBalance>();
  const ensure = (productId: number) => {
    const current = totals.get(productId);
    if (current) return current;
    const created: WarehouseBalance = { productId, onlineQty: null, tenthQty: null, tenthHomeQty: null };
    totals.set(productId, created);
    return created;
  };
  const apply = (rows: BalanceRow[], field: "onlineQty" | "tenthQty" | "tenthHomeQty") => {
    for (const row of rows) {
      const product = matchByName(input.products, row.name || row.code);
      if (!product) continue;
      const bucket = ensure(product.id);
      bucket[field] = (bucket[field] ?? 0) + row.qty;
    }
  };
  apply(input.online, "onlineQty");
  apply(input.tenth, "tenthQty");
  apply(input.tenthHome, "tenthHomeQty");
  return [...totals.values()];
}
