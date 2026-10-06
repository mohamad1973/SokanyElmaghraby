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
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!text || text === "-") return null;
  const amount = Number(text);
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

export function parseBalanceGrid(rows: unknown[][]): { ok: true; file: ParsedBalanceFile } | { ok: false; message: string } {
  const grid = rows
    .map((row) => (Array.isArray(row) ? row : []))
    .filter((row) => row.some((cell) => cellText(cell)));
  let headerIndex = -1;
  let codeIndex = -1;
  let qtyIndex = -1;
  let nameIndex = -1;
  const scanLimit = Math.min(grid.length, 15);
  for (let index = 0; index < scanLimit; index += 1) {
    const cells = grid[index].map((cell) => normHeader(cellText(cell)));
    const code = cells.findIndex((cell) => cell === ITEM_CODE_HEADER);
    const qty = cells.findIndex((cell) => cell === ACTUAL_QTY_HEADER);
    if (code >= 0 && qty >= 0) {
      headerIndex = index;
      codeIndex = code;
      qtyIndex = qty;
      nameIndex = cells.findIndex((cell) => NAME_HEADERS.has(cell));
      break;
    }
  }
  if (headerIndex < 0) {
    return {
      ok: false,
      message: "مش لاقي عمود رمز الصنف، أو عمود الرصيد الفعلي، في أول صفوف الملف.",
    };
  }
  const items: BalanceRow[] = [];
  const zeros: BalanceRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const code = cellText(row[codeIndex]);
    const qty = parseQty(row[qtyIndex]);
    if (!code || qty == null) continue;
    const entry = {
      code,
      name: nameIndex >= 0 ? cellText(row[nameIndex]) : "",
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
      codeHeader: cellText(grid[headerIndex][codeIndex]),
      qtyHeader: cellText(grid[headerIndex][qtyIndex]),
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
